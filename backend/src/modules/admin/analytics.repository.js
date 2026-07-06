const db = require('../../infrastructure/database/db.client');

class AdminAnalyticsRepository {
  /**
   * Platform-wide KPI summary:
   * Users, Events, Orders, Ticket GMV, Subscription Revenue
   */
  async getOverviewStats({ dateFrom, dateTo } = {}) {
    // ── Users ──────────────────────────────────────────────────────────────
    const usersRes = await db.query(`
      SELECT
        COUNT(*)::int                                              AS total_users,
        COUNT(*) FILTER (WHERE status = 'ACTIVE')::int            AS active_users,
        COUNT(*) FILTER (WHERE status = 'LOCKED')::int            AS locked_users,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS new_users_30d,
        (
          SELECT COUNT(DISTINCT ur.user_id)::int
          FROM user_roles ur
          JOIN roles r ON r.id = ur.role_id
          WHERE r.name = 'ORGANIZER'
        ) AS total_organizers,
        (
          SELECT COUNT(DISTINCT ur.user_id)::int
          FROM user_roles ur
          JOIN roles r ON r.id = ur.role_id
          WHERE r.name = 'STAFF'
        ) AS total_staff
      FROM users
      WHERE deleted_at IS NULL
    `);

    // ── Events ────────────────────────────────────────────────────────────
    const eventsRes = await db.query(`
      SELECT
        COUNT(*)::int                                                       AS total_events,
        COUNT(*) FILTER (WHERE status = 'PUBLISHED')::int                  AS published_events,
        COUNT(*) FILTER (WHERE status = 'PENDING_REVIEW')::int             AS pending_events,
        COUNT(*) FILTER (WHERE status = 'COMPLETED')::int                  AS completed_events,
        COUNT(*) FILTER (WHERE status = 'CANCELLED')::int                  AS cancelled_events,
        COUNT(*) FILTER (WHERE status = 'DRAFT')::int                      AS draft_events,
        COUNT(*) FILTER (WHERE status = 'HIDDEN')::int                     AS hidden_events
      FROM events
      WHERE deleted_at IS NULL
    `);

    // ── Orders & Ticket GMV (all-time) ─────────────────────────────────────
    const ordersRes = await db.query(`
      SELECT
        COUNT(*)::int                                              AS total_orders,
        COUNT(*) FILTER (WHERE status = 'PAID')::int              AS paid_orders,
        COUNT(*) FILTER (WHERE status = 'PENDING')::int           AS pending_orders,
        COUNT(*) FILTER (WHERE status = 'CANCELLED')::int         AS cancelled_orders,
        COALESCE(SUM(total_amount) FILTER (WHERE status = 'PAID'), 0)::numeric   AS gross_revenue,
        0::numeric                                                AS total_platform_fee,
        COALESCE(SUM(total_amount) FILTER (WHERE status = 'PAID'), 0)::numeric AS net_revenue
      FROM orders
    `);

    // ── Orders & Ticket GMV (filtered range) ──────────────────────────────
    let filteredOrders = null;
    if (dateFrom || dateTo) {
      const params = [];
      const conditions = ["status = 'PAID'"];
      if (dateFrom) { params.push(dateFrom); conditions.push(`created_at >= $${params.length}`); }
      if (dateTo)   { params.push(dateTo);   conditions.push(`created_at <= $${params.length}`); }

      const { rows } = await db.query(
        `SELECT
          COUNT(*)::int                                    AS paid_orders,
          COALESCE(SUM(total_amount), 0)::numeric          AS gross_revenue,
          0::numeric                                       AS total_platform_fee,
          COALESCE(SUM(total_amount), 0)::numeric          AS net_revenue
         FROM orders
         WHERE ${conditions.join(' AND ')}`,
        params,
      );
      filteredOrders = rows[0];
    }

    // ── Organizer requests ─────────────────────────────────────────────────
    const orgReqRes = await db.query(`
      SELECT
        COUNT(*)::int                                      AS total_requests,
        COUNT(*) FILTER (WHERE status = 'PENDING')::int   AS pending_requests,
        COUNT(*) FILTER (WHERE status = 'APPROVED')::int  AS approved_requests,
        COUNT(*) FILTER (WHERE status = 'REJECTED')::int  AS rejected_requests
      FROM organizer_requests
    `);

    return {
      users:               usersRes.rows[0],
      events:              eventsRes.rows[0],
      orders:              ordersRes.rows[0],
      filtered_orders:     filteredOrders,
      organizer_requests:  orgReqRes.rows[0],
    };
  }

