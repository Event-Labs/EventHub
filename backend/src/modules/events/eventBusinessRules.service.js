const crypto = require('crypto');
const db = require('../../infrastructure/database/db.client');
const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const fieldCrypto = require('../../core/security/fieldCrypto');
const logger = require('../../core/logger');
const notificationsService = require('../notifications/notifications.service');
const ordersRepository = require('../orders/orders.repository');
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

const { resolveBankName, resolveBankBin, BIN_TO_BANK_NAME } = require('../../common/utils/bankHelper');

function resolvePayerBankInfo(po, fallbackOrganizerId) {
  let rawAccNum = po.payer_account_number;
  if (rawAccNum && fieldCrypto.isEncrypted(rawAccNum)) {
    const keysToTry = [po.organizer_id, fallbackOrganizerId, 'platform'].filter(Boolean);
    for (const k of keysToTry) {
      try {
        rawAccNum = fieldCrypto.decrypt(rawAccNum, k, 'payer_account_number', { allowLegacy: true });
        break;
      } catch (_) {}
    }
  }

  let bankName = resolveBankName(po.payer_bank_id);
  if (!bankName && po.raw_payload) {
    try {
      const rawData = typeof po.raw_payload === 'string' ? JSON.parse(po.raw_payload) : po.raw_payload;
      const tx0 = rawData?.data?.transactions?.[0] || rawData?.transactions?.[0] || {};
      const candidate =
        rawData?.data?.counterAccountBankName ||
        rawData?.counterAccountBankName ||
        tx0.counterAccountBankName ||
        rawData?.data?.counterAccountBankId ||
        tx0.counterAccountBankId;
      bankName = resolveBankName(candidate) || candidate;
    } catch (_) {}
  }
  return { bankAccountNumber: rawAccNum, bankName: bankName || null };
}

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
        (
          SELECT COALESCE(COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'PAID'), 0)::int
          FROM orders o
          WHERE o.id IN (
            SELECT oi.order_id
            FROM order_items oi
            JOIN ticket_types tt ON tt.id = oi.ticket_type_id
            JOIN event_sessions es ON es.id = tt.event_session_id
            WHERE es.event_id = e.id
          )
        ) AS paid_orders_count,
        (
          SELECT COALESCE(COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'PENDING' AND o.expired_at > now()), 0)::int
          FROM orders o
          WHERE o.id IN (
            SELECT oi.order_id
            FROM order_items oi
            JOIN ticket_types tt ON tt.id = oi.ticket_type_id
            JOIN event_sessions es ON es.id = tt.event_session_id
            WHERE es.event_id = e.id
          )
        ) AS pending_orders_count,
        (
          SELECT COALESCE(SUM(o.total_amount) FILTER (WHERE o.status = 'PAID'), 0)::numeric
          FROM orders o
          WHERE o.id IN (
            SELECT oi.order_id
            FROM order_items oi
            JOIN ticket_types tt ON tt.id = oi.ticket_type_id
            JOIN event_sessions es ON es.id = tt.event_session_id
            WHERE es.event_id = e.id
          )
        ) AS total_paid_amount,
        (
          SELECT COALESCE(COUNT(DISTINCT t.id) FILTER (WHERE t.status IN ('VALID', 'USED', 'REFUND_REQUESTED')), 0)::int
          FROM tickets t
          JOIN ticket_types tt ON tt.id = t.ticket_type_id
          JOIN event_sessions es ON es.id = tt.event_session_id
          WHERE es.event_id = e.id
        ) AS issued_tickets_count,
        (
          SELECT COALESCE(COUNT(DISTINCT th.id), 0)::int
          FROM ticket_holds th
          JOIN ticket_types tt ON tt.id = th.ticket_type_id
          JOIN event_sessions es ON es.id = tt.event_session_id
          WHERE es.event_id = e.id AND th.status = 'ACTIVE' AND th.expires_at > now()
        ) AS active_holds_count
      FROM events e
      WHERE e.id = $1
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
   * Process CONFIRMED (0d / free) orders when an event is cancelled (Decision 2.9)
   * - Does NOT create refund_requests for tickets with payable_price = 0 or CONFIRMED orders
   * - Sets ticket status to CANCELLED
   * - Releases assigned seats to AVAILABLE
   * - Sets order status to CANCELLED with reason EVENT_CANCELLED
   * - Idempotently reverts promo code usage (if voucher was applied)
   * - Appends to orders.audit_trail
   */
  async processConfirmedOrdersOnCancellation(client, eventId) {
    const { rows: confirmedOrders } = await client.query(
      `
      SELECT o.id, o.promo_code_id, o.audit_trail
      FROM orders o
      WHERE o.status = 'CONFIRMED'
        AND EXISTS (
          SELECT 1
          FROM order_items oi
          JOIN ticket_types tt ON tt.id = oi.ticket_type_id
          JOIN event_sessions es ON es.id = tt.event_session_id
          WHERE oi.order_id = o.id AND es.event_id = $1
        )
      FOR UPDATE OF o
      `,
      [eventId],
    );

    for (const order of confirmedOrders) {
      await client.query(
        `
        UPDATE tickets
        SET status = 'CANCELLED'
        WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id = $1)
          AND status = 'VALID'
        `,
        [order.id],
      );

      await client.query(
        `
        UPDATE session_seats
        SET status = 'AVAILABLE', order_id = NULL
        WHERE order_id = $1
        `,
        [order.id],
      );

      if (order.promo_code_id) {
        await ordersRepository.revertPromoCodeUsageForOrder(order.id, client);
      }

      const auditEntry = {
        action: 'EVENT_CANCELLED_VOID_ZERO_ORDER',
        reason: 'Sự kiện bị hủy, đơn hàng 0đ được hủy tự động và giải phóng tài nguyên',
        timestamp: new Date().toISOString(),
      };

      await client.query(
        `
        UPDATE orders
        SET status = 'CANCELLED',
            status_reason = 'EVENT_CANCELLED',
            audit_trail = COALESCE(audit_trail, '[]'::jsonb) || $2::jsonb,
            updated_at = NOW()
        WHERE id = $1
        `,
        [order.id, JSON.stringify([auditEntry])],
      );
    }
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
  async pauseSales(userId, eventId, { reason, note, scope, ticketTypeId, ticketTypeIds, ticketTypeName, ticketTypes, sessionId, seatIds, seatLabels } = {}) {
    const organizerId = await this.resolveOrganizerId(userId);
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const event = await this.assertOwnsEvent(client, eventId, organizerId);

      const humanNote = (note || reason || '').trim() || null;
      const targetIds = Array.isArray(ticketTypeIds) && ticketTypeIds.length > 0
        ? ticketTypeIds.map(String)
        : (ticketTypeId ? [String(ticketTypeId)] : []);
      const targetSeatIds = Array.isArray(seatIds) ? seatIds.map(String) : [];
      const isSpecific = scope === 'SPECIFIC' && targetIds.length > 0;
      const isSeats = scope === 'SEATS' && targetSeatIds.length > 0;

      let updatedBlocks = Array.isArray(event.sales_blocks) ? [...event.sales_blocks] : [];

      if (isSeats) {
        // 1. Block specified seats in session_seats
        await client.query(
          `
          UPDATE session_seats
          SET status = 'BLOCKED'
          WHERE seat_id = ANY($1::uuid[])
            AND ($2::uuid IS NULL OR event_session_id = $2)
            AND (status = 'AVAILABLE' OR status IS NULL)
          `,
          [targetSeatIds, sessionId || null],
        );

        // 2. Add seat sales block
        updatedBlocks.push({
          id: require('crypto').randomUUID(),
          reason: SALES_BLOCK_REASONS.ORGANIZER_PAUSE,
          source: 'ORGANIZER',
          created_by: userId,
          created_at: new Date().toISOString(),
          released_by: null,
          released_at: null,
          metadata: {
            reason: humanNote,
            note: humanNote,
            scope: 'SEATS',
            session_id: sessionId || null,
            seat_ids: targetSeatIds,
            seat_labels: seatLabels || [],
            count: targetSeatIds.length,
          },
        });
      } else if (isSpecific) {
        const nameMap = new Map();
        if (Array.isArray(ticketTypes)) {
          ticketTypes.forEach((t) => nameMap.set(String(t.id), t.name));
        }

        for (const tId of targetIds) {
          const alreadyActive = updatedBlocks.find(
            (b) => b.reason === SALES_BLOCK_REASONS.ORGANIZER_PAUSE && !b.released_at && String(b.metadata?.ticket_type_id) === tId,
          );
          if (!alreadyActive) {
            const tName = nameMap.get(tId) || ticketTypeName || 'Hạng vé cụ thể';
            updatedBlocks.push({
              id: require('crypto').randomUUID(),
              reason: SALES_BLOCK_REASONS.ORGANIZER_PAUSE,
              source: 'ORGANIZER',
              created_by: userId,
              created_at: new Date().toISOString(),
              released_by: null,
              released_at: null,
              metadata: {
                reason: humanNote,
                note: humanNote,
                scope: 'SPECIFIC',
                ticket_type_id: tId,
                ticket_type_name: tName,
              },
            });
          }
        }
      } else {
        const res = addSalesBlock(updatedBlocks, {
          reason: SALES_BLOCK_REASONS.ORGANIZER_PAUSE,
          source: 'ORGANIZER',
          createdBy: userId,
          metadata: { reason: humanNote, note: humanNote, scope: 'ALL' },
        });
        updatedBlocks = res.updatedBlocks;
      }

      // Check if there is still an event-wide block active
      const hasEventWideBlock = updatedBlocks.some(
        (b) => !b.released_at && !(b.metadata?.scope === 'SPECIFIC' && b.metadata?.ticket_type_id) && !(b.metadata?.scope === 'SEATS')
      );
      const newSalesStatus = hasEventWideBlock ? 'PAUSED' : 'ON_SALE';

      const auditTrail = appendAuditTrail(event.audit_trail, {
        userId,
        role: 'ORGANIZER',
        action: isSeats ? 'PAUSE_SEAT_SALES' : isSpecific ? 'PAUSE_TICKET_SALES' : 'PAUSE_SALES',
        reason: humanNote || (isSeats ? `Tạm dừng bán vé cho ${targetSeatIds.length} vị trí ghế` : isSpecific ? `Tạm dừng bán vé cho ${targetIds.length} loại vé` : 'Tạm dừng bán vé'),
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
  async resumeSales(userId, eventId, { ticketTypeId, ticketTypeIds, scope, sessionId, seatIds } = {}) {
    const organizerId = await this.resolveOrganizerId(userId);
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const event = await this.assertOwnsEvent(client, eventId, organizerId);

      if (event.display_state === 'SUSPENDED_BY_ADMIN' || (event.sales_blocks || []).some((b) => b.reason === 'SUSPENDED' && !b.released_at)) {
        throw new AppError('Sự kiện bị đình chỉ bởi Quản trị viên, Ban tổ chức không thể tự mở lại.', 403, ErrorCodes.SUSPENDED_BY_ADMIN);
      }

      if (event.display_state === 'HIDDEN_BY_ORGANIZER' || event.status === 'HIDDEN' || (event.sales_blocks || []).some((b) => b.reason === 'HIDE' && !b.released_at)) {
        throw new AppError('Không thể kích hoạt bán vé khi sự kiện đang bị ẩn. Vui lòng hiện lại sự kiện trước.', 400, ErrorCodes.EVENT_INVALID_STATE);
      }

      let updatedBlocks = Array.isArray(event.sales_blocks) ? [...event.sales_blocks] : [];
      const targetResumeIds = Array.isArray(ticketTypeIds) && ticketTypeIds.length > 0
        ? ticketTypeIds.map(String)
        : (ticketTypeId ? [String(ticketTypeId)] : null);
      const targetResumeSeatIds = Array.isArray(seatIds) && seatIds.length > 0
        ? seatIds.map(String)
        : null;
      const isSeats = scope === 'SEATS' && targetResumeSeatIds && targetResumeSeatIds.length > 0;

      if (isSeats) {
        // Unblock specific seats in session_seats
        await client.query(
          `
          UPDATE session_seats
          SET status = 'AVAILABLE'
          WHERE seat_id = ANY($1::uuid[])
            AND ($2::uuid IS NULL OR event_session_id = $2)
            AND status = 'BLOCKED'
          `,
          [targetResumeSeatIds, sessionId || null],
        );

        updatedBlocks = updatedBlocks.map((b) => {
          if (
            b.reason === SALES_BLOCK_REASONS.ORGANIZER_PAUSE &&
            !b.released_at &&
            b.metadata?.scope === 'SEATS'
          ) {
            const remainingSeats = (b.metadata?.seat_ids || []).filter(
              (sid) => !targetResumeSeatIds.includes(String(sid))
            );
            if (remainingSeats.length === 0) {
              return {
                ...b,
                released_by: userId,
                released_at: new Date().toISOString(),
              };
            }
            return {
              ...b,
              metadata: {
                ...b.metadata,
                seat_ids: remainingSeats,
                count: remainingSeats.length,
              },
            };
          }
          return b;
        });
      } else if (targetResumeIds && targetResumeIds.length > 0) {
        updatedBlocks = updatedBlocks.map((b) => {
          if (
            b.reason === SALES_BLOCK_REASONS.ORGANIZER_PAUSE &&
            !b.released_at &&
            (targetResumeIds.includes(String(b.metadata?.ticket_type_id)) || targetResumeIds.includes(String(b.id)))
          ) {
            return {
              ...b,
              released_by: userId,
              released_at: new Date().toISOString(),
            };
          }
          return b;
        });
      } else {
        // Resume all: unblock all blocked session_seats for this event and release all pause blocks
        await client.query(
          `
          UPDATE session_seats ss
          SET status = 'AVAILABLE'
          FROM event_sessions es
          WHERE ss.event_session_id = es.id
            AND es.event_id = $1
            AND ss.status = 'BLOCKED'
          `,
          [eventId],
        );

        updatedBlocks = updatedBlocks.map((b) => {
          if (b.reason === SALES_BLOCK_REASONS.ORGANIZER_PAUSE && !b.released_at) {
            return {
              ...b,
              released_by: userId,
              released_at: new Date().toISOString(),
            };
          }
          return b;
        });
      }

      const remainingActive = updatedBlocks.filter((b) => !b.released_at);
      const newSalesStatus = computeSalesStatus({
        status: event.status,
        salesBlocks: remainingActive,
        currentSalesStatus: event.sales_status,
      });

      const auditTrail = appendAuditTrail(event.audit_trail, {
        userId,
        role: 'ORGANIZER',
        action: targetResumeIds ? 'RESUME_TICKET_SALES' : 'RESUME_SALES',
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

      // 6. Process CONFIRMED orders and free tickets (Decision 2.9: cancel tickets, release seats, revert voucher, void order)
      await this.processConfirmedOrdersOnCancellation(client, eventId);

      // Cancel any remaining valid tickets for this event (defense-in-depth)
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

      notificationsService.notifyEventCancellation(eventId, {
        reason: note || 'Ban tổ chức hủy sự kiện',
      }).catch((e) => logger.warn(`[NOTIFY_NORMAL_CANCEL_ERR] ${e.message}`));

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
        refund_mode: refund_mode || null,
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
  async approveCancellationRequest(adminId, eventId, { note, locale } = {}) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const { rows: eventRows } = await client.query(
        `SELECT e.*, o.user_id AS organizer_user_id, o.business_email, u.email AS organizer_email 
         FROM events e 
         JOIN organizers o ON o.id = e.organizer_id 
         LEFT JOIN users u ON u.id = o.user_id 
         WHERE e.id = $1 FOR UPDATE OF e`,
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
        const { bankAccountNumber, bankName } = resolvePayerBankInfo(po, event.organizer_id);
        const hasCounter = Boolean(bankName && bankAccountNumber && po.payer_account_name);
        const dest = hasCounter ? 'PAYER_ACCOUNT' : 'CUSTOMER_INPUT';
        // Dual SLA: ready_at and due_at (7-day timer) start only after customer confirms or supplies payout info
        const readyAt = null;
        const dueAt = null;
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
            $5, 'Sự kiện bị hủy', 'APPROVED', 'ORGANIZER_MANUAL',
            $6, $7, $8,
            $9, $10, $11, $12,
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
            dueAt,
            refundCode,
            bankName,
            bankAccountNumber,
            po.payer_account_name,
          ],
        );
      }

      // Process CONFIRMED orders and free tickets (Decision 2.9: cancel tickets, release seats, revert voucher, void order)
      await this.processConfirmedOrdersOnCancellation(client, eventId);

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

      // Notify attendees & organizer
      notificationsService.notifyEventCancellation(eventId, {
        reason: cancelReq.note || cancelReq.reason_note || 'Theo yêu cầu từ Ban tổ chức',
        locale,
      }).catch((e) => logger.warn(`[NOTIFY_ATTENDEES_CANCEL_ERR] ${e.message}`));

      if (event.organizer_user_id) {
        const organizerEmail = event.business_email || event.organizer_email;
        notificationsService.createAndDispatch(
          {
            userId: event.organizer_user_id,
            eventId,
            title: 'Yêu cầu hủy sự kiện đã được duyệt',
            content: `Yêu cầu hủy sự kiện "${event.title}" đã được Quản trị viên phê duyệt. Tiến trình hoàn tiền 100% cho khách hàng đã được khởi tạo. Vui lòng vào mục Quản lý yêu cầu Hoàn vé để kiểm tra và thực hiện hoàn tiền cho người mua.`,
            type: 'EVENT',
          },
          organizerEmail
            ? {
                email: organizerEmail,
                subject: `[EventHub] Yêu cầu hủy sự kiện "${event.title}" đã được duyệt`,
              }
            : {},
        ).catch((e) => logger.warn(`[NOTIFY_ORGANIZER_CANCEL_ERR] ${e.message}`));
      }

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
      const releaseResult = releaseSalesBlock(event.sales_blocks, {
        reason: SALES_BLOCK_REASONS.CANCELLATION_REQUESTED,
        releasedBy: adminId,
        userRole: 'ADMIN',
      });

      // 2. Add ORGANIZER_PAUSE sales block so the event status returns to PAUSED instead of automatically switching to ON_SALE
      const orgUserId = event.organizer_user_id || (await this.resolveOrganizerUserId(event.organizer_id));
      const humanNote = note
        ? `Tạm dừng bán vé sau khi yêu cầu hủy bị từ chối. Lý do từ chối: ${note}`
        : 'Tạm dừng bán vé sau khi yêu cầu hủy bị từ chối';

      const { updatedBlocks } = addSalesBlock(releaseResult.updatedBlocks, {
        reason: SALES_BLOCK_REASONS.ORGANIZER_PAUSE,
        source: 'ORGANIZER',
        createdBy: orgUserId || adminId,
        metadata: {
          scope: 'ALL',
          reason: humanNote,
          note: humanNote,
        },
      });

      // 3. Recompute sales status (will evaluate to PAUSED due to ORGANIZER_PAUSE block)
      const newSalesStatus = computeSalesStatus({
        status: event.status,
        salesBlocks: updatedBlocks,
        currentSalesStatus: event.sales_status,
      });

      // 4. Update cancel_request to REJECTED
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

      // Notify organizer of rejection
      if (orgUserId) {
        let organizerEmail = null;
        try {
          const { rows: uRows } = await client.query(
            `SELECT u.email, o.business_email FROM users u LEFT JOIN organizers o ON o.user_id = u.id WHERE u.id = $1`,
            [orgUserId],
          );
          if (uRows.length > 0) {
            organizerEmail = uRows[0].business_email || uRows[0].email;
          }
        } catch (_) {}

        notificationsService.createAndDispatch(
          {
            userId: orgUserId,
            eventId,
            title: 'Yêu cầu hủy sự kiện bị từ chối',
            content: `Yêu cầu hủy sự kiện "${event.title}" đã bị Quản trị viên từ chối${note ? ` với lý do: "${note}"` : ''}. Trạng thái bán vé của sự kiện được chuyển về Tạm dừng bán vé. Bạn có thể mở bán lại vé khi đã sẵn sàng.`,
            type: 'EVENT',
          },
          organizerEmail
            ? {
                email: organizerEmail,
                subject: `[EventHub] Yêu cầu hủy sự kiện "${event.title}" bị từ chối`,
              }
            : {},
        ).catch((e) => logger.warn(`[NOTIFY_ORGANIZER_REJECT_ERR] ${e.message}`));
      }

      return rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Helper to resolve organizer user_id from organizer_id
   */
  async resolveOrganizerUserId(organizerId) {
    if (!organizerId) return null;
    const { rows } = await db.query(`SELECT user_id FROM organizers WHERE id = $1 LIMIT 1`, [organizerId]);
    return rows[0]?.user_id || null;
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
        `SELECT e.*, o.user_id AS organizer_user_id, o.business_email, u.email AS organizer_email 
         FROM events e 
         JOIN organizers o ON o.id = e.organizer_id 
         LEFT JOIN users u ON u.id = o.user_id 
         WHERE e.id = $1 FOR UPDATE OF e`,
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
        const { bankAccountNumber, bankName } = resolvePayerBankInfo(po, event.organizer_id);
        const hasCounter = Boolean(bankName && bankAccountNumber && po.payer_account_name);
        const dest = hasCounter ? 'PAYER_ACCOUNT' : 'CUSTOMER_INPUT';
        // Dual SLA: ready_at and due_at (7-day timer) start only after customer confirms or supplies payout info
        const readyAt = null;
        const dueAt = null;
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
            $5, 'Sự kiện bị hủy', 'APPROVED', 'ORGANIZER_MANUAL',
            $6, $7, $8,
            $9, $10, $11, $12,
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
            dueAt,
            refundCode,
            bankName,
            bankAccountNumber,
            po.payer_account_name,
          ],
        );
      }

      // Process CONFIRMED orders and free tickets (Decision 2.9: cancel tickets, release seats, revert voucher, void order)
      await this.processConfirmedOrdersOnCancellation(client, eventId);

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

      // Notify attendees & organizer
      notificationsService.notifyEventCancellation(eventId, {
        reason: cancelReq.note || 'Theo quyết định từ Ban quản trị nền tảng',
      }).catch((e) => logger.warn(`[NOTIFY_ATTENDEES_FORCE_CANCEL_ERR] ${e.message}`));

      if (event.organizer_user_id) {
        notificationsService.createAndDispatch({
          userId: event.organizer_user_id,
          eventId,
          title: 'Sự kiện đã bị hủy cưỡng chế',
          content: `Sự kiện "${event.title}" đã bị Quản trị viên hủy cưỡng chế sau thời gian chờ Cooling-off. Tiến trình hoàn tiền 100% cho khách hàng đã được kích hoạt.`,
          type: 'EVENT',
        }).catch((e) => logger.warn(`[NOTIFY_ORGANIZER_FORCE_CANCEL_ERR] ${e.message}`));
      }

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
  async submitPayoutInfo(userId, payload = {}) {
    const refundId = payload.refundId || payload.refund_request_id || payload.id;
    const bankName = payload.bankName || payload.bank_name;
    const rawAccountNumber = payload.bankAccountNumber || payload.bank_account_number;
    const bankAccountNumber = rawAccountNumber ? String(rawAccountNumber).trim().replace(/\s+/g, '') : '';
    const bankAccountName = payload.bankAccountName || payload.bank_account_name ? String(payload.bankAccountName || payload.bank_account_name).trim().toUpperCase() : '';

    if (!refundId) {
      throw new AppError('Thiếu mã yêu cầu hoàn tiền.', 400, ErrorCodes.INVALID_INPUT);
    }
    if (!bankName || !bankAccountNumber || !bankAccountName) {
      throw new AppError('Vui lòng cung cấp đầy đủ thông tin: Ngân hàng, Số tài khoản và Tên chủ tài khoản.', 400, ErrorCodes.INVALID_INPUT);
    }

    const { rows } = await db.query(
      `
      SELECT rr.*, o.organizer_id, o.buyer_name
      FROM refund_requests rr
      JOIN orders o ON o.id = rr.order_id
      WHERE rr.id = $1 AND (rr.customer_id = $2 OR o.user_id = $2)
      `,
      [refundId, userId],
    );
    const refund = rows[0];
    if (!refund) throw new AppError('Không tìm thấy yêu cầu hoàn tiền.', 404, ErrorCodes.RESOURCE_NOT_FOUND);

    if (['SUBMITTED', 'REFUNDED'].includes(refund.status)) {
      throw new AppError('Yêu cầu hoàn tiền đã gửi lệnh chi hoặc đã hoàn tất, không thể thay đổi thông tin.', 400, ErrorCodes.REFUND_INFO_LOCKED);
    }

    const auditTrail = appendAuditTrail(refund.audit_trail, {
      userId,
      role: 'CUSTOMER',
      action: 'SUBMIT_PAYOUT_INFO',
      diff: { bankName, bankAccountNumber, bankAccountName },
    });

    const { rows: updated } = await db.query(
      `
      UPDATE refund_requests
      SET bank_name = $2,
          bank_account_number = $3,
          bank_account_name = $4,
          refund_destination_source = 'CUSTOMER_INPUT',
          status = 'PROCESSING',
          customer_confirmed_bank_at = NOW(),
          ready_at = NOW(),
          due_at = NOW() + interval '7 days',
          audit_trail = $5::jsonb,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [refundId, bankName, bankAccountNumber, bankAccountName, JSON.stringify(auditTrail)],
    );

    return updated[0];
  }

  /**
   * Customer confirms existing payout bank info "Xác nhận tài khoản này chính xác"
   */
  async confirmPayoutBank(userId, refundId) {
    if (!refundId) {
      throw new AppError('Thiếu mã yêu cầu hoàn tiền.', 400, ErrorCodes.INVALID_INPUT);
    }

    const { rows } = await db.query(
      `
      SELECT rr.*, o.organizer_id, o.buyer_name
      FROM refund_requests rr
      JOIN orders o ON o.id = rr.order_id
      WHERE rr.id = $1 AND (rr.customer_id = $2 OR o.user_id = $2)
      `,
      [refundId, userId],
    );
    const refund = rows[0];
    if (!refund) throw new AppError('Không tìm thấy yêu cầu hoàn tiền.', 404, ErrorCodes.RESOURCE_NOT_FOUND);

    if (!refund.bank_name || !refund.bank_account_number) {
      throw new AppError('Chưa có thông tin tài khoản ngân hàng để xác nhận.', 400, ErrorCodes.INVALID_INPUT);
    }

    if (['REFUNDED'].includes(refund.status)) {
      throw new AppError('Yêu cầu hoàn tiền đã hoàn tất, không thể thay đổi thông tin.', 400, ErrorCodes.REFUND_INFO_LOCKED);
    }

    const auditTrail = appendAuditTrail(refund.audit_trail, {
      userId,
      role: 'CUSTOMER',
      action: 'CONFIRM_PAYOUT_BANK',
      bankName: refund.bank_name,
      bankAccountNumber: refund.bank_account_number,
      bankAccountName: refund.bank_account_name,
      confirmed_at: new Date().toISOString(),
    });

    const { rows: updated } = await db.query(
      `
      UPDATE refund_requests
      SET customer_confirmed_bank_at = NOW(),
          ready_at = NOW(),
          due_at = NOW() + interval '7 days',
          status = CASE WHEN status = 'PENDING' THEN 'PROCESSING' ELSE status END,
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
   * Customer clicks "Tôi chưa nhận được tiền" (Dispute - Section 7.7, AC-RF-06)
   */
  async disputeRefund(userId, refundId, { reason }) {
    const { rows } = await db.query(
      `SELECT rr.*, o.order_code, e.title AS event_title, e.organizer_id AS event_organizer_id
       FROM refund_requests rr
       LEFT JOIN orders o ON o.id = rr.order_id
       LEFT JOIN events e ON e.id = rr.event_id
       WHERE rr.id = $1 AND rr.customer_id = $2`,
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

    try {
      const orgUserId = await this.resolveOrganizerUserId(refund.organizer_id || refund.event_organizer_id);
      if (orgUserId) {
        notificationsService.createAndDispatch({
          userId: orgUserId,
          eventId: refund.event_id,
          title: 'Khiếu nại hoàn tiền: Khách hàng chưa nhận được tiền',
          content: `Khách hàng khiếu nại chưa nhận được tiền hoàn đơn ${refund.order_code || refund.id}. Lý do: ${reason || 'Chưa nhận được tiền'}. Vui lòng kiểm tra lại đối soát.`,
          type: 'REFUND',
        }).catch(() => {});
      }
    } catch (e) {
      // ignore
    }

    return updated[0];
  }

  /**
   * Customer confirms receipt "Tôi đã nhận được tiền" (AC-RF-05)
   */
  async confirmReceivedRefund(userId, refundId) {
    const { rows } = await db.query(
      `SELECT rr.*, o.order_code, e.title AS event_title, e.organizer_id AS event_organizer_id
       FROM refund_requests rr
       LEFT JOIN orders o ON o.id = rr.order_id
       LEFT JOIN events e ON e.id = rr.event_id
       WHERE rr.id = $1 AND rr.customer_id = $2`,
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

    // Invalidate ticket(s) and order if not already REFUNDED
    if (refund.ticket_id) {
      await db.query(
        `UPDATE tickets SET status = 'REFUNDED' WHERE id = $1`,
        [refund.ticket_id],
      );
    } else if (refund.order_id) {
      await db.query(
        `UPDATE tickets SET status = 'REFUNDED'
         WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id = $1)
           AND status != 'REFUNDED'`,
        [refund.order_id],
      );
    }
    if (refund.order_id) {
      await db.query(
        `UPDATE orders SET status = 'REFUNDED', updated_at = now() WHERE id = $1 AND status != 'REFUNDED'`,
        [refund.order_id],
      );
    }

    try {
      const orgUserId = await this.resolveOrganizerUserId(refund.organizer_id || refund.event_organizer_id);
      if (orgUserId) {
        notificationsService.createAndDispatch({
          userId: orgUserId,
          eventId: refund.event_id,
          title: 'Khách hàng đã nhận được tiền hoàn',
          content: `Khách hàng đã xác nhận nhận đủ tiền hoàn ${Number(refund.refund_amount || 0).toLocaleString('vi-VN')} đ cho đơn hàng ${refund.order_code || refund.id}.`,
          type: 'PAYMENT',
        }).catch(() => {});
      }
    } catch (e) {
      // ignore
    }

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
    if (!['APPROVE', 'REJECT'].includes(decision)) {
      throw new AppError('Quyết định không hợp lệ (APPROVE hoặc REJECT)', 400, ErrorCodes.INVALID_INPUT);
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `SELECT e.*, o.user_id AS organizer_user_id 
         FROM events e 
         JOIN organizers o ON o.id = e.organizer_id 
         WHERE e.id = $1 AND e.deleted_at IS NULL FOR UPDATE`,
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

        // 2. If ticket_types were updated in payload_after, apply them to ticket_types table
        if (Array.isArray(payloadAfter.ticket_types)) {
          const { rows: sessionRows } = await client.query(
            `SELECT id FROM event_sessions WHERE event_id = $1`,
            [eventId],
          );
          const validSessionIds = new Set(sessionRows.map((r) => r.id));

          const { rows: existingTtRows } = await client.query(
            `SELECT tt.* FROM ticket_types tt
             JOIN event_sessions es ON es.id = tt.event_session_id
             WHERE es.event_id = $1`,
            [eventId],
          );
          const existingMap = new Map(existingTtRows.map((t) => [t.id, t]));
          const payloadIds = new Set(payloadAfter.ticket_types.filter((tt) => tt.id).map((tt) => tt.id));

          for (const tt of payloadAfter.ticket_types) {
            const sessionId = tt.event_session_id || tt.session_id;
            if (sessionId && validSessionIds.has(sessionId)) {
              if (tt.id && existingMap.has(tt.id)) {
                await client.query(
                  `
                  UPDATE ticket_types
                  SET name          = COALESCE($1, name),
                      description   = $2,
                      price         = COALESCE($3, price),
                      quantity      = COALESCE($4, quantity),
                      max_per_order = COALESCE($5, max_per_order),
                      sale_start    = COALESCE($6, sale_start),
                      sale_end      = COALESCE($7, sale_end),
                      is_seated     = COALESCE($8, is_seated)
                  WHERE id = $9 AND event_session_id = $10
                  `,
                  [
                    tt.name || null,
                    tt.description !== undefined ? tt.description : null,
                    tt.price !== undefined ? Number(tt.price) : null,
                    tt.quantity !== undefined ? Number(tt.quantity) : null,
                    tt.max_per_order !== undefined ? Number(tt.max_per_order) : null,
                    tt.sale_start || null,
                    tt.sale_end || null,
                    tt.is_seated !== undefined ? tt.is_seated : null,
                    tt.id,
                    sessionId,
                  ],
                );
              } else if (!tt.id) {
                await client.query(
                  `
                  INSERT INTO ticket_types (
                    event_session_id, name, description, price, quantity, max_per_order, sale_start, sale_end, is_seated, created_at
                  ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()
                  )
                  `,
                  [
                    sessionId,
                    tt.name || 'Vé tiêu chuẩn',
                    tt.description || null,
                    Number(tt.price || 0),
                    Number(tt.quantity || 100),
                    Number(tt.max_per_order || 10),
                    tt.sale_start || null,
                    tt.sale_end || null,
                    tt.is_seated || false,
                  ],
                );
              }
            }
          }

          // Delete removed ticket types only if they have NO paid orders
          for (const [existingId] of existingMap) {
            if (!payloadIds.has(existingId)) {
              const { rows: orderCheck } = await client.query(
                `SELECT 1 FROM order_items oi WHERE oi.ticket_type_id = $1 LIMIT 1`,
                [existingId],
              );
              if (orderCheck.length === 0) {
                await client.query(`DELETE FROM ticket_types WHERE id = $1`, [existingId]);
              }
            }
          }
        }

        // 3. If general event fields were updated in payload_after, apply them
        const generalFields = [
          'title',
          'format',
          'short_description',
          'description',
          'thumbnail_url',
          'banner_url',
          'category_id',
          'additional_terms',
          'require_attendee_info',
          'refund_policy',
          'seating_rules',
          'tags',
        ];
        const updates = [];
        const updateVals = [];
        let uIdx = 1;

        for (const gf of generalFields) {
          if (payloadAfter[gf] !== undefined) {
            if (['refund_policy', 'seating_rules'].includes(gf)) {
              updates.push(`${gf} = $${uIdx}::jsonb`);
              updateVals.push(JSON.stringify(payloadAfter[gf]));
            } else if (gf === 'tags') {
              updates.push(`${gf} = $${uIdx}`);
              updateVals.push(Array.isArray(payloadAfter[gf]) ? payloadAfter[gf] : []);
            } else if (gf === 'category_id') {
              updates.push(`${gf} = $${uIdx}`);
              updateVals.push(payloadAfter[gf] || null);
            } else {
              updates.push(`${gf} = $${uIdx}`);
              updateVals.push(payloadAfter[gf]);
            }
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

      // 4. Release any CRITICAL_REVISION_PENDING block
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

      // 5. Archive revision into history and clear pending_revision
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

      // 6. Dispatch notifications asynchronously
      if (decision === 'APPROVE') {
        notificationsService.notifyEventChange(eventId, {
          reason: note || 'Quản trị viên đã duyệt các cập nhật sự kiện',
          changeClass: revision.change_class,
        }).catch((e) => logger.warn(`[NOTIFY_REVISION_ATTENDEES_ERR] ${e.message}`));

        if (event.organizer_user_id) {
          const organizerEmail = event.business_email || event.organizer_email;
          notificationsService.createAndDispatch(
            {
              userId: event.organizer_user_id,
              eventId,
              title: 'Bản sửa đổi sự kiện đã được phê duyệt',
              content: `Bản sửa đổi cho sự kiện "${event.title}" đã được Quản trị viên phê duyệt thành công.`,
              type: 'EVENT',
            },
            organizerEmail
              ? {
                  email: organizerEmail,
                  subject: `[EventHub] Bản sửa đổi sự kiện "${event.title}" đã được phê duyệt`,
                }
              : {},
          ).catch((e) => logger.warn(`[NOTIFY_ORGANIZER_REVISION_APPROVED_ERR] ${e.message}`));
        }
      } else {
        if (event.organizer_user_id) {
          const organizerEmail = event.business_email || event.organizer_email;
          notificationsService.createAndDispatch(
            {
              userId: event.organizer_user_id,
              eventId,
              title: 'Bản sửa đổi sự kiện bị từ chối',
              content: `Bản sửa đổi cho sự kiện "${event.title}" đã bị Quản trị viên từ chối${note ? ` với lý do: "${note}"` : ''}.`,
              type: 'EVENT',
            },
            organizerEmail
              ? {
                  email: organizerEmail,
                  subject: `[EventHub] Bản sửa đổi sự kiện "${event.title}" bị từ chối`,
                }
              : {},
          ).catch((e) => logger.warn(`[NOTIFY_ORGANIZER_REVISION_REJECTED_ERR] ${e.message}`));
        }
      }

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
