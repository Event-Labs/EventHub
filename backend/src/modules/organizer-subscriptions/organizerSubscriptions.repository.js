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
      `SELECT os.*, s.name, s.price, s.duration_days, s.event_limit, s.staff_limit, s.analytics_enabled, s.priority_support, s.features 
       FROM organizer_subscriptions os
       JOIN subscriptions s ON os.subscription_id = s.id
       WHERE os.organizer_id = $1 AND os.status = 'ACTIVE'
       ORDER BY os.start_date DESC LIMIT 1`,
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
}

module.exports = new OrganizerSubscriptionsRepository();

