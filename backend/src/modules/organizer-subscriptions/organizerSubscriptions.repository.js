const db = require('../../infrastructure/database/db.client');

class OrganizerSubscriptionsRepository {
  // Lookup the organizer's record ID from their user ID
  async findOrganizerIdByUserId(userId) {
    const res = await db.query(
      `SELECT id FROM organizers WHERE user_id = $1 AND status = 'ACTIVE' LIMIT 1`,
      [userId]
    );
    return res.rows[0]?.id || null;
  }

  async findCurrentSubscription(userId) {
    const organizerId = await this.findOrganizerIdByUserId(userId);
    if (!organizerId) return null;
    const res = await db.query(
      `SELECT
         os.id,
         os.organizer_id,
         os.subscription_id,
         os.status,
         os.start_date,
         os.end_date,
         s.name,
         s.price,
         s.duration_days,
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
       JOIN subscriptions s ON os.subscription_id = s.id
       WHERE os.organizer_id = $1
         AND os.status = 'ACTIVE'
         AND os.start_date <= now()
         AND os.end_date >= now()
         AND s.deleted_at IS NULL
       ORDER BY os.start_date DESC
       LIMIT 1`,
      [organizerId],
    );
    return res.rows[0];
  }

  async cancelActiveSubscriptions(userId) {
    const organizerId = await this.findOrganizerIdByUserId(userId);
    if (!organizerId) return;
    await db.query(
      `UPDATE organizer_subscriptions SET status = 'CANCELLED' WHERE organizer_id = $1 AND status = 'ACTIVE'`,
      [organizerId],
    );
  }

  async activateNewSubscription(userId, subscriptionId, durationDays) {
    const organizerId = await this.findOrganizerIdByUserId(userId);
    if (!organizerId) throw new Error('Organizer profile not found for this user.');
    const res = await db.query(
      `INSERT INTO organizer_subscriptions (organizer_id, subscription_id, start_date, end_date, status)
       VALUES ($1, $2, NOW(), NOW() + interval '1 day' * $3::int, 'ACTIVE')
       RETURNING *`,
      [organizerId, subscriptionId, durationDays],
    );
    return res.rows[0];
  }

  async replaceActiveSubscription(userId, subscriptionId, durationDays) {
    const organizerId = await this.findOrganizerIdByUserId(userId);
    if (!organizerId) throw new Error('Organizer profile not found for this user.');

    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      await client.query(
        `
        UPDATE organizer_subscriptions
        SET status = 'CANCELLED', updated_at = now()
        WHERE organizer_id = $1
          AND status = 'ACTIVE'
        `,
        [organizerId],
      );
      const { rows } = await client.query(
        `
        INSERT INTO organizer_subscriptions (organizer_id, subscription_id, start_date, end_date, status)
        VALUES ($1, $2, NOW(), NOW() + interval '1 day' * $3::int, 'ACTIVE')
        RETURNING *
        `,
        [organizerId, subscriptionId, durationDays],
      );
      await client.query('COMMIT');
      return rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = new OrganizerSubscriptionsRepository();

