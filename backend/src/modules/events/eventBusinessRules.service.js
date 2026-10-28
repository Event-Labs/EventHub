const crypto = require('crypto');
const db = require('../../infrastructure/database/db.client');
const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const fieldCrypto = require('../../core/security/fieldCrypto');
const logger = require('../../core/logger');
const {
  SALES_BLOCK_REASONS,
  getActiveSalesBlocks,
  isSalesPaused,
  addSalesBlock,
  releaseSalesBlock,
  computeSalesStatus,
  appendAuditTrail,
  calculateMinQuota,
  classifyEventChanges,
} = require('./eventLifecycleHelper');

class EventBusinessRulesService {
  /**
   * Helper to resolve organizer id from user id
   */
  async resolveOrganizerId(userId) {
    const { rows } = await db.query(
      `SELECT id FROM organizers WHERE user_id = $1 AND status = 'ACTIVE' LIMIT 1`,
      [userId],
    );
    if (!rows[0]) {
      throw new AppError('Không tìm thấy thông tin Ban tổ chức hợp lệ.', 403, ErrorCodes.AUTH_FORBIDDEN);
    }
    return rows[0].id;
  }

  /**
   * Assert event ownership
   */
  async assertOwnsEvent(client, eventId, organizerId) {
    const { rows } = await client.query(
      `SELECT * FROM events WHERE id = $1 AND organizer_id = $2 AND deleted_at IS NULL FOR UPDATE`,
      [eventId, organizerId],
    );
    if (!rows[0]) {
      throw new AppError('Sự kiện không tồn tại hoặc bạn không có quyền thao tác.', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    return rows[0];
  }

  /**
   * Get Event Financial and Commitment Summary
   */
  async getEventSummary(client, eventId) {
    const { rows } = await client.query(
      `
      SELECT
        COALESCE(COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'PAID'), 0)::int AS paid_orders_count,
        COALESCE(COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'PENDING' AND o.expired_at > now()), 0)::int AS pending_orders_count,
        COALESCE(SUM(o.total_amount) FILTER (WHERE o.status = 'PAID'), 0)::numeric AS total_paid_amount,
        COALESCE(COUNT(DISTINCT t.id) FILTER (WHERE t.status IN ('VALID', 'USED', 'REFUND_REQUESTED')), 0)::int AS issued_tickets_count,
        COALESCE(COUNT(DISTINCT th.id) FILTER (WHERE th.status = 'ACTIVE' AND th.expires_at > now()), 0)::int AS active_holds_count
      FROM events e
      LEFT JOIN event_sessions es ON es.event_id = e.id
      LEFT JOIN ticket_types tt ON tt.event_session_id = es.id
      LEFT JOIN order_items oi ON oi.ticket_type_id = tt.id
      LEFT JOIN orders o ON o.id = oi.order_id
      LEFT JOIN tickets t ON t.ticket_type_id = tt.id
      LEFT JOIN ticket_holds th ON th.ticket_type_id = tt.id
      WHERE e.id = $1
      GROUP BY e.id
      `,
      [eventId],
    );
    return rows[0] || {
      paid_orders_count: 0,
      pending_orders_count: 0,
      total_paid_amount: 0,
      issued_tickets_count: 0,
      active_holds_count: 0,
    };
  }

  /**
   * Check for unreconciled PENDING/PROCESSING/UNKNOWN transactions
   */
  async getUnreconciledCount(client, eventId) {
    const { rows } = await client.query(
      `
      SELECT COUNT(*)::int AS count
      FROM payment_orders po
      JOIN orders o ON o.id = po.order_id
      JOIN order_items oi ON oi.order_id = o.id
      JOIN ticket_types tt ON tt.id = oi.ticket_type_id
      JOIN event_sessions es ON es.id = tt.event_session_id
      WHERE es.event_id = $1
        AND po.status IN ('PENDING', 'PROCESSING', 'UNKNOWN')
        AND po.created_at > now() - interval '30 minutes'
      `,
      [eventId],
    );
    return rows[0]?.count || 0;
  }

  // ==========================================================================
  // SECTION 5: HIDE / UNHIDE / PAUSE / RESUME / SUSPEND
  // ==========================================================================

  /**
   * Hide Event (Organizer)
   */
  async hideEvent(userId, eventId, { reason, note }) {
    const organizerId = await this.resolveOrganizerId(userId);
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const event = await this.assertOwnsEvent(client, eventId, organizerId);

      if (event.status === 'CANCELLED') {
        throw new AppError('Sự kiện đã hủy không có thao tác Ẩn/Hiện.', 400, ErrorCodes.EVENT_INVALID_TRANSITION);
      }

      // Add HIDE block
      const { updatedBlocks } = addSalesBlock(event.sales_blocks, {
        reason: SALES_BLOCK_REASONS.HIDE,
        source: 'ORGANIZER',
        createdBy: userId,
        metadata: { reason, note },
      });

      const newSalesStatus = computeSalesStatus({
        status: event.status,
        salesBlocks: updatedBlocks,
        currentSalesStatus: event.sales_status,
      });

      const auditTrail = appendAuditTrail(event.audit_trail, {
        userId,
        role: 'ORGANIZER',
        action: 'HIDE',
        reason: `${reason || ''}: ${note || ''}`,
        stateBefore: { display_state: event.display_state, sales_status: event.sales_status },
        stateAfter: { display_state: 'HIDDEN_BY_ORGANIZER', sales_status: newSalesStatus },
      });

      const { rows } = await client.query(
        `
        UPDATE events
        SET display_state = 'HIDDEN_BY_ORGANIZER',
            hidden_by = $2,
            hidden_reason = $3,
            hidden_at = NOW(),
            sales_status = $4,
            sales_blocks = $5::jsonb,
            audit_trail = $6::jsonb,
            version = version + 1,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [eventId, userId, `${reason || ''}: ${note || ''}`, newSalesStatus, JSON.stringify(updatedBlocks), JSON.stringify(auditTrail)],
      );

      // Section 5.3 Rule 27 Anti-abuse check
      const fin = await this.getEventSummary(client, eventId);
      const hoursToStart = event.start_time ? (new Date(event.start_time).getTime() - Date.now()) / 3600000 : 999;
      let adminAlert = false;
      if (fin.paid_orders_count > 0 && hoursToStart <= 72) {
        adminAlert = true;
        logger.warn(`[ANTI_ABUSE_HIDE] Event ${eventId} hidden <= 72h before start with ${fin.paid_orders_count} paid orders`);
      }

      await client.query('COMMIT');
      return { event: rows[0], adminAlert };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Unhide Event (Organizer)
   */
  async unhideEvent(userId, eventId) {
    const organizerId = await this.resolveOrganizerId(userId);
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const event = await this.assertOwnsEvent(client, eventId, organizerId);

      if (event.status === 'CANCELLED') {
        throw new AppError('Sự kiện đã hủy không thể hiển thị lại.', 400, ErrorCodes.EVENT_INVALID_TRANSITION);
      }

      if (event.display_state === 'SUSPENDED_BY_ADMIN') {
        throw new AppError('Sự kiện bị đình chỉ bởi Quản trị viên, Ban tổ chức không thể tự mở lại.', 403, ErrorCodes.SUSPENDED_BY_ADMIN);
      }

      // Check if hidden > 30 days
      if (event.hidden_at && (Date.now() - new Date(event.hidden_at).getTime()) > 30 * 24 * 3600000) {
        throw new AppError('Sự kiện đã ẩn quá 30 ngày, cần Quản trị viên xét duyệt lại trước khi hiển thị.', 400, ErrorCodes.EVENT_NOT_REVIEWABLE);
      }

      const { updatedBlocks, remainingActive } = releaseSalesBlock(event.sales_blocks, {
        reason: SALES_BLOCK_REASONS.HIDE,
        releasedBy: userId,
        userRole: 'ORGANIZER',
      });

      const newSalesStatus = computeSalesStatus({
        status: event.status,
        salesBlocks: updatedBlocks,
        currentSalesStatus: event.sales_status,
      });

      const auditTrail = appendAuditTrail(event.audit_trail, {
        userId,
        role: 'ORGANIZER',
        action: 'UNHIDE',
        stateBefore: { display_state: event.display_state, sales_status: event.sales_status },
        stateAfter: { display_state: 'VISIBLE', sales_status: newSalesStatus },
      });

      const { rows } = await client.query(
        `
        UPDATE events
        SET display_state = 'VISIBLE',
            status = CASE WHEN status::text = 'HIDDEN' THEN 'PUBLISHED'::event_status_enum ELSE status END,
            sales_status = $2,
            sales_blocks = $3::jsonb,
            audit_trail = $4::jsonb,
            version = version + 1,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [eventId, newSalesStatus, JSON.stringify(updatedBlocks), JSON.stringify(auditTrail)],
      );

      await client.query('COMMIT');
      return {
        event: rows[0],
        remainingBlocks: remainingActive.map((b) => b.reason),
        message: remainingActive.length > 0 ? `Sự kiện đã hiển thị nhưng vẫn dừng bán do: ${remainingActive.map((b) => b.reason).join(', ')}` : 'Sự kiện đã hiển thị và mở bán trở lại.',
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Pause Sales (Organizer)
   */
  async pauseSales(userId, eventId, { reason, note }) {
    const organizerId = await this.resolveOrganizerId(userId);
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const event = await this.assertOwnsEvent(client, eventId, organizerId);

      const humanNote = (note || reason || '').trim() || null;
      const { updatedBlocks } = addSalesBlock(event.sales_blocks, {
        reason: SALES_BLOCK_REASONS.ORGANIZER_PAUSE,
        source: 'ORGANIZER',
        createdBy: userId,
        metadata: { reason: humanNote, note: humanNote },
      });

      const auditTrail = appendAuditTrail(event.audit_trail, {
        userId,
        role: 'ORGANIZER',
        action: 'PAUSE_SALES',
        reason: humanNote || 'Tạm dừng bán vé',
        stateBefore: { sales_status: event.sales_status },
        stateAfter: { sales_status: 'PAUSED' },
      });

      const { rows } = await client.query(
        `
        UPDATE events
        SET sales_status = 'PAUSED',
            sales_blocks = $2::jsonb,
            audit_trail = $3::jsonb,
            version = version + 1,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [eventId, JSON.stringify(updatedBlocks), JSON.stringify(auditTrail)],
      );

      await client.query('COMMIT');
      return rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Resume Sales (Organizer)
   */
  async resumeSales(userId, eventId) {
    const organizerId = await this.resolveOrganizerId(userId);
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const event = await this.assertOwnsEvent(client, eventId, organizerId);

      if (event.display_state === 'SUSPENDED_BY_ADMIN' || (event.sales_blocks || []).some((b) => b.reason === 'SUSPENDED' && !b.released_at)) {
        throw new AppError('Sự kiện bị đình chỉ bởi Quản trị viên, Ban tổ chức không thể tự mở lại.', 403, ErrorCodes.SUSPENDED_BY_ADMIN);
      }

      const { updatedBlocks, remainingActive } = releaseSalesBlock(event.sales_blocks, {
        reason: SALES_BLOCK_REASONS.ORGANIZER_PAUSE,
        releasedBy: userId,
        userRole: 'ORGANIZER',
      });

      const newSalesStatus = computeSalesStatus({
        status: event.status,
        salesBlocks: updatedBlocks,
        currentSalesStatus: event.sales_status,
      });

      const auditTrail = appendAuditTrail(event.audit_trail, {
        userId,
        role: 'ORGANIZER',
        action: 'RESUME_SALES',
        stateBefore: { sales_status: event.sales_status },
        stateAfter: { sales_status: newSalesStatus },
      });

      const { rows } = await client.query(
        `
        UPDATE events
        SET sales_status = $2,
            sales_blocks = $3::jsonb,
            audit_trail = $4::jsonb,
            version = version + 1,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [eventId, newSalesStatus, JSON.stringify(updatedBlocks), JSON.stringify(auditTrail)],
      );

      await client.query('COMMIT');
      return {
        event: rows[0],
        remainingBlocks: remainingActive.map((b) => b.reason),
        message: remainingActive.length > 0 ? `Vẫn đang dừng bán do: ${remainingActive.map((b) => b.reason).join(', ')}` : 'Đã mở bán vé trở lại.',
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Suspend Event (Admin Only - Section 5.5)
   */
  async suspendEvent(adminId, eventId, { reason, note }) {
    const validReasons = [
      'POLICY_VIOLATION',
      'SUSPECTED_FRAUD',
      'LEGAL_REQUEST',
      'CONTENT_ISSUE',
      'ORGANIZER_ACCOUNT_ISSUE',
      'REFUND_OVERDUE',
    ];
    if (!validReasons.includes(reason)) {
      throw new AppError(`Lý do đình chỉ không hợp lệ. Phải là một trong: ${validReasons.join(', ')}`, 400, ErrorCodes.INVALID_INPUT);
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const { rows: eventRows } = await client.query(`SELECT * FROM events WHERE id = $1 FOR UPDATE`, [eventId]);
      const event = eventRows[0];
      if (!event) throw new AppError('Sự kiện không tồn tại', 404, ErrorCodes.RESOURCE_NOT_FOUND);

      const { updatedBlocks } = addSalesBlock(event.sales_blocks, {
        reason: SALES_BLOCK_REASONS.SUSPENDED,
        source: 'ADMIN',
        createdBy: adminId,
        metadata: { reason, note },
      });

      const auditTrail = appendAuditTrail(event.audit_trail, {
        userId: adminId,
        role: 'ADMIN',
        action: 'SUSPEND',
        reason: `${reason}: ${note || ''}`,
        stateBefore: { display_state: event.display_state, sales_status: event.sales_status },
        stateAfter: { display_state: 'SUSPENDED_BY_ADMIN', sales_status: 'PAUSED' },
      });

      const { rows } = await client.query(
        `
        UPDATE events
        SET display_state = 'SUSPENDED_BY_ADMIN',
            sales_status = 'PAUSED',
            sales_blocks = $2::jsonb,
            audit_trail = $3::jsonb,
            version = version + 1,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [eventId, JSON.stringify(updatedBlocks), JSON.stringify(auditTrail)],
      );

      await client.query('COMMIT');
      return rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Unsuspend Event (Admin Only)
   */
  async unsuspendEvent(adminId, eventId, { reason }) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const { rows: eventRows } = await client.query(`SELECT * FROM events WHERE id = $1 FOR UPDATE`, [eventId]);
      const event = eventRows[0];
      if (!event) throw new AppError('Sự kiện không tồn tại', 404, ErrorCodes.RESOURCE_NOT_FOUND);

      const { updatedBlocks, remainingActive } = releaseSalesBlock(event.sales_blocks, {
        reason: SALES_BLOCK_REASONS.SUSPENDED,
        releasedBy: adminId,
        userRole: 'ADMIN',
      });

      const newSalesStatus = computeSalesStatus({
        status: event.status,
        salesBlocks: updatedBlocks,
        currentSalesStatus: event.sales_status,
      });

      const auditTrail = appendAuditTrail(event.audit_trail, {
        userId: adminId,
        role: 'ADMIN',
        action: 'UNSUSPEND',
        reason: reason || 'Admin lifted suspension',
        stateBefore: { display_state: event.display_state, sales_status: event.sales_status },
        stateAfter: { display_state: 'VISIBLE', sales_status: newSalesStatus },
      });

      const { rows } = await client.query(
        `
        UPDATE events
        SET display_state = 'VISIBLE',
            sales_status = $2,
            sales_blocks = $3::jsonb,
            audit_trail = $4::jsonb,
            version = version + 1,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [eventId, newSalesStatus, JSON.stringify(updatedBlocks), JSON.stringify(auditTrail)],
      );

      await client.query('COMMIT');
      return rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ==========================================================================
  // SECTION 6: CANCEL EVENT (LUỒNG A, LUỒNG B, LUỒNG C)
  // ==========================================================================

  /**
   * Cancel Event - Normal Flow (Luồng A)
   * Chạy khi chưa có Order có tiền thật và không có giao dịch chưa kết luận
   */
  async cancelEventNormalFlow(userId, eventId, { reason_code, note }) {
    const organizerId = await this.resolveOrganizerId(userId);
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const event = await this.assertOwnsEvent(client, eventId, organizerId);

      if (!['PUBLISHED', 'APPROVED', 'COMPLETED'].includes(event.status)) {
        throw new AppError(
          `Không thể hủy sự kiện ở trạng thái "${event.status}". Sự kiện nháp vui lòng chọn Xóa.`,
          400,
          ErrorCodes.EVENT_NOT_CANCELLABLE,
        );
      }

      // Check financial orders
      const fin = await this.getEventSummary(client, eventId);
      if (fin.paid_orders_count > 0 || Number(fin.total_paid_amount || 0) > 0) {
        throw new AppError(
          `Sự kiện đã có ${fin.paid_orders_count} đơn hàng thanh toán thật. Vui lòng gửi Yêu cầu hủy sự kiện để Quản trị viên xét duyệt và xử lý hoàn tiền.`,
          400,
          ErrorCodes.CANCEL_REQUIRES_APPROVAL,
        );
      }

      // Check unreconciled transactions
      const unreconciled = await this.getUnreconciledCount(client, eventId);
      if (unreconciled > 0) {
        throw new AppError(
          'Đang có giao dịch thanh toán chờ đối soát từ cổng. Vui lòng thử lại sau vài phút.',
          400,
          ErrorCodes.CANCEL_WAITING_RECONCILE,
        );
      }

      // 1. Pause sales immediately
      const { updatedBlocks } = addSalesBlock(event.sales_blocks, {
        reason: SALES_BLOCK_REASONS.CANCELLING,
        source: 'SYSTEM',
        createdBy: userId,
      });

      // 2. Cancel Upcoming Sessions
      await client.query(
        `
        UPDATE event_sessions
        SET status = 'CANCELLED', updated_at = NOW()
        WHERE event_id = $1 AND status = 'UPCOMING'
        `,
        [eventId],
      );

      // 3. Cancel PENDING Orders
      await client.query(
        `
        UPDATE orders o
        SET status = 'CANCELLED',
            status_reason = 'EVENT_CANCELLED',
            updated_at = NOW()
        FROM order_items oi
        JOIN ticket_types tt ON tt.id = oi.ticket_type_id
        JOIN event_sessions es ON es.id = tt.event_session_id
        WHERE es.event_id = $1 AND o.status = 'PENDING'
        `,
        [eventId],
      );

      // 4. Release ACTIVE Holds
      await client.query(
        `
        UPDATE ticket_holds th
        SET status = 'RELEASED', updated_at = NOW()
        FROM ticket_types tt
        JOIN event_sessions es ON es.id = tt.event_session_id
        WHERE es.event_id = $1 AND th.status = 'ACTIVE'
        `,
        [eventId],
      );

      // 5. Release HELD Seats
      await client.query(
        `
        UPDATE session_seats ss
        SET status = 'AVAILABLE', held_by = NULL, held_until = NULL, order_id = NULL
        FROM event_sessions es
        WHERE es.id = ss.event_session_id AND es.event_id = $1 AND ss.status = 'HELD'
        `,
        [eventId],
      );

      // 6. Cancel free tickets
      await client.query(
        `
        UPDATE tickets t
        SET status = 'CANCELLED'
        FROM event_sessions es
        WHERE es.id = t.event_session_id AND es.event_id = $1 AND t.status = 'VALID'
        `,
        [eventId],
      );

      // 7. Update Event to CANCELLED
      const auditTrail = appendAuditTrail(event.audit_trail, {
        userId,
        role: 'ORGANIZER',
        action: 'CANCEL_EVENT_NORMAL',
        reason: `${reason_code || 'ORG_VOLUNTARY'}: ${note || ''}`,
        stateBefore: { status: event.status, sales_status: event.sales_status },
        stateAfter: { status: 'CANCELLED', sales_status: 'CLOSED' },
      });

      const { rows } = await client.query(
        `
        UPDATE events
        SET status = 'CANCELLED',
            sales_status = 'CLOSED',
            cancel_type = 'NORMAL',
            cancel_reason_code = $2,
            cancel_reason_note = $3,
            cancelled_by = $4,
            cancelled_at = NOW(),
            sales_blocks = $5::jsonb,
            audit_trail = $6::jsonb,
            version = version + 1,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [
          eventId,
          reason_code || 'ORG_VOLUNTARY',
          note || null,
          userId,
          JSON.stringify(updatedBlocks),
          JSON.stringify(auditTrail),
        ],
      );

      await client.query('COMMIT');
      return rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Submit Cancellation Request (Luồng B - Organizer submits request for paid event)
   */
  async submitCancellationRequest(userId, eventId, { reason_code, note, reason_note, refund_mode, commitment_accepted }) {
    const organizerId = await this.resolveOrganizerId(userId);
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const event = await this.assertOwnsEvent(client, eventId, organizerId);

      if (event.cancel_request && event.cancel_request.status === 'PENDING') {
        throw new AppError('Sự kiện đã có yêu cầu hủy đang chờ Quản trị viên xét duyệt.', 400, ErrorCodes.INVALID_INPUT);
      }

      if (!commitment_accepted) {
        throw new AppError(
          'Ban tổ chức bắt buộc phải cam kết hoàn tiền trước khi gửi yêu cầu hủy sự kiện.',
          400,
          ErrorCodes.REFUND_COMMITMENT_REQUIRED,
        );
      }

      const fin = await this.getEventSummary(client, eventId);
      const hoursToStart = event.start_time ? (new Date(event.start_time).getTime() - Date.now()) / 3600000 : 999;
      const slaHours = hoursToStart <= 72 ? 4 : 24;

      // 1. Immediately pause sales
      const { updatedBlocks } = addSalesBlock(event.sales_blocks, {
        reason: SALES_BLOCK_REASONS.CANCELLATION_REQUESTED,
        source: 'SYSTEM',
        createdBy: userId,
      });

      const resolvedNote = reason_note || note || '';

      const cancelRequest = {
        id: crypto.randomUUID(),
        type: 'EXCEPTION',
        status: 'PENDING',
        reason_code: reason_code || 'ORG_VOLUNTARY',
        note: resolvedNote,
        reason_note: resolvedNote,
        refund_mode: refund_mode || 'MODE_B',
        commitment_accepted_at: new Date().toISOString(),
        commitment_accepted_by: userId,
        commitment_version: '1.0',
        requested_by: userId,
        requested_at: new Date().toISOString(),
        sla_due_at: new Date(Date.now() + slaHours * 3600000).toISOString(),
        sla_breached: false,
        affected_orders_count: fin.paid_orders_count,
        affected_tickets_count: fin.issued_tickets_count,
        total_refund_amount: fin.total_paid_amount,
      };

      const auditTrail = appendAuditTrail(event.audit_trail, {
        userId,
        role: 'ORGANIZER',
        action: 'SUBMIT_CANCELLATION_REQUEST',
        reason: `${reason_code}: ${resolvedNote}`,
        stateBefore: { sales_status: event.sales_status },
        stateAfter: { sales_status: 'PAUSED' },
      });

      const { rows } = await client.query(
        `
        UPDATE events
        SET sales_status = 'PAUSED',
            sales_blocks = $2::jsonb,
            cancel_request = $3::jsonb,
            audit_trail = $4::jsonb,
            version = version + 1,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [eventId, JSON.stringify(updatedBlocks), JSON.stringify(cancelRequest), JSON.stringify(auditTrail)],
      );

      await client.query('COMMIT');
      return { event: rows[0], cancellationRequest: cancelRequest };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Admin Approves Cancellation Request (Luồng B - Section 6.5)
   */
  async approveCancellationRequest(adminId, eventId, { note }) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const { rows: eventRows } = await client.query(
        `SELECT e.*, o.user_id AS organizer_user_id 
         FROM events e 
         JOIN organizers o ON o.id = e.organizer_id 
         WHERE e.id = $1 FOR UPDATE`,
        [eventId],
      );
      const event = eventRows[0];
      if (!event) throw new AppError('Sự kiện không tồn tại', 404, ErrorCodes.RESOURCE_NOT_FOUND);

      const cancelReq = event.cancel_request;
      if (!cancelReq || cancelReq.status !== 'PENDING') {
        throw new AppError('Không tìm thấy yêu cầu hủy đang chờ phê duyệt.', 400, ErrorCodes.INVALID_INPUT);
      }

      // 1. Release Hold and Cancel Sessions
      await client.query(`UPDATE event_sessions SET status = 'CANCELLED', updated_at = NOW() WHERE event_id = $1 AND status = 'UPCOMING'`, [eventId]);
      await client.query(
        `
        UPDATE orders o
        SET status = 'CANCELLED', status_reason = 'EVENT_CANCELLED', updated_at = NOW()
        FROM order_items oi
        JOIN ticket_types tt ON tt.id = oi.ticket_type_id
        JOIN event_sessions es ON es.id = tt.event_session_id
        WHERE es.event_id = $1 AND o.status = 'PENDING'
        `,
        [eventId],
      );
      await client.query(
        `
        UPDATE ticket_holds th
        SET status = 'RELEASED', updated_at = NOW()
        FROM ticket_types tt
        JOIN event_sessions es ON es.id = tt.event_session_id
        WHERE es.event_id = $1 AND th.status = 'ACTIVE'
        `,
        [eventId],
      );
      await client.query(
        `
        UPDATE session_seats ss
        SET status = 'AVAILABLE', held_by = NULL, held_until = NULL, order_id = NULL
        FROM event_sessions es
        WHERE es.id = ss.event_session_id AND es.event_id = $1 AND ss.status = 'HELD'
        `,
        [eventId],
      );

      // 2. Mark PAID tickets as REFUND_REQUESTED
      await client.query(
        `
        UPDATE tickets t
        SET status = 'REFUND_REQUESTED'
        FROM event_sessions es
        WHERE es.id = t.event_session_id AND es.event_id = $1 AND t.status = 'VALID'
        `,
        [eventId],
      );

      // 3. Auto-generate Refund Request for EVERY PAID order (AC-CE-07, AC-RF-01)
      const { rows: paidOrders } = await client.query(
        `
        SELECT DISTINCT o.id, o.order_code, o.user_id, o.total_amount, o.organizer_id,
               po.payer_bank_id, po.payer_account_number, po.payer_account_name
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        JOIN ticket_types tt ON tt.id = oi.ticket_type_id
        JOIN event_sessions es ON es.id = tt.event_session_id
        LEFT JOIN payment_orders po ON po.order_id = o.id AND po.status = 'PAID'
        WHERE es.event_id = $1 AND o.status = 'PAID'
        `,
        [eventId],
      );

      for (const po of paidOrders) {
        const hasCounter = Boolean(po.payer_bank_id && po.payer_account_number && po.payer_account_name);
        const dest = hasCounter ? 'PAYER_ACCOUNT' : 'CUSTOMER_INPUT';
        const readyAt = hasCounter ? new Date() : null;
        const refundCode = `RF_${po.order_code || po.id.slice(0, 8)}`;

        await client.query(
          `
          INSERT INTO refund_requests (
            order_id, event_id, customer_id, organizer_id,
            refund_amount, reason, status, execution_mode,
            refund_destination_source, ready_at, due_at,
            refund_code, bank_name, bank_account_number, bank_account_name,
            requested_at, created_at, updated_at
          )
          SELECT
            $1, $2, $3, $4,
            $5, 'EVENT_CANCELLED', 'APPROVED', 'ORGANIZER_MANUAL',
            $6, $7, now() + interval '7 days',
            $8, $9, $10, $11,
            now(), now(), now()
          WHERE NOT EXISTS (
            SELECT 1 FROM refund_requests WHERE order_id = $1
          )
          `,
          [
            po.id,
            eventId,
            po.user_id,
            event.organizer_user_id,
            po.total_amount,
            dest,
            readyAt,
            refundCode,
            po.payer_bank_id,
            po.payer_account_number,
            po.payer_account_name,
          ],
        );
      }

      // 4. Update Event to CANCELLED with refund_obligation_status = 'IN_PROGRESS'
      const updatedCancelReq = {
        ...cancelReq,
        status: 'APPROVED',
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
        admin_note: note || '',
      };

      const auditTrail = appendAuditTrail(event.audit_trail, {
        userId: adminId,
        role: 'ADMIN',
        action: 'APPROVE_CANCELLATION_REQUEST',
        reason: note || 'Admin approved cancellation request',
        stateBefore: { status: event.status, refund_obligation_status: event.refund_obligation_status },
        stateAfter: { status: 'CANCELLED', refund_obligation_status: 'IN_PROGRESS' },
      });

      const { rows } = await client.query(
        `
        UPDATE events
        SET status = 'CANCELLED',
            sales_status = 'CLOSED',
            cancel_type = 'EXCEPTION',
            cancel_reason_code = $2,
            cancelled_by = $3,
            cancelled_at = NOW(),
            refund_obligation_status = 'IN_PROGRESS',
            cancel_request = $4::jsonb,
            audit_trail = $5::jsonb,
            version = version + 1,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [eventId, cancelReq.reason_code, adminId, JSON.stringify(updatedCancelReq), JSON.stringify(auditTrail)],
      );

      await client.query('COMMIT');
      return rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Admin Rejects Cancellation Request (Section 6.5)
   */
  async rejectCancellationRequest(adminId, eventId, { note }) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const { rows: eventRows } = await client.query(`SELECT * FROM events WHERE id = $1 FOR UPDATE`, [eventId]);
      const event = eventRows[0];
      if (!event) throw new AppError('Sự kiện không tồn tại', 404, ErrorCodes.RESOURCE_NOT_FOUND);

      const cancelReq = event.cancel_request;
      if (!cancelReq || cancelReq.status !== 'PENDING') {
        throw new AppError('Không tìm thấy yêu cầu hủy đang chờ phê duyệt.', 400, ErrorCodes.INVALID_INPUT);
      }

      // 1. Release CANCELLATION_REQUESTED sales block
      const { updatedBlocks } = releaseSalesBlock(event.sales_blocks, {
        reason: SALES_BLOCK_REASONS.CANCELLATION_REQUESTED,
        releasedBy: adminId,
        userRole: 'ADMIN',
      });

      // 2. Recompute sales status
      const newSalesStatus = computeSalesStatus({
        status: event.status,
        salesBlocks: updatedBlocks,
        currentSalesStatus: event.sales_status,
      });

      // 3. Update cancel_request to REJECTED
      const updatedCancelReq = {
        ...cancelReq,
        status: 'REJECTED',
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
        admin_note: note || '',
      };

      const auditTrail = appendAuditTrail(event.audit_trail, {
        userId: adminId,
        role: 'ADMIN',
        action: 'REJECT_CANCELLATION_REQUEST',
        reason: note || 'Admin rejected cancellation request',
        stateBefore: { sales_status: event.sales_status, cancel_request: event.cancel_request },
        stateAfter: { sales_status: newSalesStatus, cancel_request: updatedCancelReq },
      });

      const { rows } = await client.query(
        `
        UPDATE events
        SET sales_status = $2,
            sales_blocks = $3::jsonb,
            cancel_request = $4::jsonb,
            audit_trail = $5::jsonb,
            version = version + 1,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [eventId, newSalesStatus, JSON.stringify(updatedBlocks), JSON.stringify(updatedCancelReq), JSON.stringify(auditTrail)],
      );

      await client.query('COMMIT');
      return rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Organizer Withdraws Cancellation Request (Before Admin approval)
   */
  async withdrawCancellationRequest(userId, eventId) {
    const organizerId = await this.resolveOrganizerId(userId);
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const event = await this.assertOwnsEvent(client, eventId, organizerId);

      const cancelReq = event.cancel_request;
      if (!cancelReq || cancelReq.status !== 'PENDING') {
        throw new AppError('Không tìm thấy yêu cầu hủy đang chờ phê duyệt để rút lại.', 400, ErrorCodes.INVALID_INPUT);
      }

      // 1. Release CANCELLATION_REQUESTED sales block
      const { updatedBlocks } = releaseSalesBlock(event.sales_blocks, {
        reason: SALES_BLOCK_REASONS.CANCELLATION_REQUESTED,
        releasedBy: userId,
        userRole: 'SYSTEM',
      });

      // 2. Recompute sales status
      const newSalesStatus = computeSalesStatus({
        status: event.status,
        salesBlocks: updatedBlocks,
        currentSalesStatus: event.sales_status,
      });

      const auditTrail = appendAuditTrail(event.audit_trail, {
        userId,
        role: 'ORGANIZER',
        action: 'WITHDRAW_CANCELLATION_REQUEST',
        reason: 'Ban tổ chức chủ động rút lại yêu cầu hủy sự kiện trước khi Admin xét duyệt',
        stateBefore: { sales_status: event.sales_status, cancel_request: event.cancel_request },
        stateAfter: { sales_status: newSalesStatus, cancel_request: null },
      });

      const { rows } = await client.query(
        `
        UPDATE events
        SET sales_status = $2,
            sales_blocks = $3::jsonb,
            cancel_request = NULL,
            audit_trail = $4::jsonb,
            version = version + 1,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [eventId, newSalesStatus, JSON.stringify(updatedBlocks), JSON.stringify(auditTrail)],
      );

      await client.query('COMMIT');
      return rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Admin Initiates Force Cancellation (Luồng C - Section 6.6 & 15.10)
   */
  async initiateForceCancel(adminId, eventId, { reason_code, note, evidence_urls = [] }) {
    const validReasons = ['POLICY_VIOLATION', 'FRAUD', 'LEGAL_ORDER', 'OTHER'];
    if (!validReasons.includes(reason_code)) {
      throw new AppError(`Lý do hủy cưỡng chế không hợp lệ: ${reason_code}`, 400, ErrorCodes.INVALID_INPUT);
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const { rows: eventRows } = await client.query(`SELECT * FROM events WHERE id = $1 FOR UPDATE`, [eventId]);
      const event = eventRows[0];
      if (!event) throw new AppError('Sự kiện không tồn tại', 404, ErrorCodes.RESOURCE_NOT_FOUND);

      // Cooling-off: 2 hours if FRAUD or LEGAL_ORDER with evidence, else 24 hours (15.10.2)
      const hasFastTrack = ['FRAUD', 'LEGAL_ORDER'].includes(reason_code) && Array.isArray(evidence_urls) && evidence_urls.length > 0;
      const coolingOffHours = hasFastTrack ? 2 : 24;
      const coolingOffExpiresAt = new Date(Date.now() + coolingOffHours * 3600000).toISOString();

      // Immediately suspend and pause sales
      const { updatedBlocks } = addSalesBlock(event.sales_blocks, {
        reason: SALES_BLOCK_REASONS.SUSPENDED,
        source: 'ADMIN',
        createdBy: adminId,
        metadata: { reason_code, note },
      });

      const cancelRequest = {
        id: crypto.randomUUID(),
        type: 'ADMIN_FORCED',
        status: 'COOLING_OFF',
        reason_code,
        note: note || '',
        evidence_urls: evidence_urls || [],
        requested_by: adminId,
        requested_at: new Date().toISOString(),
        cooling_off_expires_at: coolingOffExpiresAt,
      };

      const auditTrail = appendAuditTrail(event.audit_trail, {
        userId: adminId,
        role: 'ADMIN',
        action: 'INITIATE_FORCE_CANCEL',
        reason: `${reason_code}: ${note || ''}`,
        stateBefore: { display_state: event.display_state, sales_status: event.sales_status },
        stateAfter: { display_state: 'SUSPENDED_BY_ADMIN', sales_status: 'PAUSED' },
      });

      const { rows } = await client.query(
        `
        UPDATE events
        SET display_state = 'SUSPENDED_BY_ADMIN',
            sales_status = 'PAUSED',
            sales_blocks = $2::jsonb,
            cancel_request = $3::jsonb,
            audit_trail = $4::jsonb,
            version = version + 1,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [eventId, JSON.stringify(updatedBlocks), JSON.stringify(cancelRequest), JSON.stringify(auditTrail)],
      );

      await client.query('COMMIT');
      return { event: rows[0], coolingOffExpiresAt };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Admin Confirms Force Cancellation (Luồng C - after cooling off expires)
   */
  async confirmForceCancel(adminId, eventId) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const { rows: eventRows } = await client.query(
        `SELECT e.*, o.user_id AS organizer_user_id 
         FROM events e 
         JOIN organizers o ON o.id = e.organizer_id 
         WHERE e.id = $1 FOR UPDATE`,
        [eventId],
      );
      const event = eventRows[0];
      if (!event) throw new AppError('Sự kiện không tồn tại', 404, ErrorCodes.RESOURCE_NOT_FOUND);

      const cancelReq = event.cancel_request;
      if (!cancelReq || cancelReq.type !== 'ADMIN_FORCED' || cancelReq.status !== 'COOLING_OFF') {
        throw new AppError('Không có yêu cầu hủy cưỡng chế đang chờ xác nhận.', 400, ErrorCodes.INVALID_INPUT);
      }

      // Check cooling-off period (AC-AD-02, AC-CE-13)
      if (new Date(cancelReq.cooling_off_expires_at).getTime() > Date.now()) {
        const remainingMinutes = Math.ceil((new Date(cancelReq.cooling_off_expires_at).getTime() - Date.now()) / 60000);
        throw new AppError(
          `Thời gian chờ bắt buộc (Cooling-off) chưa kết thúc. Vui lòng chờ thêm ${remainingMinutes} phút.`,
          400,
          ErrorCodes.COOLING_OFF_ACTIVE,
        );
      }

      // Execute cancellation and auto refund creation
      await client.query(`UPDATE event_sessions SET status = 'CANCELLED', updated_at = NOW() WHERE event_id = $1 AND status = 'UPCOMING'`, [eventId]);
      await client.query(
        `
        UPDATE orders o
        SET status = 'CANCELLED', status_reason = 'EVENT_CANCELLED', updated_at = NOW()
        FROM order_items oi
        JOIN ticket_types tt ON tt.id = oi.ticket_type_id
        JOIN event_sessions es ON es.id = tt.event_session_id
        WHERE es.event_id = $1 AND o.status = 'PENDING'
        `,
        [eventId],
      );
      await client.query(
        `
        UPDATE ticket_holds th
        SET status = 'RELEASED', updated_at = NOW()
        FROM ticket_types tt
        JOIN event_sessions es ON es.id = tt.event_session_id
        WHERE es.event_id = $1 AND th.status = 'ACTIVE'
        `,
        [eventId],
      );
      await client.query(
        `
        UPDATE session_seats ss
        SET status = 'AVAILABLE', held_by = NULL, held_until = NULL, order_id = NULL
        FROM event_sessions es
        WHERE es.id = ss.event_session_id AND es.event_id = $1 AND ss.status = 'HELD'
        `,
        [eventId],
      );

      // Create refund requests
      const { rows: paidOrders } = await client.query(
        `
        SELECT DISTINCT o.id, o.order_code, o.user_id, o.total_amount, o.organizer_id,
               po.payer_bank_id, po.payer_account_number, po.payer_account_name
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        JOIN ticket_types tt ON tt.id = oi.ticket_type_id
        JOIN event_sessions es ON es.id = tt.event_session_id
        LEFT JOIN payment_orders po ON po.order_id = o.id AND po.status = 'PAID'
        WHERE es.event_id = $1 AND o.status = 'PAID'
        `,
        [eventId],
      );

      for (const po of paidOrders) {
        const hasCounter = Boolean(po.payer_bank_id && po.payer_account_number && po.payer_account_name);
        const dest = hasCounter ? 'PAYER_ACCOUNT' : 'CUSTOMER_INPUT';
        const readyAt = hasCounter ? new Date() : null;
        const refundCode = `RF_${po.order_code || po.id.slice(0, 8)}`;

        await client.query(
          `
          INSERT INTO refund_requests (
            order_id, event_id, customer_id, organizer_id,
            refund_amount, reason, status, execution_mode,
            refund_destination_source, ready_at, due_at,
            refund_code, bank_name, bank_account_number, bank_account_name,
            requested_at, created_at, updated_at
          )
          SELECT
            $1, $2, $3, $4,
            $5, 'EVENT_CANCELLED', 'APPROVED', 'ORGANIZER_MANUAL',
            $6, $7, now() + interval '7 days',
            $8, $9, $10, $11,
            now(), now(), now()
          WHERE NOT EXISTS (
            SELECT 1 FROM refund_requests WHERE order_id = $1
          )
          `,
          [
            po.id,
            eventId,
            po.user_id,
            event.organizer_user_id,
            po.total_amount,
            dest,
            readyAt,
            refundCode,
            po.payer_bank_id,
            po.payer_account_number,
            po.payer_account_name,
          ],
        );
      }

      const updatedCancelReq = {
        ...cancelReq,
        status: 'CONFIRMED',
        confirmed_by: adminId,
        confirmed_at: new Date().toISOString(),
      };

      const auditTrail = appendAuditTrail(event.audit_trail, {
        userId: adminId,
        role: 'ADMIN',
        action: 'CONFIRM_FORCE_CANCEL',
        reason: cancelReq.reason_code,
        stateBefore: { status: event.status },
        stateAfter: { status: 'CANCELLED', refund_obligation_status: 'IN_PROGRESS' },
      });

      const { rows } = await client.query(
        `
        UPDATE events
        SET status = 'CANCELLED',
            sales_status = 'CLOSED',
            cancel_type = 'ADMIN_FORCED',
            cancel_reason_code = $2,
            cancelled_by = $3,
            cancelled_at = NOW(),
            refund_obligation_status = 'IN_PROGRESS',
            cancel_request = $4::jsonb,
            audit_trail = $5::jsonb,
            version = version + 1,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [eventId, cancelReq.reason_code, adminId, JSON.stringify(updatedCancelReq), JSON.stringify(auditTrail)],
      );

      await client.query('COMMIT');
      return rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ==========================================================================
  // SECTION 7: REFUND PAYOUT INFO SUBMISSION & DISPUTE
  // ==========================================================================

  /**
   * Customer submits bank account payout info (Section 7.17, AC-RP-05)
   */
  async submitPayoutInfo(userId, { refundId, bankName, bankAccountNumber, bankAccountName }) {
    if (!bankName || !bankAccountNumber || !bankAccountName) {
      throw new AppError('Vui lòng cung cấp đầy đủ thông tin: Ngân hàng, Số tài khoản và Tên chủ tài khoản.', 400, ErrorCodes.INVALID_INPUT);
    }

    const { rows } = await db.query(
      `
      SELECT rr.*, o.organizer_id, o.buyer_name
      FROM refund_requests rr
      JOIN orders o ON o.id = rr.order_id
      WHERE rr.id = $1 AND rr.customer_id = $2
      `,
      [refundId, userId],
    );
    const refund = rows[0];
    if (!refund) throw new AppError('Không tìm thấy yêu cầu hoàn tiền.', 404, ErrorCodes.RESOURCE_NOT_FOUND);

    if (['SUBMITTED', 'REFUNDED'].includes(refund.status)) {
      throw new AppError('Yêu cầu hoàn tiền đã gửi lệnh chi hoặc đã hoàn tất, không thể thay đổi thông tin.', 400, ErrorCodes.REFUND_INFO_LOCKED);
    }

    const encryptedAccount = fieldCrypto.encrypt(bankAccountNumber, refund.organizer_id || 'platform', 'payer_account_number');

    const auditTrail = appendAuditTrail(refund.audit_trail, {
      userId,
      role: 'CUSTOMER',
      action: 'SUBMIT_PAYOUT_INFO',
      diff: { bankName, bankAccountName },
    });

    const { rows: updated } = await db.query(
      `
      UPDATE refund_requests
      SET bank_name = $2,
          bank_account_number = $3,
          bank_account_name = $4,
          refund_destination_source = 'CUSTOMER_INPUT',
          status = 'PROCESSING',
          ready_at = NOW(),
          due_at = NOW() + interval '7 days',
          audit_trail = $5::jsonb,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [refundId, bankName, encryptedAccount, bankAccountName, JSON.stringify(auditTrail)],
    );

    return updated[0];
  }

  /**
   * Customer clicks "Tôi chưa nhận được tiền" (Dispute - Section 7.7, AC-RF-06)
   */
  async disputeRefund(userId, refundId, { reason }) {
    const { rows } = await db.query(
      `SELECT * FROM refund_requests WHERE id = $1 AND customer_id = $2`,
      [refundId, userId],
    );
    const refund = rows[0];
    if (!refund) throw new AppError('Không tìm thấy yêu cầu hoàn tiền.', 404, ErrorCodes.RESOURCE_NOT_FOUND);

    const auditTrail = appendAuditTrail(refund.audit_trail, {
      userId,
      role: 'CUSTOMER',
      action: 'DISPUTE_REFUND',
      reason: reason || 'Khách hàng báo chưa nhận được tiền hoàn',
      stateBefore: { status: refund.status, disputed: refund.disputed },
      stateAfter: { status: 'PROCESSING', disputed: true },
    });

    const { rows: updated } = await db.query(
      `
      UPDATE refund_requests
      SET disputed = true,
          dispute_reason = $2,
          disputed_at = NOW(),
          status = 'PROCESSING',
          audit_trail = $3::jsonb,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [refundId, reason || 'Khách hàng báo chưa nhận được tiền hoàn', JSON.stringify(auditTrail)],
    );

    return updated[0];
  }

  /**
   * Customer confirms receipt "Tôi đã nhận được tiền" (AC-RF-05)
   */
  async confirmReceivedRefund(userId, refundId) {
    const { rows } = await db.query(
      `SELECT * FROM refund_requests WHERE id = $1 AND customer_id = $2`,
      [refundId, userId],
    );
    const refund = rows[0];
    if (!refund) throw new AppError('Không tìm thấy yêu cầu hoàn tiền.', 404, ErrorCodes.RESOURCE_NOT_FOUND);

    const auditTrail = appendAuditTrail(refund.audit_trail, {
      userId,
      role: 'CUSTOMER',
      action: 'CONFIRM_REFUND_RECEIVED',
      stateBefore: { status: refund.status },
      stateAfter: { status: 'REFUNDED' },
    });

    const { rows: updated } = await db.query(
      `
      UPDATE refund_requests
      SET status = 'REFUNDED',
          refunded_at = NOW(),
          disputed = false,
          audit_trail = $2::jsonb,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [refundId, JSON.stringify(auditTrail)],
    );

    return updated[0];
  }

  /**
   * Organizer Refund Worklist (Section 7.20)
   */
  async getRefundWorklist(userId, eventId) {
    const organizerId = await this.resolveOrganizerId(userId);
    const { rows } = await db.query(
      `
      SELECT
        rr.id,
        rr.refund_code,
        rr.order_id,
        o.order_code,
        o.buyer_name,
        o.buyer_email,
        o.buyer_phone,
        rr.refund_amount,
        rr.status,
        rr.execution_mode,
        rr.refund_destination_source,
        rr.bank_name,
        rr.bank_account_name,
        rr.ready_at,
        rr.due_at,
        rr.disputed,
        rr.dispute_reason,
        rr.created_at
      FROM refund_requests rr
      JOIN orders o ON o.id = rr.order_id
      WHERE rr.event_id = $1 AND rr.organizer_id = $2
      ORDER BY rr.ready_at ASC NULLS LAST, rr.created_at ASC
      `,
      [eventId, organizerId],
    );
    return rows;
  }

  /**
   * Organizer marks refunds as SUBMITTED (Mode B bulk transfer)
   */
  async markRefundsSubmitted(userId, eventId, { refundIds, proofRef, note }) {
    const organizerId = await this.resolveOrganizerId(userId);
    if (!Array.isArray(refundIds) || refundIds.length === 0) {
      throw new AppError('Danh sách mã hoàn tiền không được rỗng.', 400, ErrorCodes.INVALID_INPUT);
    }

    const { rows } = await db.query(
      `
      UPDATE refund_requests
      SET status = 'SUBMITTED',
          organizer_transaction_ref = $3,
          organizer_note = $4,
          updated_at = NOW()
      WHERE id = ANY($1::uuid[])
        AND event_id = $2
        AND organizer_id = $5
        AND status IN ('APPROVED', 'PROCESSING')
      RETURNING id, refund_code, status
      `,
      [refundIds, eventId, proofRef || null, note || null, organizerId],
    );

    return rows;
  }

  /**
   * Admin reviews a pending revision (APPROVE | REJECT)
   */
  async reviewRevision(adminId, eventId, { decision, note }) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `SELECT * FROM events WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [eventId],
      );
      const event = rows[0];
      if (!event) {
        throw new AppError('Sự kiện không tồn tại.', 404, ErrorCodes.RESOURCE_NOT_FOUND);
      }

      if (!event.pending_revision || event.pending_revision.status !== 'SUBMITTED') {
        throw new AppError('Không tìm thấy bản sửa đổi nào đang chờ duyệt cho sự kiện này.', 400, ErrorCodes.INVALID_INPUT);
      }

      const revision = event.pending_revision;
      const revisionHistory = Array.isArray(event.revision_history) ? [...event.revision_history] : [];
      const payloadAfter = revision.payload_after || {};

      if (decision === 'APPROVE') {
        // 1. If sessions were updated in payload_after, update event_sessions
        if (Array.isArray(payloadAfter.sessions)) {
          for (const s of payloadAfter.sessions) {
            if (s.id) {
              await client.query(
                `
                UPDATE event_sessions
                SET session_name       = COALESCE($1, session_name),
                    start_time         = COALESCE($2, start_time),
                    end_time           = COALESCE($3, end_time),
                    checkin_start_time = COALESCE($4, checkin_start_time),
                    venue_id           = COALESCE($5, venue_id),
                    updated_at         = NOW()
                WHERE id = $6 AND event_id = $7
                `,
                [s.session_name || null, s.start_time || null, s.end_time || null, s.checkin_start_time || null, s.venue_id || null, s.id, eventId],
              );
            }
          }

          // Recalculate event min start_time & max end_time
          await client.query(
            `
            UPDATE events
            SET start_time = (SELECT MIN(start_time) FROM event_sessions WHERE event_id = $1),
                end_time   = (SELECT MAX(end_time) FROM event_sessions WHERE event_id = $1),
                updated_at = NOW()
            WHERE id = $1
            `,
            [eventId],
          );
        }

        // 2. If general event fields were updated in payload_after, apply them
        const generalFields = ['title', 'format', 'short_description', 'description', 'thumbnail_url', 'banner_url', 'category_id', 'additional_terms', 'require_attendee_info'];
        const updates = [];
        const updateVals = [];
        let uIdx = 1;

        for (const gf of generalFields) {
          if (payloadAfter[gf] !== undefined) {
            updates.push(`${gf} = $${uIdx}`);
            updateVals.push(payloadAfter[gf]);
            uIdx += 1;
          }
        }

        if (updates.length > 0) {
          updateVals.push(eventId);
          await client.query(
            `UPDATE events SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${uIdx}`,
            updateVals,
          );
        }
      }

      // 3. Release any CRITICAL_REVISION_PENDING block
      let currentBlocks = Array.isArray(event.sales_blocks) ? [...event.sales_blocks] : [];
      const { updatedBlocks } = releaseSalesBlock(currentBlocks, {
        reason: 'CRITICAL_REVISION_PENDING',
        releasedBy: adminId,
        userRole: 'ADMIN',
      });

      const newSalesStatus = computeSalesStatus({
        status: event.status,
        salesBlocks: updatedBlocks,
        currentSalesStatus: event.sales_status,
      });

      // 4. Archive revision into history and clear pending_revision
      const archivedRevision = {
        ...revision,
        status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
        admin_note: note || null,
      };
      revisionHistory.push(archivedRevision);

      const auditTrail = appendAuditTrail(event.audit_trail, {
        userId: adminId,
        role: 'ADMIN',
        action: decision === 'APPROVE' ? 'APPROVE_REVISION' : 'REJECT_REVISION',
        reason: note || (decision === 'APPROVE' ? 'Phê duyệt bản sửa đổi' : 'Từ chối bản sửa đổi'),
        diff: revision.diff,
      });

      const updateRes = await client.query(
        `
        UPDATE events
        SET pending_revision = NULL,
            revision_history = $1::jsonb,
            sales_blocks     = $2::jsonb,
            sales_status     = $3,
            audit_trail      = $4::jsonb,
            version          = version + 1,
            updated_at       = NOW()
        WHERE id = $5
        RETURNING *
        `,
        [JSON.stringify(revisionHistory), JSON.stringify(updatedBlocks), newSalesStatus, JSON.stringify(auditTrail), eventId],
      );

      await client.query('COMMIT');
      return updateRes.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = new EventBusinessRulesService();
