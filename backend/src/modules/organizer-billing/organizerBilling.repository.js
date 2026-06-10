const db = require('../../infrastructure/database/db.client');

class OrganizerBillingRepository {
  async findCurrentSubscription(userId) {
    const res = await db.query(
      `SELECT os.*, s.name, s.price, s.event_limit, s.staff_limit, s.analytics_enabled, s.priority_support, s.features 
       FROM organizer_subscriptions os
       JOIN subscriptions s ON os.subscription_id = s.id
       WHERE os.user_id = $1 AND os.status = 'active'
       ORDER BY os.start_date DESC LIMIT 1`,
      [userId]
    );
    return res.rows[0];
  }

  async cancelActiveSubscriptions(userId) {
    await db.query(
      `UPDATE organizer_subscriptions SET status = 'cancelled' WHERE user_id = $1 AND status = 'active'`,
      [userId]
    );
  }

  async activateNewSubscription(userId, subscriptionId, durationDays) {
    const res = await db.query(
      `INSERT INTO organizer_subscriptions (user_id, subscription_id, start_date, end_date, status)
       VALUES ($1, $2, NOW(), NOW() + interval '1 day' * $3, 'active')
       RETURNING *`,
      [userId, subscriptionId, durationDays]
    );
    return res.rows[0];
  }
}

module.exports = new OrganizerBillingRepository();
