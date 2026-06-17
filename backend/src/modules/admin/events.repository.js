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

      // Upsert review record
      await client.query(
        `
        INSERT INTO event_reviews (event_id, reviewed_by, status, review_note)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (event_id, reviewed_by)
        DO UPDATE SET
          status       = EXCLUDED.status,
          review_note  = EXCLUDED.review_note,
          created_at   = event_reviews.created_at
        `,
        [eventId, reviewedBy, approvalStatus, reviewNote || null],
      );

      // Update the event
      const updateRes = await client.query(
        `
        UPDATE events
        SET approval_status = $2,
            status          = $3,
            approved_by     = $4,
            updated_at      = NOW()
        WHERE id = $1
          AND deleted_at IS NULL
        RETURNING id, title, status, approval_status, organizer_id, start_time, end_time
        `,
        [eventId, approvalStatus, eventStatus, reviewedBy],
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
}

module.exports = new EventsAdminRepository();
