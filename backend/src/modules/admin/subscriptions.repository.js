const db = require('../../infrastructure/database/db.client');

const SUBSCRIPTION_SELECT = `
  s.id,
  s.name,
  s.price,
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
  s.priority_support,
  s.is_active,
  s.created_at,
  s.updated_at,
  s.deleted_at,
  COUNT(os.id)::int AS subscriber_count
`;

class SubscriptionsRepository {
  async findAll() {
    const { rows } = await db.query(`
      SELECT ${SUBSCRIPTION_SELECT}
      FROM subscriptions s
      LEFT JOIN organizer_subscriptions os
        ON os.subscription_id = s.id
        AND os.status = 'ACTIVE'
      WHERE s.deleted_at IS NULL
      GROUP BY s.id
      ORDER BY s.price ASC, s.name ASC
    `);
    return rows;
  }

  async findById(id) {
    const { rows } = await db.query(`
      SELECT ${SUBSCRIPTION_SELECT}
      FROM subscriptions s
      LEFT JOIN organizer_subscriptions os
        ON os.subscription_id = s.id
        AND os.status = 'ACTIVE'
      WHERE s.id = $1 AND s.deleted_at IS NULL
      GROUP BY s.id
      LIMIT 1
    `, [id]);
    return rows[0];
  }

  async create(payload) {
    const { rows } = await db.query(`
      INSERT INTO subscriptions (
        name,
        price,
        event_limit,
        staff_limit,
        max_active_events,
        max_tickets_per_event,
        max_staff_per_event,
        max_ticket_types_per_event,
        max_promo_codes_per_event,
        promo_code_enabled,
        seat_map_enabled,
        manual_checkin_enabled,
        attendee_export_enabled,
        advanced_analytics_enabled,
        ai_report_enabled,
        custom_branding_enabled,
        analytics_enabled,
        priority_support,
        is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING id
    `, [
      payload.name,
      payload.price,
      payload.event_limit,
      payload.staff_limit,
      payload.max_active_events,
      payload.max_tickets_per_event,
      payload.max_staff_per_event,
      payload.max_ticket_types_per_event,
      payload.max_promo_codes_per_event,
      payload.promo_code_enabled,
      payload.seat_map_enabled,
      payload.manual_checkin_enabled,
      payload.attendee_export_enabled,
      payload.advanced_analytics_enabled,
      payload.ai_report_enabled,
      payload.custom_branding_enabled,
      payload.analytics_enabled,
      payload.priority_support,
      payload.is_active,
    ]);

    return this.findById(rows[0].id);
  }

  async update(id, updates) {
    const sets = [];
    const values = [];

    const addSet = (column, value, cast = '') => {
      values.push(value);
      sets.push(`${column} = $${values.length}${cast}`);
    };

    if (updates.name !== undefined) addSet('name', updates.name);
    if (updates.price !== undefined) addSet('price', updates.price);
    if (updates.event_limit !== undefined) addSet('event_limit', updates.event_limit);
    if (updates.staff_limit !== undefined) addSet('staff_limit', updates.staff_limit);
    if (updates.max_active_events !== undefined) addSet('max_active_events', updates.max_active_events);
    if (updates.max_tickets_per_event !== undefined) addSet('max_tickets_per_event', updates.max_tickets_per_event);
    if (updates.max_staff_per_event !== undefined) addSet('max_staff_per_event', updates.max_staff_per_event);
    if (updates.max_ticket_types_per_event !== undefined) addSet('max_ticket_types_per_event', updates.max_ticket_types_per_event);
    if (updates.max_promo_codes_per_event !== undefined) addSet('max_promo_codes_per_event', updates.max_promo_codes_per_event);
    if (updates.promo_code_enabled !== undefined) addSet('promo_code_enabled', updates.promo_code_enabled);
    if (updates.seat_map_enabled !== undefined) addSet('seat_map_enabled', updates.seat_map_enabled);
    if (updates.manual_checkin_enabled !== undefined) addSet('manual_checkin_enabled', updates.manual_checkin_enabled);
    if (updates.attendee_export_enabled !== undefined) addSet('attendee_export_enabled', updates.attendee_export_enabled);
    if (updates.advanced_analytics_enabled !== undefined) addSet('advanced_analytics_enabled', updates.advanced_analytics_enabled);
    if (updates.ai_report_enabled !== undefined) addSet('ai_report_enabled', updates.ai_report_enabled);
    if (updates.custom_branding_enabled !== undefined) addSet('custom_branding_enabled', updates.custom_branding_enabled);
    if (updates.analytics_enabled !== undefined) addSet('analytics_enabled', updates.analytics_enabled);
    if (updates.priority_support !== undefined) addSet('priority_support', updates.priority_support);
    if (updates.is_active !== undefined) addSet('is_active', updates.is_active);

    values.push(id);
    await db.query(`
      UPDATE subscriptions
      SET ${sets.join(', ')}, updated_at = now()
      WHERE id = $${values.length} AND deleted_at IS NULL
    `, values);

    return this.findById(id);
  }

  async softDelete(id) {
    const { rowCount } = await db.query(`
      UPDATE subscriptions
      SET deleted_at = now(), updated_at = now()
      WHERE id = $1 AND deleted_at IS NULL
    `, [id]);
    return rowCount > 0;
  }
}

module.exports = new SubscriptionsRepository();
