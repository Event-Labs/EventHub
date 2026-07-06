const db = require('../../infrastructure/database/db.client');
const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');

const NEW_ACTIVITY_LOCK_MESSAGE =
  'Bạn cần có gói dịch vụ đang hoạt động để thực hiện thao tác này. Vui lòng mua hoặc gia hạn gói trước.';

function toLimit(value) {
  const limit = Number(value || 0);
  return Number.isFinite(limit) ? limit : 0;
}

function assertLimit(label, current, limit) {
  if (limit > 0 && current > limit) {
    throw new AppError(
      `${label} đã vượt giới hạn của gói hiện tại (${current}/${limit}). Vui lòng điều chỉnh dữ liệu hoặc nâng cấp gói.`,
      400,
      ErrorCodes.INVALID_INPUT,
      { label, current, limit },
    );
  }
}

class SubscriptionGuardService {
  async ensurePromoCodeEventsTable() {
    await db.query(`
      CREATE TABLE IF NOT EXISTS promo_code_events (
        promo_code_id UUID NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
        event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT now(),
        PRIMARY KEY (promo_code_id, event_id)
      )
    `);
  }

  async getActivePlanByOrganizerId(organizerId) {
    const { rows } = await db.query(
      `
      SELECT
        os.id,
        os.organizer_id,
        os.subscription_id,
        os.start_date,
        os.end_date,
        os.status,
        s.name,
        s.event_limit,
        s.staff_limit,
        s.max_active_events,
        s.max_tickets_per_event,
        s.max_staff_per_event,
        s.max_ticket_types_per_event,
        s.max_promo_codes_per_event,
        s.promo_code_enabled,
        s.seat_map_enabled,
        s.manual_checkin_enabled,
        s.attendee_export_enabled,
        s.advanced_analytics_enabled,
        s.ai_report_enabled,
        s.custom_branding_enabled,
        s.analytics_enabled,
        s.priority_support
      FROM organizer_subscriptions os
      JOIN subscriptions s ON s.id = os.subscription_id
      WHERE os.organizer_id = $1
        AND os.status = 'ACTIVE'
        AND os.start_date <= now()
        AND os.end_date >= now()
        AND s.deleted_at IS NULL
      ORDER BY os.start_date DESC
      LIMIT 1
      `,
      [organizerId],
    );

    return rows[0] || null;
  }

  async assertActivePlan(organizerId, action = 'thao tác này') {
    const plan = await this.getActivePlanByOrganizerId(organizerId);
    if (!plan) {
      throw new AppError(
        NEW_ACTIVITY_LOCK_MESSAGE,
        403,
        ErrorCodes.AUTH_FORBIDDEN,
        { action },
      );
    }
    return plan;
  }

  async getOrganizerUsage(organizerId, eventId = null) {
    await this.ensurePromoCodeEventsTable();
    const params = [organizerId];
    const eventClause = eventId ? `AND e.id = $${params.push(eventId)}` : '';

    const { rows } = await db.query(
      `
      SELECT
        COUNT(DISTINCT e.id) FILTER (
          WHERE e.status IN ('PENDING_REVIEW', 'COMPLETED', 'PUBLISHED')
        )::int AS active_events,
        COUNT(DISTINCT tt.id)::int AS ticket_types,
        COALESCE(SUM(tt.quantity), 0)::int AS ticket_capacity,
        COUNT(DISTINCT es.staff_id)::int AS staff_count,
        COUNT(DISTINCT pc.id) FILTER (WHERE pc.is_active = true)::int AS promo_codes,
        COUNT(DISTINCT sess.seat_map_id) FILTER (WHERE sess.seat_map_id IS NOT NULL)::int AS seat_map_sessions
      FROM events e
      LEFT JOIN event_sessions sess ON sess.event_id = e.id
      LEFT JOIN ticket_types tt ON tt.event_session_id = sess.id
      LEFT JOIN event_staffs es ON es.event_id = e.id
      LEFT JOIN promo_codes pc ON pc.organizer_id = e.organizer_id
        AND (
          pc.event_id = e.id
          OR EXISTS (
            SELECT 1
            FROM promo_code_events pce
            WHERE pce.promo_code_id = pc.id
              AND pce.event_id = e.id
          )
        )
      WHERE e.organizer_id = $1
        AND e.deleted_at IS NULL
        ${eventClause}
      `,
      params,
    );

    return {
      active_events: Number(rows[0]?.active_events || 0),
      ticket_types: Number(rows[0]?.ticket_types || 0),
      ticket_capacity: Number(rows[0]?.ticket_capacity || 0),
      staff_count: Number(rows[0]?.staff_count || 0),
      promo_codes: Number(rows[0]?.promo_codes || 0),
      seat_map_sessions: Number(rows[0]?.seat_map_sessions || 0),
    };
  }

