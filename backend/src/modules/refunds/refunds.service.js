const db = require('../../infrastructure/database/db.client');
const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const refundsRepository = require('./refunds.repository');

class RefundsService {
  async submitRefundRequest(customerId, payload) {
    let {
      order_id,
      ticket_id,
      reason,
      customer_note,
      refund_method,
      bank_name,
      bank_account_number,
      bank_account_name,
      bank_info,
    } = payload;

    if (customer_note) {
      reason = `${reason} (Ghi chú: ${customer_note})`;
    }

    if (bank_info) {
      bank_name = bank_name || bank_info.bank_name;
      bank_account_number = bank_account_number || bank_info.account_number;
      bank_account_name = bank_account_name || bank_info.account_holder;
    }

    const data = await refundsRepository.findOrderAndTicketForRefund(order_id, ticket_id, customerId);
    if (!data) {
      throw new AppError('Đơn hàng hoặc vé không tồn tại hoặc không thuộc về bạn', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    order_id = data.order_id;
    ticket_id = data.ticket_id || ticket_id || null;

    if (!['PAID', 'REFUND_REQUESTED'].includes(data.order_status)) {
      throw new AppError('Chỉ có thể yêu cầu hoàn tiền cho đơn hàng đã thanh toán thành công', 400, ErrorCodes.INVALID_INPUT);
    }

    if (ticket_id) {
      if (data.ticket_status !== 'VALID') {
        throw new AppError(`Vé này đang ở trạng thái "${data.ticket_status}" và không thể hoàn`, 400, ErrorCodes.INVALID_INPUT);
      }
      if (data.checked_in_at) {
        throw new AppError('Vé đã được check-in sử dụng tại sự kiện, không thể hoàn', 400, ErrorCodes.INVALID_INPUT);
      }
    }

    const rawPolicy = data.event_refund_policy;
    const refundPolicy = typeof rawPolicy === 'string' ? JSON.parse(rawPolicy) : (rawPolicy || {});

    if (refundPolicy.allow_refunds === false) {
      throw new AppError('Sự kiện này không áp dụng chính sách hoàn vé theo quy định của nhà tổ chức', 400, ErrorCodes.INVALID_INPUT);
    }

    const deadlineDays = Number(refundPolicy.deadline_days || 0);
    if (data.event_start_time && deadlineDays > 0) {
      const startTime = new Date(data.event_start_time).getTime();
      const now = Date.now();
      const diffDays = (startTime - now) / (1000 * 60 * 60 * 24);

      if (diffDays < deadlineDays) {
        throw new AppError(
          `Đã quá thời hạn yêu cầu hoàn vé. Chính sách yêu cầu gửi trước ít nhất ${deadlineDays} ngày trước khi sự kiện diễn ra`,
          400,
          ErrorCodes.INVALID_INPUT,
        );
      }
    }

    const existing = await refundsRepository.findExistingActiveRefund(order_id, ticket_id);
    if (existing) {
      throw new AppError('Vé hoặc đơn hàng này đã có yêu cầu hoàn tiền đang được xử lý hoặc đã hoàn tất', 400, ErrorCodes.INVALID_INPUT);
    }

    let refundAmount = 0;
    if (ticket_id) {
      refundAmount = Number(data.ticket_final_price || data.ticket_unit_price || 0);
    } else {
      refundAmount = Number(data.order_total_amount || 0);
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const created = await refundsRepository.create(
        {
          order_id,
          ticket_id: ticket_id || null,
          event_id: data.event_id,
          customer_id: customerId,
          organizer_id: data.organizer_id,
          refund_amount: refundAmount,
          reason,
          refund_method,
          bank_name,
          bank_account_number,
          bank_account_name,
        },
        client,
      );

      await client.query(
        `UPDATE orders SET status = 'REFUND_REQUESTED', updated_at = now() WHERE id = $1`,
        [order_id],
      );

      await client.query('COMMIT');
      return created;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getCustomerRefunds(customerId, filters = {}) {
    const list = await refundsRepository.findByCustomer(customerId, filters);
    return list.map(this.mapRefund);
  }

  async getRefundDetail(refundId, userId, userRole) {
    const refund = await refundsRepository.findById(refundId);
    if (!refund) {
      throw new AppError('Không tìm thấy yêu cầu hoàn tiền', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    if (userRole === 'ADMIN' || userRole === 'admin') {
      return this.mapRefund(refund);
    }

    if (userRole === 'CUSTOMER' || userRole === 'user') {
      if (refund.customer_id !== userId) {
        throw new AppError('Bạn không có quyền xem yêu cầu hoàn tiền này', 403, ErrorCodes.FORBIDDEN);
      }
    } else if (userRole === 'ORGANIZER' || userRole === 'organizer') {
      const isOwner =
        refund.organizer_id === userId ||
        (refund.event_id && (await refundsRepository.isEventOwnedByUser(refund.event_id, userId)));
      if (!isOwner) {
        throw new AppError('Yêu cầu hoàn tiền không thuộc sự kiện của bạn', 403, ErrorCodes.FORBIDDEN);
      }
    }

    return this.mapRefund(refund);
  }

  async getOrganizerRefunds(organizerUserId, filters = {}, userRole = 'ORGANIZER') {
    const list = await refundsRepository.findByOrganizer(organizerUserId, filters, userRole);
    return list.map(this.mapRefund);
  }

  async processRefundByOrganizer(organizerUserId, refundId, payload, reviewerId, userRole = 'ORGANIZER') {
    const refund = await refundsRepository.findById(refundId);
    if (!refund) {
      throw new AppError('Không tìm thấy yêu cầu hoàn tiền', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    if (userRole !== 'ADMIN' && userRole !== 'admin') {
      const isOwner =
        refund.organizer_id === organizerUserId ||
        (refund.event_id && (await refundsRepository.isEventOwnedByUser(refund.event_id, organizerUserId)));
      if (!isOwner) {
        throw new AppError('Yêu cầu hoàn tiền không thuộc sự kiện của bạn', 403, ErrorCodes.FORBIDDEN);
      }
    }

    if (refund.status === 'REFUNDED') {
      throw new AppError('Yêu cầu hoàn tiền này đã được hoàn tất trước đó', 400, ErrorCodes.INVALID_INPUT);
    }

    const { action, proof_url, transaction_ref } = payload;
    const note = payload.organizer_note || payload.reject_reason || payload.note;
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      if (action === 'REJECT') {
        const updated = await refundsRepository.updateStatus(
          refundId,
          {
            status: 'REJECTED',
            organizer_note: note || 'Nhà tổ chức từ chối yêu cầu hoàn tiền.',
            processed_by_id: reviewerId,
            reviewed_at: new Date(),
          },
          client,
        );

        // Check if other active pending refund requests exist on this order
        const otherPending = await client.query(
          `SELECT 1 FROM refund_requests WHERE order_id = $1 AND id != $2 AND status IN ('PENDING', 'APPROVED') LIMIT 1`,
          [refund.order_id, refundId],
        );
        if (otherPending.rows.length === 0) {
          await client.query(
            `UPDATE orders SET status = 'PAID', updated_at = now() WHERE id = $1 AND status = 'REFUND_REQUESTED'`,
            [refund.order_id],
          );
        }

        await client.query('COMMIT');
        return this.mapRefund(updated);
      }

      if (action === 'APPROVE') {
        const updated = await refundsRepository.updateStatus(
          refundId,
          {
            status: 'APPROVED',
            organizer_note: note || 'Yêu cầu hoàn tiền đã được phê duyệt.',
            organizer_proof_url: proof_url || null,
            organizer_transaction_ref: transaction_ref || null,
            processed_by_id: reviewerId,
            reviewed_at: new Date(),
          },
          client,
        );

        await client.query('COMMIT');
        return this.mapRefund(updated);
      }

      if (action === 'REFUND' || action === 'CONFIRM_REFUNDED') {
        const updated = await refundsRepository.updateStatus(
          refundId,
          {
            status: 'REFUNDED',
            organizer_note: note || 'Đã hoàn tiền thành công.',
            organizer_proof_url: proof_url || null,
            organizer_transaction_ref: transaction_ref || null,
            processed_by_id: reviewerId,
            reviewed_at: refund.reviewed_at || new Date(),
            refunded_at: new Date(),
          },
          client,
        );

        // Update ticket & order status
        await refundsRepository.setTicketAndOrderStatus(
          refund.order_id,
          refund.ticket_id,
          'REFUNDED',
          'REFUNDED',
          client,
        );

        await client.query('COMMIT');
        return this.mapRefund(updated);
      }

      throw new AppError('Hành động xử lý không hợp lệ', 400, ErrorCodes.INVALID_INPUT);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  mapRefund(row) {
    if (!row) return null;
    return {
      id: row.id,
      order_id: row.order_id,
      ticket_id: row.ticket_id,
      event_id: row.event_id,
      customer_id: row.customer_id,
      organizer_id: row.organizer_id,
      refund_amount: Number(row.refund_amount || 0),
      reason: row.reason,
      status: row.status,
      refund_method: row.refund_method,
      bank_name: row.bank_name,
      bank_account_number: row.bank_account_number,
      bank_account_name: row.bank_account_name,
      organizer_note: row.organizer_note,
      proof_url: row.organizer_proof_url,
      transaction_ref: row.organizer_transaction_ref,
      processed_by_id: row.processed_by_id,
      requested_at: row.requested_at,
      reviewed_at: row.reviewed_at,
      refunded_at: row.refunded_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      event: {
        id: row.event_id,
        title: row.event_title,
        banner_url: row.event_banner_url,
        start_time: row.event_start_time,
        refund_policy: row.event_refund_policy,
      },
      order: {
        id: row.order_id,
        order_code: row.order_code,
        total_amount: Number(row.order_total_amount || 0),
        status: row.order_status,
      },
      ticket: row.ticket_id
        ? {
            id: row.ticket_id,
            ticket_code: row.ticket_code,
            status: row.ticket_status,
            ticket_type: {
              name: row.ticket_type_name,
            },
          }
        : null,
      customer: {
        id: row.customer_id,
        full_name: row.customer_name,
        email: row.customer_email,
        phone: row.customer_phone,
      },
      processed_by: row.processed_by_id
        ? {
            id: row.processed_by_id,
            full_name: row.processed_by_name,
          }
        : null,
    };
  }
}

module.exports = new RefundsService();
