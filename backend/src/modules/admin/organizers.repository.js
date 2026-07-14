const db = require('../../infrastructure/database/db.client');

const SORT_COLUMNS = {
  created_at: 'o.created_at',
  organization_name: 'LOWER(o.organization_name)',
  status: 'o.status',
  gross_revenue: 'COALESCE(order_stats.gross_revenue, 0)',
  total_events: 'COALESCE(event_stats.total_events, 0)',
};

function buildListWhere({ search, status }) {
  const params = [];
  const clauses = [];

  if (search) {
    params.push(`%${search}%`);
    clauses.push(`(
      o.organization_name ILIKE $${params.length}
      OR o.business_email ILIKE $${params.length}
      OR u.email ILIKE $${params.length}
      OR u.full_name ILIKE $${params.length}
    )`);
  }

  if (status) {
    params.push(status);
    clauses.push(`o.status = $${params.length}`);
  }

  return {
    params,
    whereSql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
  };
}

class AdminOrganizersRepository {
  async getStats() {
    const { rows } = await db.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE o.status = 'ACTIVE')::int AS active,
        COUNT(*) FILTER (WHERE o.status = 'SUSPENDED')::int AS suspended,
        COUNT(*) FILTER (
          WHERE EXISTS (
            SELECT 1
            FROM events e
            WHERE e.organizer_id = o.id
              AND e.deleted_at IS NULL
              AND e.status = 'PUBLISHED'
          )
        )::int AS has_published_events
      FROM organizers o
    `);
    return rows[0];
  }

  async findAll(filters) {
    const { search, status, limit = 10, offset = 0, sortBy = 'created_at', sortOrder = 'DESC' } = filters;
    const { params, whereSql } = buildListWhere({ search, status });
    const orderColumn = SORT_COLUMNS[sortBy] || SORT_COLUMNS.created_at;
    const direction = String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const listParams = [...params, limit, offset];
    const { rows } = await db.query(
      `
      WITH event_stats AS (
        SELECT
          organizer_id,
          COUNT(*) FILTER (WHERE deleted_at IS NULL)::int AS total_events,
          COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'PUBLISHED')::int AS published_events,
          COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'COMPLETED')::int AS approved_unpublished_events
        FROM events
        GROUP BY organizer_id
      ),
      order_stats AS (
        SELECT
          organizer_id,
          COUNT(*) FILTER (WHERE status = 'PAID')::int AS paid_orders,
          COALESCE(SUM(total_amount) FILTER (WHERE status = 'PAID'), 0)::numeric AS gross_revenue,
          COALESCE(SUM(discount_amount) FILTER (WHERE status = 'PAID'), 0)::numeric AS total_discount
        FROM orders
        GROUP BY organizer_id
      ),
      current_plan AS (
        SELECT DISTINCT ON (os.organizer_id)
          os.organizer_id,
          os.status AS subscription_status,
          os.start_date,
          os.end_date,
          s.name AS plan_name,
          s.price AS plan_price
        FROM organizer_subscriptions os
        JOIN subscriptions s ON s.id = os.subscription_id AND s.deleted_at IS NULL
        WHERE os.status = 'ACTIVE'
          AND os.start_date <= now()
          AND os.end_date >= now()
        ORDER BY os.organizer_id, os.start_date DESC
      )
      SELECT
        o.id,
        o.user_id,
        o.organization_name,
        o.description,
        o.business_email,
        o.business_phone,
        o.status,
        o.created_at,
        o.updated_at,
        u.full_name AS owner_name,
        u.email AS owner_email,
        u.phone AS owner_phone,
        u.address AS owner_address,
        u.city AS owner_city,
        u.dob AS owner_dob,
        u.bio AS owner_bio,
        u.avatar_url AS owner_avatar_url,
        u.status AS owner_status,
        u.email_verified AS owner_email_verified,
        u.created_at AS owner_created_at,
        u.updated_at AS owner_updated_at,
        COALESCE(event_stats.total_events, 0)::int AS total_events,
        COALESCE(event_stats.published_events, 0)::int AS published_events,
        COALESCE(event_stats.approved_unpublished_events, 0)::int AS approved_unpublished_events,
        COALESCE(order_stats.paid_orders, 0)::int AS paid_orders,
        COALESCE(order_stats.gross_revenue, 0)::numeric AS gross_revenue,
        COALESCE(order_stats.total_discount, 0)::numeric AS total_discount,
        current_plan.plan_name,
        current_plan.plan_price,
        current_plan.end_date AS plan_end_date
      FROM organizers o
      JOIN users u ON u.id = o.user_id AND u.deleted_at IS NULL
      LEFT JOIN event_stats ON event_stats.organizer_id = o.id
      LEFT JOIN order_stats ON order_stats.organizer_id = o.id
      LEFT JOIN current_plan ON current_plan.organizer_id = o.id
      ${whereSql}
      ORDER BY ${orderColumn} ${direction}, o.created_at DESC
      LIMIT $${listParams.length - 1}
      OFFSET $${listParams.length}
      `,
      listParams,
    );

    const { rows: countRows } = await db.query(
      `
      SELECT COUNT(*)::int AS total
      FROM organizers o
      JOIN users u ON u.id = o.user_id AND u.deleted_at IS NULL
      ${whereSql}
      `,
      params,
    );

    return {
      organizers: rows,
      total: countRows[0]?.total || 0,
      stats: await this.getStats(),
    };
  }

  async findById(id) {
    const { rows } = await db.query(
      `
      WITH event_stats AS (
        SELECT
          organizer_id,
          COUNT(*) FILTER (WHERE deleted_at IS NULL)::int AS total_events,
          COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'PUBLISHED')::int AS published_events,
          COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'DRAFT')::int AS draft_events,
          COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'COMPLETED')::int AS approved_unpublished_events,
          COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'CANCELLED')::int AS cancelled_events
        FROM events
        WHERE organizer_id = $1
        GROUP BY organizer_id
      ),
      order_stats AS (
        SELECT
          organizer_id,
          COUNT(*) FILTER (WHERE status = 'PAID')::int AS paid_orders,
          COALESCE(SUM(total_amount) FILTER (WHERE status = 'PAID'), 0)::numeric AS gross_revenue,
          COALESCE(SUM(discount_amount) FILTER (WHERE status = 'PAID'), 0)::numeric AS total_discount
        FROM orders
        WHERE organizer_id = $1
        GROUP BY organizer_id
      ),
      current_plan AS (
        SELECT
          os.status AS subscription_status,
          os.start_date,
          os.end_date,
          s.name AS plan_name,
          s.price AS plan_price
        FROM organizer_subscriptions os
        JOIN subscriptions s ON s.id = os.subscription_id AND s.deleted_at IS NULL
        WHERE os.organizer_id = $1
          AND os.status = 'ACTIVE'
          AND os.start_date <= now()
          AND os.end_date >= now()
        ORDER BY os.start_date DESC
        LIMIT 1
      )
      SELECT
        o.id,
        o.user_id,
        o.organization_name,
        o.description,
        o.business_email,
        o.business_phone,
        o.status,
        o.created_at,
        o.updated_at,
        u.full_name AS owner_name,
        u.email AS owner_email,
        u.phone AS owner_phone,
        u.address AS owner_address,
        u.city AS owner_city,
        u.dob AS owner_dob,
        u.bio AS owner_bio,
        u.avatar_url AS owner_avatar_url,
        u.status AS owner_status,
        u.email_verified AS owner_email_verified,
        u.created_at AS owner_created_at,
        u.updated_at AS owner_updated_at,
        COALESCE(event_stats.total_events, 0)::int AS total_events,
        COALESCE(event_stats.published_events, 0)::int AS published_events,
        COALESCE(event_stats.draft_events, 0)::int AS draft_events,
        COALESCE(event_stats.approved_unpublished_events, 0)::int AS approved_unpublished_events,
        COALESCE(event_stats.cancelled_events, 0)::int AS cancelled_events,
        COALESCE(order_stats.paid_orders, 0)::int AS paid_orders,
        COALESCE(order_stats.gross_revenue, 0)::numeric AS gross_revenue,
        COALESCE(order_stats.total_discount, 0)::numeric AS total_discount,
        current_plan.plan_name,
        current_plan.plan_price,
        current_plan.end_date AS plan_end_date
      FROM organizers o
      JOIN users u ON u.id = o.user_id AND u.deleted_at IS NULL
      LEFT JOIN event_stats ON event_stats.organizer_id = o.id
      LEFT JOIN order_stats ON order_stats.organizer_id = o.id
      LEFT JOIN current_plan ON true
      WHERE o.id = $1
      LIMIT 1
      `,
      [id],
    );

    return rows[0];
  }

  async findEvents(organizerId) {
    const { rows } = await db.query(
      `
      WITH event_order_stats AS (
        SELECT
          ev_ref.event_id,
          COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'PAID')::int AS paid_orders,
          COALESCE(SUM(o.total_amount) FILTER (WHERE o.status = 'PAID'), 0)::numeric AS gross_revenue
        FROM orders o
        JOIN LATERAL (
          SELECT es_inner.event_id
          FROM order_items oi_inner
          JOIN ticket_types tt_inner ON tt_inner.id = oi_inner.ticket_type_id
          JOIN event_sessions es_inner ON es_inner.id = tt_inner.event_session_id
          WHERE oi_inner.order_id = o.id
          LIMIT 1
        ) ev_ref ON true
        WHERE o.organizer_id = $1
        GROUP BY ev_ref.event_id
      )
      SELECT
        e.id,
        e.title,
        e.slug,
        e.short_description,
        e.status,
        e.visibility,
        e.approval_status,
        e.start_time,
        e.end_time,
        e.start_publish_at,
        e.end_publish_at,
        e.created_at,
        e.updated_at,
        c.name AS category_name,
        COALESCE(event_order_stats.paid_orders, 0)::int AS paid_orders,
        COALESCE(event_order_stats.gross_revenue, 0)::numeric AS gross_revenue
      FROM events e
      LEFT JOIN event_categories c ON c.id = e.category_id
      LEFT JOIN event_order_stats ON event_order_stats.event_id = e.id
      WHERE e.organizer_id = $1
        AND e.deleted_at IS NULL
      ORDER BY e.created_at DESC
      `,
      [organizerId],
    );
    return rows;
  }

  async findSubscriptionHistory(organizerId) {
    const { rows } = await db.query(
      `
      SELECT
        os.id,
        os.subscription_id,
        os.status,
        os.start_date,
        os.end_date,
        os.updated_at,
        s.name AS plan_name,
        s.price AS plan_price,
        s.duration_days
      FROM organizer_subscriptions os
      JOIN subscriptions s ON s.id = os.subscription_id
      WHERE os.organizer_id = $1
      ORDER BY os.start_date DESC
      `,
      [organizerId],
    );
    return rows;
  }

  async findRequestHistory(userId) {
    const { rows } = await db.query(
      `
      SELECT
        r.id,
        r.request_type::text AS request_type,
        r.organization_name,
        r.organization_description,
        r.business_email,
        r.business_email_verified,
        r.business_email_verified_at,
        r.business_phone,
        r.organization_avatar_url,
        r.tax_code,
        r.legal_document_url,
        r.business_license_url,
        r.legal_representative_name,
        r.legal_representative_position,
        r.legal_representative_id_url,
        r.authorization_letter_url,
        r.individual_full_name,
        r.individual_identity_number,
        r.individual_id_front_url,
        r.individual_id_back_url,
        r.individual_selfie_url,
        r.individual_tax_code,
        r.terms_accepted,
        r.terms_accepted_at,
        r.status::text AS status,
        r.review_note,
        r.reviewed_at,
        r.created_at,
        r.updated_at,
        reviewer.full_name AS reviewer_full_name
      FROM organizer_requests r
      LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by
      WHERE r.user_id = $1
      ORDER BY r.created_at DESC
      `,
      [userId],
    );
    return rows;
  }

  async findPaymentChannels(organizerId) {
    const { rows } = await db.query(
      `
      SELECT
        id,
        provider,
        client_id,
        bank_name,
        bank_account_number,
        bank_account_holder,
        status,
        is_default,
        created_at,
        updated_at,
        (api_key_encrypted IS NOT NULL) AS has_api_key,
        (checksum_key_encrypted IS NOT NULL) AS has_checksum_key
      FROM organizer_payment_channels
      WHERE organizer_id = $1
      ORDER BY is_default DESC, created_at DESC
      `,
      [organizerId],
    );
    return rows;
  }

  async updateStatus(id, status) {
    const { rows } = await db.query(
      `
      UPDATE organizers
      SET status = $2,
          updated_at = now()
      WHERE id = $1
      RETURNING id, user_id, organization_name, status
      `,
      [id, status],
    );
    return rows[0];
  }
}

module.exports = new AdminOrganizersRepository();
