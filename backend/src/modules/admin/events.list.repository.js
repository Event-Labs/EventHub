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
        listClause:  `e.deleted_at IS NULL AND e.status = 'HIDDEN' AND e.approval_status = 'REJECTED'`,
        countClause: `e.deleted_at IS NULL AND e.status = 'HIDDEN' AND e.approval_status = 'REJECTED'`,
        listArgs:  [],   // appended after [limit, offset]
        countArgs: [],
      };
    case 'SUSPENDED':
    case 'SUSPENDED_BY_ADMIN':
      return {
        listClause:  `e.deleted_at IS NULL AND e.display_state = 'SUSPENDED_BY_ADMIN'`,
        countClause: `e.deleted_at IS NULL AND e.display_state = 'SUSPENDED_BY_ADMIN'`,
        listArgs:  [],
        countArgs: [],
      };
    case 'HIDDEN':
      return {
        listClause:  `e.deleted_at IS NULL AND (e.status = 'HIDDEN' OR e.display_state = 'SUSPENDED_BY_ADMIN')`,
        countClause: `e.deleted_at IS NULL AND (e.status = 'HIDDEN' OR e.display_state = 'SUSPENDED_BY_ADMIN')`,
        listArgs:  [],
        countArgs: [],
      };
    case 'PENDING_REVIEW':
      return {
        listClause:  `e.deleted_at IS NULL AND (e.status = 'PENDING_REVIEW' OR e.pending_revision IS NOT NULL OR (e.cancel_request IS NOT NULL AND e.cancel_request->>'status' = 'PENDING')) AND COALESCE(e.display_state, 'VISIBLE') != 'SUSPENDED_BY_ADMIN'`,
        countClause: `e.deleted_at IS NULL AND (e.status = 'PENDING_REVIEW' OR e.pending_revision IS NOT NULL OR (e.cancel_request IS NOT NULL AND e.cancel_request->>'status' = 'PENDING')) AND COALESCE(e.display_state, 'VISIBLE') != 'SUSPENDED_BY_ADMIN'`,
        listArgs:  [],
        countArgs: [],
      };
    case 'CANCEL_REQUESTS':
    case 'CANCELLATION_REQUESTS':
      return {
        listClause:  `e.deleted_at IS NULL AND (e.cancel_request IS NOT NULL AND e.cancel_request->>'status' = 'PENDING')`,
        countClause: `e.deleted_at IS NULL AND (e.cancel_request IS NOT NULL AND e.cancel_request->>'status' = 'PENDING')`,
        listArgs:  [],
        countArgs: [],
      };
    case 'PUBLISHED':
      return {
        listClause:  `e.deleted_at IS NULL AND (e.status = 'PUBLISHED' OR (e.status = 'COMPLETED' AND e.approval_status = 'APPROVED')) AND COALESCE(e.display_state, 'VISIBLE') != 'SUSPENDED_BY_ADMIN'`,
        countClause: `e.deleted_at IS NULL AND (e.status = 'PUBLISHED' OR (e.status = 'COMPLETED' AND e.approval_status = 'APPROVED')) AND COALESCE(e.display_state, 'VISIBLE') != 'SUSPENDED_BY_ADMIN'`,
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
        e.display_state,
        e.sales_status,
        e.sales_blocks,
        e.approval_status,
        e.pending_revision,
        e.cancel_request,
        c.name AS category_name,
        COALESCE(o.organization_name, ou.full_name) AS organizer_name,
        ou.email AS organizer_email,
        COALESCE(session_summary.items, '[]'::json) AS sessions,
        COALESCE(ticket_summary.items, '[]'::json) AS ticket_types,
        e.review_note,
        e.reviewed_at
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
            AND ord.status = 'PAID'
        ) sold ON true
      ) ticket_summary ON true
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
