const db = require('../../infrastructure/database/db.client');

class NotificationsRepository {
  async findOrganizerByUserId(userId) {
    const { rows } = await db.query(
      `
      SELECT id, user_id, organization_name, status
      FROM organizers
      WHERE user_id = $1
        AND status = 'ACTIVE'
      LIMIT 1
      `,
      [userId],
    );
    return rows[0];
  }

  async createNotification({ userId, eventId = null, title, content, type = 'SYSTEM' }) {
    const { rows } = await db.query(
      `
      WITH inserted AS (
        INSERT INTO notifications (user_id, event_id, title, content, type)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, user_id, event_id, title, content, type, is_read, created_at
      )
      SELECT
        n.id,
        n.user_id,
        n.event_id,
        n.title,
        n.content,
        n.type,
        n.is_read,
        n.created_at,
        e.title AS event_title,
        e.slug AS event_slug
      FROM inserted n
      LEFT JOIN events e ON e.id = n.event_id
      `,
      [userId, eventId, title, content, type],
    );
    return rows[0];
  }

  async listByUser(userId, { limit, offset, unreadOnly, category = 'all' }) {
    const unreadClause = unreadOnly ? 'AND is_read = false' : '';
    const listCategoryClause = category === 'invitation'
      ? `AND n.title IN ('STAFF_INVITATION', 'Lời mời làm staff')`
      : '';
    const countCategoryClause = category === 'invitation'
      ? `AND title IN ('STAFF_INVITATION', 'Lời mời làm staff')`
      : '';
    const { rows } = await db.query(
      `
      SELECT
        n.id,
        n.user_id,
        n.event_id,
        n.title,
        n.content,
        n.type,
        n.is_read,
        n.created_at,
        e.title AS event_title,
        e.slug AS event_slug
      FROM notifications n
      LEFT JOIN events e ON e.id = n.event_id
      WHERE n.user_id = $1
      ${unreadClause}
      ${listCategoryClause}
      ORDER BY n.created_at DESC
      LIMIT $2 OFFSET $3
      `,
      [userId, limit, offset],
    );

    const countResult = await db.query(
      `
      SELECT COUNT(*)::int AS total
      FROM notifications
      WHERE user_id = $1
      ${unreadClause}
      ${countCategoryClause}
      `,
      [userId],
    );

    return { rows, total: countResult.rows[0]?.total || 0 };
  }

  async unreadCount(userId) {
    const { rows } = await db.query(
      'SELECT COUNT(*)::int AS total FROM notifications WHERE user_id = $1 AND is_read = false',
      [userId],
    );
    return rows[0]?.total || 0;
  }

  async markRead(userId, notificationId) {
    const { rows } = await db.query(
      `
      UPDATE notifications
      SET is_read = true
      WHERE id = $1 AND user_id = $2
      RETURNING id, user_id, event_id, title, content, type, is_read, created_at
      `,
      [notificationId, userId],
    );
    return rows[0];
  }

  async markAllRead(userId) {
    await db.query('UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false', [userId]);
  }

  async findOrganizerEvents(organizerId) {
    const { rows } = await db.query(
      `
      SELECT id, title, slug, start_time, end_time, status
      FROM events
      WHERE organizer_id = $1
        AND deleted_at IS NULL
      ORDER BY start_time DESC
      LIMIT 100
      `,
      [organizerId],
    );
    return rows;
  }

  async findOrganizerEvent(eventId, organizerId) {
    const { rows } = await db.query(
      `
      SELECT id, title, slug, organizer_id, start_time, end_time
      FROM events
      WHERE id = $1 AND organizer_id = $2 AND deleted_at IS NULL
      LIMIT 1
      `,
      [eventId, organizerId],
    );
    return rows[0];
  }

  async createAnnouncement({ eventId, organizerId, title, content }) {
    const { rows } = await db.query(
      `
      INSERT INTO announcements (event_id, organizer_id, title, content, sent_at)
      VALUES ($1, $2, $3, $4, now())
      RETURNING id, event_id, organizer_id, title, content, sent_at, created_at
      `,
      [eventId, organizerId, title, content],
    );
    return rows[0];
  }

  async listAnnouncements(organizerId, limit = 20) {
    const { rows } = await db.query(
      `
      SELECT
        a.id,
        a.event_id,
        a.title,
        a.content,
        a.sent_at,
        a.created_at,
        e.title AS event_title
      FROM announcements a
      JOIN events e ON e.id = a.event_id
      WHERE a.organizer_id = $1
      ORDER BY a.created_at DESC
      LIMIT $2
      `,
      [organizerId, limit],
    );
    return rows;
  }

  async findEventAttendeeContacts(eventId) {
    const { rows } = await db.query(
      `
      SELECT DISTINCT
        o.user_id,
        COALESCE(u.email, o.buyer_email) AS email,
        COALESCE(u.full_name, o.buyer_name) AS full_name
      FROM tickets t
      JOIN order_items oi ON oi.id = t.order_item_id
      JOIN orders o ON o.id = oi.order_id
      LEFT JOIN users u ON u.id = o.user_id
      WHERE t.event_id = $1
        AND o.status = 'PAID'
        AND COALESCE(u.email, o.buyer_email) IS NOT NULL
      `,
      [eventId],
    );
    return rows;
  }

  async findUpcomingReminderRecipients({ from, to }) {
    const { rows } = await db.query(
      `
      SELECT DISTINCT
        o.user_id,
        u.email,
        u.full_name,
        e.id AS event_id,
        e.title AS event_title,
        e.slug AS event_slug,
        es.id AS session_id,
        es.start_time,
        v.name AS venue_name,
        v.address_line,
        v.district,
        v.city
      FROM tickets t
      JOIN order_items oi ON oi.id = t.order_item_id
      JOIN orders o ON o.id = oi.order_id
      JOIN users u ON u.id = o.user_id
      JOIN events e ON e.id = t.event_id
      JOIN event_sessions es ON es.id = t.event_session_id
      LEFT JOIN venues v ON v.id = es.venue_id
      WHERE o.status = 'PAID'
        AND t.status = 'VALID'
        AND es.start_time >= $1
        AND es.start_time < $2
        AND NOT EXISTS (
          SELECT 1
          FROM notifications n
          WHERE n.user_id = o.user_id
            AND n.event_id = e.id
            AND n.title = 'Nhắc lịch sự kiện'
            AND n.created_at >= now() - interval '2 days'
        )
      ORDER BY es.start_time ASC
      LIMIT 500
      `,
      [from, to],
    );
    return rows;
  }
}

module.exports = new NotificationsRepository();
