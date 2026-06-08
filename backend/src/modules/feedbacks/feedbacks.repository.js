const db = require('../../infrastructure/database/db.client');

const FEEDBACK_SELECT = `
  f.id,
  f.event_id,
  f.user_id,
  f.rating,
  f.content,
  f.created_at,
  u.full_name AS user_full_name,
  u.email AS user_email
`;

class FeedbacksRepository {
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

  async findEventById(eventId) {
    const { rows } = await db.query(
      `
      SELECT id, title, slug, organizer_id, end_time, status, deleted_at
      FROM events
      WHERE id = $1
      LIMIT 1
      `,
      [eventId],
    );
    return rows[0];
  }

  async findByUserAndEvent(userId, eventId) {
    const { rows } = await db.query(
      `
      SELECT ${FEEDBACK_SELECT}
      FROM event_feedbacks f
      JOIN users u ON u.id = f.user_id
      WHERE f.user_id = $1 AND f.event_id = $2
      LIMIT 1
      `,
      [userId, eventId],
    );
    return rows[0];
  }

  async userHasTicketForEvent(userId, eventId) {
    const { rows } = await db.query(
      `
      SELECT 1
      FROM tickets t
      JOIN order_items oi ON oi.id = t.order_item_id
      JOIN orders o ON o.id = oi.order_id
      WHERE o.user_id = $1
        AND t.event_id = $2
        AND t.status IN ('VALID', 'USED')
      LIMIT 1
      `,
      [userId, eventId],
    );
    return Boolean(rows[0]);
  }

  async findEligibleEventsForUser(userId) {
    const { rows } = await db.query(
      `
      SELECT DISTINCT
        e.id,
        e.title,
        e.slug,
        e.end_time,
        e.thumbnail_url
      FROM tickets t
      JOIN order_items oi ON oi.id = t.order_item_id
      JOIN orders o ON o.id = oi.order_id
      JOIN events e ON e.id = t.event_id
      WHERE o.user_id = $1
        AND e.deleted_at IS NULL
        AND e.end_time <= now()
        AND t.status IN ('VALID', 'USED')
        AND NOT EXISTS (
          SELECT 1
          FROM event_feedbacks ef
          WHERE ef.event_id = e.id AND ef.user_id = $1
        )
      ORDER BY e.end_time DESC
      `,
      [userId],
    );
    return rows;
  }

  async create({ userId, eventId, rating, content }) {
    const { rows } = await db.query(
      `
      INSERT INTO event_feedbacks (event_id, user_id, rating, content)
      VALUES ($1, $2, $3, $4)
      RETURNING id
      `,
      [eventId, userId, rating, content],
    );
    return this.findById(rows[0].id);
  }

  async findById(id) {
    const { rows } = await db.query(
      `
      SELECT ${FEEDBACK_SELECT}
      FROM event_feedbacks f
      JOIN users u ON u.id = f.user_id
      WHERE f.id = $1
      LIMIT 1
      `,
      [id],
    );
    return rows[0];
  }

  async findOrganizerEvents(organizerId) {
    const { rows } = await db.query(
      `
      SELECT
        e.id,
        e.title,
        e.slug,
        e.end_time,
        e.status,
        COUNT(f.id)::int AS feedback_count,
        ROUND(AVG(f.rating)::numeric, 2) AS average_rating
      FROM events e
      LEFT JOIN event_feedbacks f ON f.event_id = e.id
      WHERE e.organizer_id = $1 AND e.deleted_at IS NULL
      GROUP BY e.id
      ORDER BY e.end_time DESC
      `,
      [organizerId],
    );
    return rows;
  }

  async findByEventForOrganizer(eventId) {
    const { rows } = await db.query(
      `
      SELECT ${FEEDBACK_SELECT}
      FROM event_feedbacks f
      JOIN users u ON u.id = f.user_id
      WHERE f.event_id = $1
      ORDER BY f.created_at DESC
      `,
      [eventId],
    );
    return rows;
  }

  async getReportSummary(eventId) {
    const { rows } = await db.query(
      `
      SELECT
        COUNT(*)::int AS total_feedbacks,
        ROUND(AVG(rating)::numeric, 2) AS average_rating,
        COUNT(*) FILTER (WHERE rating = 5)::int AS rating_5,
        COUNT(*) FILTER (WHERE rating = 4)::int AS rating_4,
        COUNT(*) FILTER (WHERE rating = 3)::int AS rating_3,
        COUNT(*) FILTER (WHERE rating = 2)::int AS rating_2,
        COUNT(*) FILTER (WHERE rating = 1)::int AS rating_1
      FROM event_feedbacks
      WHERE event_id = $1
      `,
      [eventId],
    );
    return rows[0];
  }
}

module.exports = new FeedbacksRepository();
