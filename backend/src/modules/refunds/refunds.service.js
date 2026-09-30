const db = require('../../infrastructure/database/db.client');
const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const logger = require('../../core/logger');
const refundsRepository = require('./refunds.repository');
const refundRuleEngine = require('./refundRuleEngine');
const payosRefundService = require('./payosRefund.service');
const notificationsService = require('../notifications/notifications.service');

class RefundsService {
  /**
   * Customer submits a refund request for a ticket or order.
   * Performs validation via RefundRuleEngine, locks ticket atomically in REFUND_PENDING,
   * updates order status to REFUND_REQUESTED, creates the refund_requests row, and notifies organizer.
   */
  async submitRefundRequest(customerId, payload) {
    let {
      order_id,
      ticket_id,
      reason,
      customer_note,
      refund_method = 'PAYOS',
      bank_name,
      bank_account_number,
      bank_account_name,
      bank_info,
    } = payload;

    if (bank_info) {
      bank_name = bank_name || bank_info.bank_name;
      bank_account_number = bank_account_number || bank_info.account_number;
      bank_account_name = bank_account_name || bank_info.account_holder;
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // 1. Fetch order and ticket with row-level lock
      const data = await refundsRepository.getRefundContext(
        customerId,
        order_id,
        ticket_id,
        client,
        true,
      );

      if (!data) {
        throw new AppError(
          'Đơn hàng hoặc vé không tồn tại hoặc không thuộc về bạn.',
          404,
          ErrorCodes.RESOURCE_NOT_FOUND,
        );
      }

      order_id = data.order_id;
      ticket_id = data.ticket_id || ticket_id || null;

      // 2. Check existing active refund
      const existing = await refundsRepository.findExistingActiveRefund(order_id, ticket_id, client);

      // 3. Evaluate eligibility and calculate net refund amount via Rule Engine
      const validation = refundRuleEngine.evaluateEligibility({
        ticket: ticket_id
          ? {
              id: ticket_id,
              customer_id: data.customer_id,
              status: data.ticket_status,
              checked_in_at: data.checked_in_at,
              session_seat_id: data.session_seat_id,
              session_start_time: data.session_start_time,
              session_end_time: data.session_end_time,
              final_price: data.ticket_final_price,
              unit_price: data.ticket_unit_price,
              refund_policy_snapshot: data.ticket_refund_policy_snapshot,
            }
          : null,
        order: {
          id: order_id,
          user_id: data.customer_id,
          status: data.order_status,
          total_amount: data.order_total_amount,
          subtotal: data.order_subtotal,
          discount_amount: data.order_discount_amount,
          platform_fee: data.order_platform_fee,
        },
        event: {
          id: data.event_id,
          start_time: data.event_start_time,
          end_time: data.event_end_time,
          refund_policy: data.event_refund_policy,
        },
        activeRefund: existing,
        customerId,
        reason,
        customerNote: customer_note,
        validateReason: true,
      });

      if (!validation.eligible) {
        throw new AppError(
          validation.reason || 'Yêu cầu hoàn tiền không hợp lệ theo chính sách của sự kiện.',
          400,
          validation.errorCode || ErrorCodes.INVALID_INPUT,
        );
      }

      const fullReason = customer_note ? `${reason} (Ghi chú: ${customer_note})` : reason;

      // 4. Temporarily lock the ticket to REFUND_PENDING
      if (ticket_id) {
        const lockedTicket = await refundsRepository.lockTicketForRefund(ticket_id, client);
        if (!lockedTicket) {
          throw new AppError(
            'Vé không ở trạng thái hợp lệ để khóa hoàn tiền (có thể đã được xử lý hoặc thay đổi trạng thái).',
            409,
            ErrorCodes.CONFLICT,
          );
        }
      }

      // 5. Update order status to REFUND_REQUESTED
      await client.query(
        `UPDATE orders SET status = 'REFUND_REQUESTED', updated_at = now() WHERE id = $1`,
        [order_id],
      );

      // 6. Create refund_requests record with PENDING status
      const created = await refundsRepository.create(
        {
          order_id,
          ticket_id: ticket_id || null,
          event_id: data.event_id,
          customer_id: customerId,
          organizer_id: data.organizer_id,
          refund_amount: validation.refundableAmount,
          refund_rate: validation.refundRate,
          policy_snapshot: validation.policy,
          reason: fullReason,
          refund_method,
          bank_name,
          bank_account_number,
          bank_account_name,
        },
        client,
      );

      await client.query('COMMIT');

      // 7. Asynchronous Notification to Organizer
      try {
        if (data.organizer_id) {
          notificationsService
            .createAndDispatch({
              userId: data.organizer_id,
              eventId: data.event_id,
              title: 'Yêu cầu hoàn tiền vé mới',
              content: `Có yêu cầu hoàn vé mới cho sự kiện "${data.event_title}". Mã vé: ${data.ticket_code || 'N/A'}, số tiền: ${validation.refundableAmount.toLocaleString('vi-VN')} VND.`,
              type: 'PAYMENT',
            })
            .catch((err) =>
              logger.warn(`[NOTIFY_ORGANIZER_REFUND_FAIL] ${err.message}`),
            );
        }
      } catch (notifyErr) {
        logger.warn(`[NOTIFY_ORGANIZER_FAIL] ${notifyErr.message}`);
      }

      return this.mapRefund(created);
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
      throw new AppError('Không tìm thấy yêu cầu hoàn tiền.', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    if (userRole === 'ADMIN' || userRole === 'admin') {
      return this.mapRefund(refund);
    }

    if (userRole === 'CUSTOMER' || userRole === 'user') {
      if (refund.customer_id !== userId) {
        throw new AppError('Bạn không có quyền xem yêu cầu hoàn tiền này.', 403, ErrorCodes.AUTH_FORBIDDEN);
      }
    } else if (userRole === 'ORGANIZER' || userRole === 'organizer') {
      const isOwner =
        refund.organizer_id === userId ||
        (refund.event_id && (await refundsRepository.isEventOwnedByUser(refund.event_id, userId)));
      if (!isOwner) {
        throw new AppError('Yêu cầu hoàn tiền không thuộc sự kiện của bạn.', 403, ErrorCodes.AUTH_FORBIDDEN);
      }
    }

    return this.mapRefund(refund);
  }

  async getOrganizerRefunds(organizerUserId, filters = {}, userRole = 'ORGANIZER') {
    const list = await refundsRepository.findByOrganizer(organizerUserId, filters, userRole);
    return list.map(this.mapRefund);
  }

  /**
   * Organizer approves or rejects a refund request.
   * If REJECT: reverts ticket from REFUND_PENDING to VALID, restores order to PAID if no other pending refunds.
   * If APPROVE: calls PayOSRefundService (or handles manual bank transfer confirmation),
   * invalidates ticket to REFUNDED, releases seat, and records transaction details.
   */
  async processRefundByOrganizer(
    organizerUserId,
    refundId,
    payload,
    reviewerId,
    userRole = 'ORGANIZER',
    options = {},
  ) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const refund = await refundsRepository.findByIdForUpdate(refundId, client);
      if (!refund) {
        throw new AppError('Không tìm thấy yêu cầu hoàn tiền.', 404, ErrorCodes.RESOURCE_NOT_FOUND);
      }

      // Check ownership
      if (userRole !== 'ADMIN' && userRole !== 'admin') {
        const isOwner =
          refund.organizer_id === organizerUserId ||
          (refund.event_id && (await refundsRepository.isEventOwnedByUser(refund.event_id, organizerUserId)));
        if (!isOwner) {
          throw new AppError('Yêu cầu hoàn tiền không thuộc sự kiện của bạn.', 403, ErrorCodes.AUTH_FORBIDDEN);
        }
      }

      // Concurrency & idempotency check (Report 3: 3.7.12 & Abnormal Cases)
      if (refund.status !== 'PENDING' && refund.status !== 'FAILED') {
        throw new AppError(
          'Yêu cầu này đã được xử lý bởi người dùng khác hoặc đã hoàn tất.',
          409,
          ErrorCodes.REFUND_ALREADY_PROCESSED,
        );
      }

      const { action, proof_url, transaction_ref, refund_method } = payload;
      const note = payload.organizer_note || payload.reject_reason || payload.note;

      // ─────────────────────────────────────────────────────────────
      // Case 1: Organizer REJECTS Request
      // ─────────────────────────────────────────────────────────────
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

        // Unlock ticket: REFUND_PENDING -> VALID
        if (refund.ticket_id) {
          await refundsRepository.unlockTicketFromRefund(refund.ticket_id, client);
        }

        // Restore order status to PAID if no other pending refund requests exist
        const otherPending = await client.query(
          `SELECT 1 FROM refund_requests WHERE order_id = $1 AND id != $2 AND status IN ('PENDING', 'APPROVED', 'PROCESSING') LIMIT 1`,
          [refund.order_id, refundId],
        );
        if (otherPending.rows.length === 0) {
          await client.query(
            `UPDATE orders SET status = 'PAID', updated_at = now() WHERE id = $1 AND status = 'REFUND_REQUESTED'`,
            [refund.order_id],
          );
        }

        await client.query('COMMIT');

        // Notify customer
        try {
          notificationsService
            .createAndDispatch(
              {
                userId: refund.customer_id,
                eventId: refund.event_id,
                title: 'Yêu cầu hoàn tiền vé đã bị từ chối',
                content: `Yêu cầu hoàn tiền cho vé ${refund.ticket_code || 'đơn hàng ' + refund.order_code} đã bị từ chối. Lý do: ${note || 'Không đủ điều kiện theo chính sách'}.`,
                type: 'PAYMENT',
              },
              { email: refund.customer_email },
            )
            .catch((err) => logger.warn(`[NOTIFY_REFUND_REJECT_FAIL] ${err.message}`));
        } catch (e) {
          // ignore
        }

        return this.mapRefund(updated);
      }

      // ─────────────────────────────────────────────────────────────
      // Case 2: Organizer APPROVES Request (Automated PayOS or Manual)
      // ─────────────────────────────────────────────────────────────
      if (action === 'APPROVE' || action === 'REFUND' || action === 'CONFIRM_REFUNDED') {
        const isManual = action === 'REFUND' || action === 'CONFIRM_REFUNDED' || refund_method === 'MANUAL_BANK_TRANSFER' || Boolean(proof_url || transaction_ref);

        let finalTransactionRef = transaction_ref || null;
        let finalProofUrl = proof_url || null;
        let finalNote = note;

        if (!isManual) {
          // Automated Gateway API via PayOS
          const paymentOrder = await refundsRepository.findPaymentOrderWithChannel(refund.order_id, client);

          // Query latest channel configuration from organizer_payment_channels to ensure any recent updates to Kênh chi keys are included
          let effectiveChannel = paymentOrder;
          try {
            const latestChannelRes = await client.query(
              `SELECT * FROM organizer_payment_channels 
               WHERE organizer_id = (SELECT organizer_id FROM events WHERE id = $1)
                  OR organizer_id = $2
                  OR organizer_id IN (SELECT id FROM organizers WHERE user_id = $2)
               ORDER BY updated_at DESC LIMIT 1`,
              [refund.event_id, refund.organizer_id]
            );
            const latest = latestChannelRes.rows[0];
            if (latest) {
              effectiveChannel = {
                ...paymentOrder,
                client_id: latest.client_id || paymentOrder?.client_id,
                api_key_encrypted: latest.api_key_encrypted || paymentOrder?.api_key_encrypted,
                checksum_key_encrypted: latest.checksum_key_encrypted || paymentOrder?.checksum_key_encrypted,
                payout_client_id: latest.payout_client_id ?? paymentOrder?.payout_client_id,
                payout_api_key_encrypted: latest.payout_api_key_encrypted ?? paymentOrder?.payout_api_key_encrypted,
                payout_checksum_key_encrypted: latest.payout_checksum_key_encrypted ?? paymentOrder?.payout_checksum_key_encrypted,
                payout_status: latest.payout_status ?? paymentOrder?.payout_status,
              };
            }
          } catch (channelLookupErr) {
            // Fallback gracefully to paymentOrder
          }

          const payosResult = await payosRefundService.processRefund({
            refundRequest: refund,
            paymentOrder,
            channel: effectiveChannel,
            amount: payload.final_refund_amount || refund.refund_amount,
            options,
          });

          if (!payosResult.success) {
            // PayOS gateway returned failure or timed out:
            // Keep ticket locked in REFUND_PENDING, record error note and mark FAILED for retry/manual transfer
            await refundsRepository.updateStatus(
              refundId,
              {
                status: 'FAILED',
                organizer_note: `Giao dịch hoàn tiền qua Cổng thanh toán thất bại: ${payosResult.error}. Vui lòng kiểm tra lại tài khoản hoặc chuyển thủ công.`,
                processed_by_id: reviewerId,
                reviewed_at: new Date(),
              },
              client,
            );

            await client.query('COMMIT');

            throw new AppError(
              `Giao dịch hoàn tiền qua Cổng thanh toán thất bại: ${payosResult.error}. Vui lòng kiểm tra lại tài khoản hoặc chuyển thủ công.`,
              400,
              payosResult.errorCode || 'GATEWAY_ERROR',
            );
          }

          finalTransactionRef = payosResult.transactionId;
          finalNote = finalNote || `Đã hoàn tiền tự động qua PayOS (Mã GD: ${finalTransactionRef})`;
        } else {
          finalNote = finalNote || `Đã hoàn tiền thủ công qua chuyển khoản ngân hàng (Mã GD: ${finalTransactionRef || 'N/A'})`;
        }

        // Permanently invalidate the ticket: REFUND_PENDING -> REFUNDED
        if (refund.ticket_id) {
          await refundsRepository.invalidateTicketForRefund(refund.ticket_id, client);

          // Release seat quota if seated event
          if (refund.session_seat_id) {
            await refundsRepository.releaseSessionSeat(refund.session_seat_id, client);
          }
        }

        // Check if all tickets for this order are now refunded/cancelled
        const remainingActive = await refundsRepository.countActiveOrderTickets(refund.order_id, client);
        if (remainingActive === 0) {
          await client.query(
            `UPDATE orders SET status = 'REFUNDED', updated_at = now() WHERE id = $1`,
            [refund.order_id],
          );
        }

        // Update refund request status to REFUNDED
        const updated = await refundsRepository.updateStatus(
          refundId,
          {
            status: 'REFUNDED',
            refund_amount: payload.final_refund_amount || refund.refund_amount,
            organizer_note: finalNote,
            organizer_proof_url: finalProofUrl,
            organizer_transaction_ref: finalTransactionRef,
            processed_by_id: reviewerId,
            reviewed_at: refund.reviewed_at || new Date(),
            refunded_at: new Date(),
          },
          client,
        );

        await client.query('COMMIT');

        // Notify customer of successful refund
        try {
          notificationsService
            .createAndDispatch(
              {
                userId: refund.customer_id,
                eventId: refund.event_id,
                title: 'Hoàn tiền vé thành công',
                content: `Yêu cầu hoàn tiền vé ${refund.ticket_code || 'đơn ' + refund.order_code} đã hoàn tất. Số tiền: ${Number(updated.refund_amount).toLocaleString('vi-VN')} VND.`,
                type: 'PAYMENT',
              },
              { email: refund.customer_email },
            )
            .catch((err) => logger.warn(`[NOTIFY_REFUND_SUCCESS_FAIL] ${err.message}`));
        } catch (e) {
          // ignore
        }

        return this.mapRefund(updated);
      }

      throw new AppError('Hành động xử lý không hợp lệ (APPROVE, REJECT, REFUND).', 400, ErrorCodes.INVALID_INPUT);
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
        end_time: row.event_end_time,
        refund_policy:
          typeof row.event_refund_policy === 'string'
            ? JSON.parse(row.event_refund_policy)
            : row.event_refund_policy || {},
      },
      order: {
        id: row.order_id,
        order_code: row.order_code,
        subtotal: Number(row.order_subtotal || 0),
        discount_amount: Number(row.order_discount_amount || 0),
        total_amount: Number(row.order_total_amount || 0),
        status: row.order_status,
      },
      ticket: row.ticket_id
        ? {
            id: row.ticket_id,
            ticket_code: row.ticket_code,
            status: row.ticket_status,
            unit_price: Number(row.ticket_unit_price || row.ticket_type_price || 0),
            final_price: row.ticket_final_price != null ? Number(row.ticket_final_price) : null,
            checked_in_at: row.checked_in_at,
            ticket_type: {
              name: row.ticket_type_name,
              price: Number(row.ticket_type_price || 0),
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

  /**
   * Preview refund eligibility & amount calculation for a customer ticket/order
   */
  async previewRefund(customerId, ticketId, orderId = null) {
    const data = await refundsRepository.getRefundContext(customerId, orderId, ticketId);
    if (!data) {
      throw new AppError(
        'Đơn hàng hoặc vé không tồn tại hoặc không thuộc về bạn.',
        404,
        ErrorCodes.RESOURCE_NOT_FOUND,
      );
    }

    const existing = await refundsRepository.findExistingActiveRefund(
      data.order_id,
      data.ticket_id || ticketId,
    );

    const validation = refundRuleEngine.evaluateEligibility({
      ticket: data.ticket_id
        ? {
            id: data.ticket_id,
            customer_id: data.customer_id,
            status: data.ticket_status,
            checked_in_at: data.checked_in_at,
            session_seat_id: data.session_seat_id,
            session_start_time: data.session_start_time,
            session_end_time: data.session_end_time,
            final_price: data.ticket_final_price,
            unit_price: data.ticket_unit_price,
            refund_policy_snapshot: data.ticket_refund_policy_snapshot,
          }
        : null,
      order: {
        id: data.order_id,
        user_id: data.customer_id,
        status: data.order_status,
        total_amount: data.order_total_amount,
        subtotal: data.order_subtotal,
        discount_amount: data.order_discount_amount,
        platform_fee: data.order_platform_fee,
      },
      event: {
        id: data.event_id,
        start_time: data.event_start_time,
        end_time: data.event_end_time,
        refund_policy: data.event_refund_policy,
      },
      activeRefund: existing,
      customerId,
      validateReason: false,
    });

    return {
      eligible: validation.eligible,
      days_before_event: validation.daysBeforeEvent ?? null,
      refund_rate: validation.refundRate ?? 0,
      paid_amount: validation.actualPaid ?? 0,
      refund_amount: validation.refundableAmount ?? 0,
      reason: validation.reason ?? null,
      error_code: validation.errorCode ?? null,
      policy_text: validation.policyText,
      refund_notes: validation.policy?.refund_notes || null,
      rule_matched: validation.ruleMatched || null,
      ticket_code: data.ticket_code || null,
      event_title: data.event_title || null,
    };
  }
}

module.exports = new RefundsService();
