const db = require('../../infrastructure/database/db.client');

// Real event_status_enum values in the DB (no REJECTED in status enum)
const REAL_STATUS_FILTERS = new Set([
  'DRAFT',
  'PENDING_REVIEW',
  'PUBLISHED',
  'CANCELLED',
  'COMPLETED',
]);

function buildWhere(upper) {
  switch (upper) {
    case 'REJECTED':
      return {
        // No bind params needed — literals embedded directly (enum values, safe)
        listClause:  `e.deleted_at IS NULL AND e.status = 'HIDDEN' AND e.approval_status = 'REJECTED'`,
        countClause: `e.deleted_at IS NULL AND e.status = 'HIDDEN' AND e.approval_status = 'REJECTED'`,
        listArgs:  [],   // appended after [limit, offset]
        countArgs: [],
      };
    case 'HIDDEN':
      return {
        listClause:  `e.deleted_at IS NULL AND e.status = 'HIDDEN' AND e.approval_status = 'APPROVED'`,
        countClause: `e.deleted_at IS NULL AND e.status = 'HIDDEN' AND e.approval_status = 'APPROVED'`,
        listArgs:  [],
        countArgs: [],
      };
    default: {
      const safeStatus = REAL_STATUS_FILTERS.has(upper) ? upper : 'PENDING_REVIEW';
      return {
        // list query: $1=limit, $2=offset, $3=status
        listClause:  `e.deleted_at IS NULL AND e.status = $3`,
        // count query: $1=status
        countClause: `e.deleted_at IS NULL AND e.status = $1`,
        listArgs:  [safeStatus],   // will be spread as the 3rd arg
        countArgs: [safeStatus],
      };
    }
  }
}

class EventsListAdminRepository {
  async findEvents({ page, limit, status }) {
    const offset = (page - 1) * limit;
    const upper = status ? status.toUpperCase() : 'PENDING_REVIEW';
    const { listClause, countClause, listArgs, countArgs } = buildWhere(upper);

    const listQuery = `
      SELECT
        e.id,
        e.title,
        e.slug,
        e.short_description,
        e.description,
        e.thumbnail_url,
        e.banner_url,
        e.format,
        e.visibility,
        e.tags,
        e.start_time,
        e.end_time,
        e.created_at,
        e.updated_at,
        e.organizer_id,
        e.status,
        e.approval_status,
        c.name AS category_name,
        COALESCE(o.organization_name, ou.full_name) AS organizer_name,
        ou.email AS organizer_email,
        COALESCE(session_summary.items, '[]'::json) AS sessions,
        COALESCE(ticket_summary.items, '[]'::json) AS ticket_types,
        review_summary.review_note,
        review_summary.reviewed_at
      FROM events e
      JOIN organizers o ON o.id = e.organizer_id
      LEFT JOIN users ou ON ou.id = o.user_id
      LEFT JOIN event_categories c ON c.id = e.category_id
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'id', sess.id,
            'session_name', sess.session_name,
            'start_time', sess.start_time,
            'end_time', sess.end_time,
            'venue_name', v.name,
            'address_line', v.address_line,
            'city', v.city,
            'seat_map_id', sess.seat_map_id
          )
          ORDER BY sess.start_time ASC
        ) AS items
        FROM event_sessions sess
        LEFT JOIN venues v ON v.id = sess.venue_id
        WHERE sess.event_id = e.id
      ) session_summary ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'id', tt.id,
            'name', tt.name,
            'price', tt.price,
            'quantity', tt.quantity,
            'sold_quantity', COALESCE(sold.sold_quantity, 0),
            'is_seated', tt.is_seated
          )
          ORDER BY tt.price ASC, tt.name ASC
        ) AS items
        FROM event_sessions sess
        JOIN ticket_types tt ON tt.event_session_id = sess.id
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(oi.quantity), 0)::int AS sold_quantity
          FROM order_items oi
          JOIN orders ord ON ord.id = oi.order_id
          WHERE oi.ticket_type_id = tt.id
            AND ord.status = 'PAID'
        ) sold ON true
        WHERE sess.event_id = e.id
      ) ticket_summary ON true
      LEFT JOIN LATERAL (
        SELECT er.review_note, er.created_at AS reviewed_at
        FROM event_reviews er
        WHERE er.event_id = e.id
        ORDER BY er.created_at DESC
        LIMIT 1
      ) review_summary ON true
      WHERE ${listClause}
      ORDER BY e.created_at DESC
      LIMIT $1 OFFSET $2
    `;

    const countQuery = `
      SELECT COUNT(*)::int AS total
      FROM events e
      WHERE ${countClause}
    `;

    const [listRes, countRes] = await Promise.all([
      db.query(listQuery, [limit, offset, ...listArgs]),
      db.query(countQuery, countArgs),
    ]);

    return {
      items: listRes.rows,
      total: countRes.rows[0]?.total ?? 0,
    };
  }
}

module.exports = new EventsListAdminRepository();