  /**
   * Ticket GMV trend: daily totals for the given range (default last 30 days).
   */
  async getRevenueTrend({ dateFrom, dateTo, groupBy = 'day' } = {}) {
    const from = dateFrom || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const to   = dateTo   || new Date().toISOString();

    // Determine truncation granularity
    const trunc = groupBy === 'month' ? 'month' : groupBy === 'week' ? 'week' : 'day';

    const { rows } = await db.query(
      `
      SELECT
        DATE_TRUNC($1, created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS period,
        COUNT(*)::int                                     AS orders,
        COALESCE(SUM(total_amount), 0)::numeric           AS gross_revenue,
        0::numeric                                        AS platform_fee,
        COALESCE(SUM(total_amount), 0)::numeric           AS net_revenue
      FROM orders
      WHERE status = 'PAID'
        AND created_at >= $2
        AND created_at <= $3
      GROUP BY period
      ORDER BY period ASC
      `,
      [trunc, from, to],
    );

    return rows;
  }

  /**
   * New user registrations per day for the given range.
   */
  async getUserRegistrationTrend({ dateFrom, dateTo } = {}) {
    const from = dateFrom || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const to   = dateTo   || new Date().toISOString();

    const { rows } = await db.query(
      `
      SELECT
        DATE(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS day,
        COUNT(*)::int AS new_users
      FROM users
      WHERE deleted_at IS NULL
        AND created_at >= $1
        AND created_at <= $2
      GROUP BY day
      ORDER BY day ASC
      `,
      [from, to],
    );

    return rows;
  }

  /**
   * Top organizers by revenue generated, including their active subscription plan.
   */
  async getTopOrganizers({ limit = 10 } = {}) {
    const { rows } = await db.query(
      `
      SELECT
        o.id                                               AS organizer_id,
        COALESCE(o.organization_name, u.full_name)         AS organizer_name,
        u.email                                            AS organizer_email,
        COUNT(DISTINCT ord.id)::int                        AS total_orders,
        COALESCE(SUM(ord.total_amount), 0)::numeric        AS gross_revenue,
        0::numeric                                         AS platform_fee,
        COUNT(DISTINCT e.id)::int                          AS total_events,
        -- Active subscription plan
        (
          SELECT s.name
          FROM organizer_subscriptions os2
          JOIN subscriptions s ON s.id = os2.subscription_id
          WHERE os2.organizer_id = o.id
            AND os2.status = 'ACTIVE'
            AND s.deleted_at IS NULL
          ORDER BY os2.start_date DESC
          LIMIT 1
        ) AS subscription_name
      FROM organizers o
      JOIN users u ON u.id = o.user_id
      LEFT JOIN events e ON e.organizer_id = o.id AND e.deleted_at IS NULL
      LEFT JOIN orders ord ON ord.organizer_id = o.id AND ord.status = 'PAID'
      GROUP BY o.id, o.organization_name, u.full_name, u.email
      ORDER BY gross_revenue DESC
      LIMIT $1
      `,
      [limit],
    );

    return rows;
  }

  /**
   * Subscription revenue: tính tất cả lần đăng ký (kể cả CANCELLED vì đã thu tiền),
   * gộp theo plan — mỗi plan 1 dòng với tổng số lần đăng ký và doanh thu.
   */
  async getSubscriptionRevenue() {
    // Totals across all plans (all statuses = all paid)
    const totalRes = await db.query(`
      SELECT
        COUNT(os.id)::int                                           AS total_subscriptions,
        COUNT(os.id) FILTER (WHERE os.status = 'ACTIVE')::int      AS active_subscriptions,
        COALESCE(SUM(s.price), 0)::numeric                         AS total_revenue
      FROM organizer_subscriptions os
      JOIN subscriptions s ON s.id = os.subscription_id AND s.deleted_at IS NULL
    `);

    // Per-plan breakdown — each plan appears exactly once
    const byPlanRes = await db.query(`
      SELECT
        s.id                                                        AS plan_id,
        s.name                                                      AS plan_name,
        s.price,
        COUNT(os.id)::int                                           AS total,
        COUNT(os.id) FILTER (WHERE os.status = 'ACTIVE')::int      AS active,
        COALESCE(SUM(s.price), 0)::numeric                         AS revenue
      FROM subscriptions s
      LEFT JOIN organizer_subscriptions os ON os.subscription_id = s.id
      WHERE s.deleted_at IS NULL
      GROUP BY s.id, s.name, s.price
      ORDER BY revenue DESC
    `);

    return {
      ...(totalRes.rows[0] ?? { total_subscriptions: 0, active_subscriptions: 0, total_revenue: 0 }),
      by_plan: byPlanRes.rows,
    };
  }

  /**
   * Event counts per category.
   */
  async getEventsByCategory() {
    const { rows } = await db.query(`
      SELECT
        ec.id,
        ec.name,
        COUNT(e.id)::int                                         AS total_events,
        COUNT(e.id) FILTER (WHERE e.status = 'PUBLISHED')::int  AS published_events,
        COUNT(e.id) FILTER (WHERE e.status = 'COMPLETED')::int  AS completed_events
      FROM event_categories ec
      LEFT JOIN events e ON e.category_id = ec.id AND e.deleted_at IS NULL
      GROUP BY ec.id, ec.name
      ORDER BY total_events DESC
    `);

    return rows;
  }
}

module.exports = new AdminAnalyticsRepository();
