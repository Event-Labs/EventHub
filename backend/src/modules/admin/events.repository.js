const db = require('../../infrastructure/database/db.client');

class EventsAdminRepository {
  async findByIdForAdmin(eventId) {
    const { rows } = await db.query(
      `
      SELECT
        e.id,
        e.title,
        e.short_description,
        e.description,
        e.thumbnail_url,
        e.banner_url,
        e.category_id,
        e.format,
        e.start_time,
        e.end_time,
        e.seating_rules,
        e.refund_policy,
        COALESCE(e.refund_policy->'permit_files', '[]'::jsonb) AS permits,
        e.organizer_id,
        e.status,
        e.display_state,
        e.sales_status,
        e.sales_blocks,
        e.pending_revision,
        e.revision_history,
        e.cancel_request,
        e.approval_status,
        e.review_note,
        o.user_id AS organizer_user_id,
        COALESCE(u.email, o.business_email, '') AS organizer_email,
        COALESCE(u.full_name, o.organization_name, '') AS organizer_name,
        COALESCE(o.business_phone, u.phone, '') AS organizer_phone,
        COALESCE(org_sub.priority_support, false) AS is_priority_support,
        org_sub.plan_name AS organizer_plan_name,
        fin_summary.paid_orders_count,
        fin_summary.total_paid_amount,
        fin_summary.issued_tickets_count,
        COALESCE(session_summary.items, '[]'::json) AS sessions,
        COALESCE(ticket_summary.items, '[]'::json) AS ticket_types,
        CASE
          WHEN e.ai_recommendation IS NOT NULL THEN
            json_build_object(
              'recommendation', e.ai_recommendation,
              'warnings', COALESCE(e.ai_warnings, '[]'::jsonb)
            )
          ELSE NULL
        END as "aiReview"
      FROM events e
      JOIN organizers o ON o.id = e.organizer_id
      LEFT JOIN users u ON u.id = o.user_id
      LEFT JOIN LATERAL (
        SELECT
          s.name AS plan_name,
          COALESCE(s.priority_support, false) AS priority_support
        FROM organizer_subscriptions os
        JOIN subscriptions s ON os.subscription_id = s.id
        WHERE os.organizer_id = e.organizer_id
          AND os.status = 'ACTIVE'
          AND os.start_date <= now()
          AND os.end_date >= now()
          AND s.deleted_at IS NULL
        ORDER BY s.priority_support DESC, os.start_date DESC
        LIMIT 1
      ) org_sub ON true
      LEFT JOIN LATERAL (
        SELECT
          (
            SELECT COALESCE(COUNT(DISTINCT o_fin.id) FILTER (WHERE o_fin.status = 'PAID'), 0)::int
            FROM orders o_fin
            WHERE o_fin.id IN (
              SELECT oi_fin.order_id
              FROM order_items oi_fin
              JOIN ticket_types tt_fin ON tt_fin.id = oi_fin.ticket_type_id
              JOIN event_sessions es_fin ON es_fin.id = tt_fin.event_session_id
              WHERE es_fin.event_id = e.id
            )
          ) AS paid_orders_count,
          (
            SELECT COALESCE(SUM(o_fin.total_amount) FILTER (WHERE o_fin.status = 'PAID'), 0)::numeric
            FROM orders o_fin
            WHERE o_fin.id IN (
              SELECT oi_fin.order_id
              FROM order_items oi_fin
              JOIN ticket_types tt_fin ON tt_fin.id = oi_fin.ticket_type_id
              JOIN event_sessions es_fin ON es_fin.id = tt_fin.event_session_id
              WHERE es_fin.event_id = e.id
            )
          ) AS total_paid_amount,
          (
            SELECT COALESCE(COUNT(DISTINCT t_fin.id) FILTER (WHERE t_fin.status IN ('VALID', 'USED', 'REFUND_REQUESTED')), 0)::int
            FROM tickets t_fin
            JOIN ticket_types tt_fin ON tt_fin.id = t_fin.ticket_type_id
            JOIN event_sessions es_fin ON es_fin.id = tt_fin.event_session_id
            WHERE es_fin.event_id = e.id
          ) AS issued_tickets_count
      ) fin_summary ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'id', sess.id,
            'session_name', sess.session_name,
            'start_time', sess.start_time,
            'end_time', sess.end_time,
            'status', sess.status
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
            'event_session_id', tt.event_session_id,
            'session_name', tt.session_name,
            'name', tt.name,
            'description', tt.description,
            'price', tt.price,
            'quantity', tt.quantity,
            'sold_quantity', COALESCE(sold.sold_quantity, 0),
            'is_seated', tt.is_seated
          )
          ORDER BY tt.price ASC, tt.name ASC
        ) AS items
        FROM (
          SELECT DISTINCT ON (tt_inner.event_session_id, tt_inner.name, tt_inner.price, tt_inner.is_seated)
            tt_inner.id,
            tt_inner.event_session_id,
            sess_inner.session_name,
            tt_inner.name,
            tt_inner.description,
            tt_inner.price,
            tt_inner.quantity,
            tt_inner.is_seated
          FROM event_sessions sess_inner
          JOIN ticket_types tt_inner ON tt_inner.event_session_id = sess_inner.id
          WHERE sess_inner.event_id = e.id
          ORDER BY tt_inner.event_session_id, tt_inner.name, tt_inner.price, tt_inner.is_seated, tt_inner.created_at DESC
        ) tt
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(oi.quantity), 0)::int AS sold_quantity
          FROM order_items oi
          JOIN orders ord ON ord.id = oi.order_id
          WHERE oi.ticket_type_id = tt.id
            AND ord.status IN ('PAID', 'CONFIRMED')
        ) sold ON true
      ) ticket_summary ON true
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
        e.refund_policy,
        COALESCE(e.refund_policy->'permit_files', '[]'::jsonb) AS permits,
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
            'event_session_id', tt.event_session_id,
            'session_name', tt.session_name,
            'name', tt.name,
            'description', tt.description,
            'price', tt.price,
            'quantity', tt.quantity,
            'is_seated', tt.is_seated
          )
          ORDER BY tt.price ASC, tt.name ASC
        ) AS items
        FROM (
          SELECT DISTINCT ON (tt_inner.event_session_id, tt_inner.name, tt_inner.price, tt_inner.is_seated)
            tt_inner.id,
            tt_inner.event_session_id,
            sess_inner.session_name,
            tt_inner.name,
            tt_inner.description,
            tt_inner.price,
            tt_inner.quantity,
            tt_inner.is_seated
          FROM event_sessions sess_inner
          JOIN ticket_types tt_inner ON tt_inner.event_session_id = sess_inner.id
          WHERE sess_inner.event_id = e.id
          ORDER BY tt_inner.event_session_id, tt_inner.name, tt_inner.price, tt_inner.is_seated, tt_inner.created_at DESC
        ) tt
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