  async assertEventSubmitAllowed(organizerId, eventId) {
    const plan = await this.assertActivePlan(organizerId, 'submit event');
    const organizerUsage = await this.getOrganizerUsage(organizerId);
    const eventUsage = await this.getOrganizerUsage(organizerId, eventId);

    assertLimit('Số sự kiện hoạt động', organizerUsage.active_events + 1, toLimit(plan.max_active_events || plan.event_limit));
    assertLimit('Số loại vé của sự kiện', eventUsage.ticket_types, toLimit(plan.max_ticket_types_per_event));
    assertLimit('Tổng số vé của sự kiện', eventUsage.ticket_capacity, toLimit(plan.max_tickets_per_event));
    assertLimit('Số nhân sự của sự kiện', eventUsage.staff_count, toLimit(plan.max_staff_per_event || plan.staff_limit));
    assertLimit('Số mã khuyến mãi của sự kiện', eventUsage.promo_codes, toLimit(plan.max_promo_codes_per_event));

    if (eventUsage.promo_codes > 0 && !plan.promo_code_enabled) {
      throw new AppError('Gói hiện tại không hỗ trợ mã khuyến mãi. Vui lòng xóa mã khuyến mãi hoặc nâng cấp gói.', 400, ErrorCodes.INVALID_INPUT);
    }

    if (eventUsage.seat_map_sessions > 0 && !plan.seat_map_enabled) {
      throw new AppError('Gói hiện tại không hỗ trợ sơ đồ ghế. Vui lòng bỏ sơ đồ ghế hoặc nâng cấp gói.', 400, ErrorCodes.INVALID_INPUT);
    }

    return { plan, usage: eventUsage };
  }

  async assertPublishAllowed(organizerId) {
    return this.assertActivePlan(organizerId, 'publish event');
  }

  async assertPromoCreationAllowed(organizerId, eventIds = []) {
    const plan = await this.assertActivePlan(organizerId, 'create promo code');
    if (!plan.promo_code_enabled) {
      throw new AppError('Gói hiện tại không hỗ trợ tạo mã khuyến mãi. Vui lòng nâng cấp gói để sử dụng tính năng này.', 403, ErrorCodes.AUTH_FORBIDDEN);
    }

    for (const eventId of eventIds) {
      const usage = await this.getOrganizerUsage(organizerId, eventId);
      assertLimit('Số mã khuyến mãi của sự kiện', usage.promo_codes + 1, toLimit(plan.max_promo_codes_per_event));
    }

    return plan;
  }

  async assertSeatMapCreationAllowed(organizerId) {
    const plan = await this.assertActivePlan(organizerId, 'create seat map');
    if (!plan.seat_map_enabled) {
      throw new AppError('Gói hiện tại không hỗ trợ sơ đồ ghế. Vui lòng nâng cấp gói để sử dụng tính năng này.', 403, ErrorCodes.AUTH_FORBIDDEN);
    }
    return plan;
  }
}

module.exports = new SubscriptionGuardService();
