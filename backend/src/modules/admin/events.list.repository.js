const db = require('../../infrastructure/database/db.client');

// Real event_status_enum values in the DB (no REJECTED in status enum)
const REAL_STATUS_FILTERS = new Set([
  'DRAFT',
  'PENDING_REVIEW',
  'PUBLISHED',
  'CANCELLED',
  'COMPLETED',
]);

/**
 * Build two independent WHERE fragments — one for the list query (params start
 * at $3 because $1=limit, $2=offset) and one for the count query ($1=status).
 *
 * 'REJECTED' and 'HIDDEN' are virtual filters that both resolve to status=HIDDEN
 * but differ on approval_status:
 *   REJECTED → status=HIDDEN AND approval_status=REJECTED  (failed admin review)
 *   HIDDEN   → status=HIDDEN AND approval_status=APPROVED  (published, then hidden for violations)
 */
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
        e.thumbnail_url,
        e.banner_url,
        e.start_time,
        e.end_time,
        e.created_at,
        e.updated_at,
        e.organizer_id,
        e.status,
        e.approval_status,
        COALESCE(o.organization_name, ou.full_name) AS organizer_name,
        ou.email AS organizer_email
      FROM events e
      JOIN organizers o ON o.id = e.organizer_id
      LEFT JOIN users ou ON ou.id = o.user_id
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
