const db = require('../../infrastructure/database/db.client');

class EventsAdminRepository {
  async findByIdForAdmin(eventId) {
    const { rows } = await db.query(
      `
      SELECT
        e.id,
        e.title,
        e.organizer_id,
        e.status,
        e.approval_status,
        o.user_id AS organizer_user_id,
        COALESCE(u.email, '') AS organizer_email,
        COALESCE(u.full_name, o.organization_name, '') AS organizer_name
      FROM events e
      JOIN organizers o ON o.id = e.organizer_id
      LEFT JOIN users u ON u.id = o.user_id
      WHERE e.id = $1
        AND e.deleted_at IS NULL
      LIMIT 1
      `,
      [eventId],
    );
    return rows[0] ?? null;
  }

  async reviewEvent({ eventId, reviewedBy, status, reviewNote }) {
    const approvalStatus = status; // 'APPROVED' | 'REJECTED'

    // APPROVED → COMPLETED (đã duyệt, chờ Organizer tự publish)
    // REJECTED → HIDDEN
    const eventStatus = status === 'APPROVED' ? 'COMPLETED' : 'HIDDEN';

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const lockRes = await client.query(
        `SELECT id, status FROM events WHERE id = $1 AND deleted_at IS NULL FOR UPDATE LIMIT 1`,
        [eventId],
      );
      const locked = lockRes.rows[0];
      if (!locked) {
        await client.query('ROLLBACK');
        return null;
      }

      // Update the event with review status, reviewer, and review note
      const updateRes = await client.query(
        `
        UPDATE events
        SET approval_status = $2,
            status          = $3,
            approved_by     = $4,
            review_note     = $5,
            reviewed_at     = NOW(),
            updated_at      = NOW()
        WHERE id = $1
          AND deleted_at IS NULL
        RETURNING id, title, status, approval_status, organizer_id, start_time, end_time, review_note, reviewed_at
        `,
        [eventId, approvalStatus, eventStatus, reviewedBy, reviewNote || null],
      );

      await client.query('COMMIT');
      return updateRes.rows[0] ?? null;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async hideEvent({ eventId }) {
    const { rows } = await db.query(
      `
      UPDATE events
      SET status     = 'HIDDEN',
          updated_at = NOW()
      WHERE id = $1
        AND deleted_at IS NULL
      RETURNING id, title, status, approval_status, organizer_id
      `,
      [eventId],
    );
    return rows[0] ?? null;
  }

  async unhideEvent({ eventId }) {
    const { rows } = await db.query(
      `
      UPDATE events
      SET status     = 'COMPLETED',
          updated_at = NOW()
      WHERE id = $1
        AND deleted_at IS NULL
        AND status = 'HIDDEN'
        AND approval_status = 'APPROVED'
      RETURNING id, title, status, approval_status, organizer_id
      `,
      [eventId],
    );
    return rows[0] ?? null;
  }

  async getLatestAiReview(eventId) {
    const { rows } = await db.query(
      `
      SELECT
        id,
        id AS event_id,
        ai_recommendation AS recommendation,
        COALESCE(ai_warnings, '[]'::jsonb) AS warnings,
        ai_reviewed_at AS created_at
      FROM events
      WHERE id = $1
        AND ai_recommendation IS NOT NULL
      LIMIT 1
      `,
      [eventId],
    );
    return rows[0] ?? null;
  }

  async saveAiReview({ eventId, recommendation, warnings }) {
    const { rows } = await db.query(
      `
      UPDATE events
      SET ai_recommendation = $2,
          ai_warnings = $3,
          ai_reviewed_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
      RETURNING id, id AS event_id, ai_recommendation AS recommendation, ai_warnings AS warnings, ai_reviewed_at AS created_at
      `,
      [eventId, recommendation, JSON.stringify(warnings || [])],
    );
    return rows[0] ?? null;
  }

  async findEventFullDetailForAi(eventId) {
    const { rows } = await db.query(
      `
      SELECT
        e.id,
        e.title,
        e.short_description,
        e.description,
        e.thumbnail_url,
        e.banner_url,
        e.format,
        e.visibility,
        e.start_time,
        e.end_time,
        e.status,
        e.approval_status,
        COALESCE(session_summary.items, '[]'::json) AS sessions,
        COALESCE(ticket_summary.items, '[]'::json) AS ticket_types
      FROM events e
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'id', sess.id,
            'session_name', sess.session_name,
            'start_time', sess.start_time,
            'end_time', sess.end_time
          )
          ORDER BY sess.start_time ASC
        ) AS items
        FROM event_sessions sess
        WHERE sess.event_id = e.id
      ) session_summary ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'id', tt.id,
            'name', tt.name,
            'price', tt.price,
            'quantity', tt.quantity
          )
          ORDER BY tt.price ASC
        ) AS items
        FROM event_sessions sess
        JOIN ticket_types tt ON tt.event_session_id = sess.id
        WHERE sess.event_id = e.id
      ) ticket_summary ON true
      WHERE e.id = $1
        AND e.deleted_at IS NULL
      LIMIT 1
      `,
      [eventId],
    );
    return rows[0] ?? null;
  }
}

module.exports = new EventsAdminRepository();

