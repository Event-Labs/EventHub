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
      SELECT
        e.id,
        e.title,
        e.slug,
        e.organizer_id,
        COALESCE(time_summary.start_time, e.start_time) AS start_time,
        COALESCE(time_summary.end_time, e.end_time) AS end_time,
        e.status,
        e.approval_status,
        e.deleted_at
      FROM events e
      LEFT JOIN LATERAL (
        SELECT MIN(es.start_time) AS start_time, MAX(es.end_time) AS end_time
        FROM event_sessions es
        WHERE es.event_id = e.id
      ) time_summary ON true
      WHERE e.id = $1
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

  async userHasCheckedInTicket(userId, eventId) {
    const { rows } = await db.query(
      `
      SELECT 1
      FROM tickets t
      JOIN order_items oi ON oi.id = t.order_item_id
      JOIN orders o ON o.id = oi.order_id
      WHERE o.user_id = $1
        AND t.event_id = $2
        AND (t.status = 'USED' OR t.checked_in_at IS NOT NULL)
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
        COALESCE(time_summary.start_time, e.start_time) AS start_time,
        COALESCE(time_summary.end_time, e.end_time) AS end_time,
        e.thumbnail_url
      FROM tickets t
      JOIN order_items oi ON oi.id = t.order_item_id
      JOIN orders o ON o.id = oi.order_id
      JOIN events e ON e.id = t.event_id
      LEFT JOIN LATERAL (
        SELECT MIN(es_time.start_time) AS start_time, MAX(es_time.end_time) AS end_time
        FROM event_sessions es_time
        WHERE es_time.event_id = e.id
      ) time_summary ON true
      WHERE o.user_id = $1
        AND e.deleted_at IS NULL
        AND e.status IN ('PUBLISHED', 'COMPLETED')
        AND e.approval_status = 'APPROVED'
        AND (
          COALESCE(time_summary.start_time, e.start_time, e.end_time) <= now()
          OR t.checked_in_at IS NOT NULL
          OR t.status = 'USED'
        )
        AND t.status IN ('VALID', 'USED')
        AND NOT EXISTS (
          SELECT 1
          FROM event_feedbacks ef
          WHERE ef.event_id = e.id AND ef.user_id = $1
        )
      ORDER BY COALESCE(time_summary.start_time, e.start_time) DESC
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
