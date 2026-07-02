const db = require('../../infrastructure/database/db.client');

class OrganizerOrdersRepository {
  async findOrdersByOrganizer(organizerId, { page, limit, eventId, status, search }) {
    const offset = (page - 1) * limit;
    const params = [organizerId];
    const conditions = ['o.organizer_id = $1'];
    let idx = 2;

    if (eventId) {
      conditions.push(`e.id = $${idx}`);
      params.push(eventId);
      idx += 1;
    }

    if (status) {
      conditions.push(`o.status = $${idx}`);
      params.push(status.toUpperCase());
      idx += 1;
    }

    if (search) {
      conditions.push(
        `(o.buyer_name ILIKE $${idx} OR o.buyer_email ILIKE $${idx} OR o.order_code ILIKE $${idx})`,
      );
      params.push(`%${search}%`);
      idx += 1;
    }

    const whereClause = conditions.join(' AND ');

    const listQuery = `
      SELECT
        o.id,
        o.order_code,
        o.status,
        o.buyer_name,
        o.buyer_email,
        o.buyer_phone,
        o.subtotal,
        o.discount_amount,
        o.platform_fee,
        o.total_amount,
        o.created_at,
        o.updated_at,
        e.id    AS event_id,
        e.title AS event_title,
        e.slug  AS event_slug,
        COALESCE(
          (SELECT SUM(oi2.quantity) FROM order_items oi2 WHERE oi2.order_id = o.id),
          0
        )::int AS ticket_quantity,
        po.status  AS payment_status,
        po.paid_at AS payment_paid_at
      FROM orders o
      -- Resolve the event for this order via a single LATERAL subquery (avoids row duplication)
      JOIN LATERAL (
        SELECT es_inner.event_id
        FROM order_items oi_inner
        JOIN ticket_types tt_inner ON tt_inner.id = oi_inner.ticket_type_id
        JOIN event_sessions es_inner ON es_inner.id = tt_inner.event_session_id
        WHERE oi_inner.order_id = o.id
        LIMIT 1
      ) ev_ref ON true
      JOIN events e ON e.id = ev_ref.event_id
      LEFT JOIN LATERAL (
        SELECT status, paid_at
        FROM payment_orders po_inner
        WHERE po_inner.order_id = o.id
        ORDER BY po_inner.created_at DESC
        LIMIT 1
      ) po ON true
      WHERE ${whereClause}
      ORDER BY o.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `;

    const countQuery = `
      SELECT COUNT(o.id)::int AS total
      FROM orders o
      JOIN LATERAL (
        SELECT es_inner.event_id
        FROM order_items oi_inner
        JOIN ticket_types tt_inner ON tt_inner.id = oi_inner.ticket_type_id
        JOIN event_sessions es_inner ON es_inner.id = tt_inner.event_session_id
        WHERE oi_inner.order_id = o.id
        LIMIT 1
      ) ev_ref ON true
      JOIN events e ON e.id = ev_ref.event_id
      WHERE ${whereClause}
    `;

    params.push(limit, offset);

    const [listRes, countRes] = await Promise.all([
      db.query(listQuery, params),
      db.query(countQuery, params.slice(0, params.length - 2)), // exclude limit/offset
    ]);

    return {
      items: listRes.rows,
      total: countRes.rows[0]?.total ?? 0,
    };
  }

  async findOrderDetailByOrganizer(organizerId, orderId) {
    const orderRes = await db.query(
      `
      SELECT
        o.id,
        o.order_code,
        o.status,
        o.buyer_name,
        o.buyer_email,
        o.buyer_phone,
        o.subtotal,
        o.discount_amount,
        o.platform_fee,
        o.total_amount,
        o.expired_at,
        o.created_at,
        o.updated_at,
        o.user_id,
        u.full_name AS user_full_name,
        u.email     AS user_email,
        pc.code            AS promo_code,
        pc.discount_type   AS promo_discount_type,
        pc.discount_value  AS promo_discount_value,
        e.id    AS event_id,
        e.title AS event_title,
        e.slug  AS event_slug,
        po.id                    AS payment_order_id,
        po.provider              AS payment_provider,
        po.provider_order_code   AS payment_provider_order_code,
        po.status                AS payment_status,
        po.amount                AS payment_amount,
        po.paid_at               AS payment_paid_at,
        pt.provider_transaction_id AS payment_transaction_id
      FROM orders o
      JOIN LATERAL (
        SELECT es_inner.event_id
        FROM order_items oi_inner
        JOIN ticket_types tt_inner ON tt_inner.id = oi_inner.ticket_type_id
        JOIN event_sessions es_inner ON es_inner.id = tt_inner.event_session_id
        WHERE oi_inner.order_id = o.id
        LIMIT 1
      ) ev_ref ON true
      JOIN events e ON e.id = ev_ref.event_id
      LEFT JOIN users u ON u.id = o.user_id
      LEFT JOIN promo_codes pc ON pc.id = o.promo_code_id
      LEFT JOIN LATERAL (
        SELECT id, provider, provider_order_code, status, amount, paid_at
        FROM payment_orders po_inner
        WHERE po_inner.order_id = o.id
        ORDER BY po_inner.created_at DESC
        LIMIT 1
      ) po ON true
      LEFT JOIN LATERAL (
        SELECT provider_transaction_id
        FROM payment_transactions pt_inner
        WHERE pt_inner.payment_order_id = po.id
        ORDER BY pt_inner.created_at DESC
        LIMIT 1
      ) pt ON true
      WHERE o.id = $1
        AND o.organizer_id = $2
      LIMIT 1
      `,
      [orderId, organizerId],
    );

    const order = orderRes.rows[0];
    if (!order) return null;

    const itemsRes = await db.query(
      `
      SELECT
        oi.id,
        oi.quantity,
        oi.unit_price,
        oi.final_price,
        tt.id   AS ticket_type_id,
        tt.name AS ticket_type_name,
        tt.is_seated,
        es.id           AS session_id,
        es.session_name,
        es.start_time   AS session_start_time,
        es.end_time     AS session_end_time,
        v.id            AS venue_id,
        v.name          AS venue_name,
        v.address_line  AS venue_address,
        v.city          AS venue_city,
        ss.id            AS session_seat_id,
        s.row_label,
        s.seat_number
      FROM order_items oi
      JOIN ticket_types tt  ON tt.id = oi.ticket_type_id
      JOIN event_sessions es ON es.id = tt.event_session_id
      JOIN venues v ON v.id = es.venue_id
      LEFT JOIN session_seats ss ON ss.id = oi.session_seat_id
      LEFT JOIN seats s ON s.id = ss.seat_id
      WHERE oi.order_id = $1
      ORDER BY oi.id ASC
      `,
      [orderId],
    );

    return { order, items: itemsRes.rows };
  }

  async findAttendeesByEvent(organizerId, eventId, { page, limit, sessionId, ticketTypeId, status, search }) {
    const offset = (page - 1) * limit;
    const params = [organizerId, eventId];
    const conditions = [
      'e.organizer_id = $1',
      't.event_id = $2',
    ];
    let idx = 3;

    if (sessionId) {
      conditions.push(`t.event_session_id = $${idx}`);
      params.push(sessionId);
      idx += 1;
    }

    if (ticketTypeId) {
      conditions.push(`t.ticket_type_id = $${idx}`);
      params.push(ticketTypeId);
      idx += 1;
    }

    if (status) {
      conditions.push(`t.status = $${idx}`);
      params.push(status.toUpperCase());
      idx += 1;
    }

    if (search) {
      conditions.push(
        `(t.attendee_name ILIKE $${idx} OR t.attendee_email ILIKE $${idx} OR t.ticket_code ILIKE $${idx})`,
      );
      params.push(`%${search}%`);
      idx += 1;
    }

    const whereClause = conditions.join(' AND ');

    const listQuery = `
      SELECT
        t.id,
        t.ticket_code,
        t.status,
        t.attendee_name,
        t.attendee_email,
        t.checked_in_at,
        t.created_at,
        tt.id   AS ticket_type_id,
        tt.name AS ticket_type_name,
        tt.price AS ticket_type_price,
        es.id           AS session_id,
        es.session_name,
        es.start_time   AS session_start_time,
        es.end_time     AS session_end_time,
        v.name          AS venue_name,
        v.city          AS venue_city,
        ss.id           AS session_seat_id,
        s.row_label,
        s.seat_number,
        o.id            AS order_id,
        o.order_code,
        o.buyer_name,
        o.buyer_email
      FROM tickets t
      JOIN order_items oi ON oi.id = t.order_item_id
      JOIN orders o ON o.id = oi.order_id
      JOIN events e ON e.id = t.event_id
      JOIN event_sessions es ON es.id = t.event_session_id
      JOIN venues v ON v.id = es.venue_id
      JOIN ticket_types tt ON tt.id = t.ticket_type_id
      LEFT JOIN session_seats ss ON ss.id = COALESCE(t.session_seat_id, oi.session_seat_id)
      LEFT JOIN seats s ON s.id = ss.seat_id
      WHERE ${whereClause}
        AND o.status = 'PAID'
        AND e.deleted_at IS NULL
      ORDER BY es.start_time ASC, t.attendee_name ASC
      LIMIT $${idx} OFFSET $${idx + 1}
    `;

    const countQuery = `
      SELECT COUNT(t.id)::int AS total
      FROM tickets t
      JOIN order_items oi ON oi.id = t.order_item_id
      JOIN orders o ON o.id = oi.order_id
      JOIN events e ON e.id = t.event_id
      JOIN event_sessions es ON es.id = t.event_session_id
      JOIN ticket_types tt ON tt.id = t.ticket_type_id
      WHERE ${whereClause}
        AND o.status = 'PAID'
        AND e.deleted_at IS NULL
    `;

    params.push(limit, offset);
    const countParams = params.slice(0, params.length - 2);

    const [listRes, countRes] = await Promise.all([
      db.query(listQuery, params),
      db.query(countQuery, countParams),
    ]);

    return {
      items: listRes.rows,
      total: countRes.rows[0]?.total ?? 0,
    };
  }

  async findAttendeesForExport(organizerId, eventId, { sessionId, ticketTypeId, status, search }) {
    const params = [organizerId, eventId];
    const conditions = [
      'e.organizer_id = $1',
      't.event_id = $2',
    ];
    let idx = 3;

    if (sessionId) {
      conditions.push(`t.event_session_id = $${idx}`);
      params.push(sessionId);
      idx += 1;
    }

    if (ticketTypeId) {
      conditions.push(`t.ticket_type_id = $${idx}`);
      params.push(ticketTypeId);
      idx += 1;
    }

    if (status) {
      conditions.push(`t.status = $${idx}`);
      params.push(status.toUpperCase());
      idx += 1;
    }

    if (search) {
      conditions.push(
        `(t.attendee_name ILIKE $${idx} OR t.attendee_email ILIKE $${idx} OR t.ticket_code ILIKE $${idx})`,
      );
      params.push(`%${search}%`);
    }

    const whereClause = conditions.join(' AND ');

    const result = await db.query(
      `
      SELECT
        t.id,
        t.ticket_code,
        t.status,
        t.attendee_name,
        t.attendee_email,
        t.checked_in_at,
        t.created_at,
        tt.id   AS ticket_type_id,
        tt.name AS ticket_type_name,
        tt.price AS ticket_type_price,
        es.id           AS session_id,
        es.session_name,
        es.start_time   AS session_start_time,
        es.end_time     AS session_end_time,
        v.name          AS venue_name,
        v.city          AS venue_city,
        ss.id           AS session_seat_id,
        s.row_label,
        s.seat_number,
        o.id            AS order_id,
        o.order_code,
        o.buyer_name,
        o.buyer_email
      FROM tickets t
      JOIN order_items oi ON oi.id = t.order_item_id
      JOIN orders o ON o.id = oi.order_id
      JOIN events e ON e.id = t.event_id
      JOIN event_sessions es ON es.id = t.event_session_id
      JOIN venues v ON v.id = es.venue_id
      JOIN ticket_types tt ON tt.id = t.ticket_type_id
      LEFT JOIN session_seats ss ON ss.id = COALESCE(t.session_seat_id, oi.session_seat_id)
      LEFT JOIN seats s ON s.id = ss.seat_id
      WHERE ${whereClause}
        AND o.status = 'PAID'
        AND e.deleted_at IS NULL
      ORDER BY es.start_time ASC, t.attendee_name ASC
      `,
      params,
    );

    return result.rows;
  }

  // ─── Check-in Dashboard ────────────────────────────────────────────────────

  /**
   * Aggregate check-in stats for a specific event:
   * - Overall totals (total tickets, checked in, valid, cancelled, check-in rate)
   * - Per-session breakdown
   * - Per-ticket-type breakdown
   * - Recent check-ins (last 20)
   */
  async getCheckinStats(organizerId, eventId) {
    // Verify ownership via JOIN
    const overallRes = await db.query(
      `
      SELECT
        COUNT(t.id)::int                                          AS total_tickets,
        COUNT(t.id) FILTER (WHERE t.status = 'USED')::int        AS checked_in,
        COUNT(t.id) FILTER (WHERE t.status = 'VALID')::int       AS valid,
        COUNT(t.id) FILTER (WHERE t.status = 'CANCELLED')::int   AS cancelled
      FROM tickets t
      JOIN events e ON e.id = t.event_id
      WHERE e.id = $1
        AND e.organizer_id = $2
        AND e.deleted_at IS NULL
        AND EXISTS (
          SELECT 1 FROM orders o
          JOIN order_items oi ON oi.order_id = o.id
          WHERE oi.id = t.order_item_id AND o.status = 'PAID'
        )
      `,
      [eventId, organizerId],
    );

    const bySessionRes = await db.query(
      `
      SELECT
        es.id                                                         AS session_id,
        COALESCE(es.session_name, TO_CHAR(es.start_time AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI')) AS session_name,
        es.start_time,
        es.end_time,
        v.name                                                        AS venue_name,
        COUNT(t.id)::int                                              AS total_tickets,
        COUNT(t.id) FILTER (WHERE t.status = 'USED')::int            AS checked_in,
        COUNT(t.id) FILTER (WHERE t.status = 'VALID')::int           AS valid
      FROM event_sessions es
      JOIN events e ON e.id = es.event_id
      JOIN venues v ON v.id = es.venue_id
      LEFT JOIN tickets t ON t.event_session_id = es.id
        AND EXISTS (
          SELECT 1 FROM orders o
          JOIN order_items oi ON oi.order_id = o.id
          WHERE oi.id = t.order_item_id AND o.status = 'PAID'
        )
      WHERE es.event_id = $1
        AND e.organizer_id = $2
      GROUP BY es.id, es.session_name, es.start_time, es.end_time, v.name
      ORDER BY es.start_time ASC
      `,
      [eventId, organizerId],
    );

    const byTicketTypeRes = await db.query(
      `
      SELECT
        tt.id                                                         AS ticket_type_id,
        tt.name                                                       AS ticket_type_name,
        tt.price,
        COUNT(t.id)::int                                              AS total_tickets,
        COUNT(t.id) FILTER (WHERE t.status = 'USED')::int            AS checked_in,
        COUNT(t.id) FILTER (WHERE t.status = 'VALID')::int           AS valid
      FROM ticket_types tt
      JOIN event_sessions es ON es.id = tt.event_session_id
      LEFT JOIN tickets t ON t.ticket_type_id = tt.id
        AND EXISTS (
          SELECT 1 FROM orders o
          JOIN order_items oi ON oi.order_id = o.id
          WHERE oi.id = t.order_item_id AND o.status = 'PAID'
        )
      WHERE es.event_id = $1
      GROUP BY tt.id, tt.name, tt.price
      ORDER BY tt.price ASC
      `,
      [eventId],
    );

    const recentRes = await db.query(
      `
      SELECT
        t.ticket_code,
        t.attendee_name,
        t.attendee_email,
        t.checked_in_at,
        tt.name AS ticket_type_name,
        es.session_name
      FROM tickets t
      JOIN ticket_types tt ON tt.id = t.ticket_type_id
      JOIN event_sessions es ON es.id = t.event_session_id
      JOIN events e ON e.id = t.event_id
      WHERE t.event_id = $1
        AND e.organizer_id = $2
        AND t.status = 'USED'
        AND t.checked_in_at IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM orders o
          JOIN order_items oi ON oi.order_id = o.id
          WHERE oi.id = t.order_item_id AND o.status = 'PAID'
        )
      ORDER BY t.checked_in_at DESC
      LIMIT 20
      `,
      [eventId, organizerId],
    );

    const overall = overallRes.rows[0] ?? { total_tickets: 0, checked_in: 0, valid: 0, cancelled: 0 };
    return {
      overall: {
        ...overall,
        checkin_rate: overall.total_tickets > 0
          ? Math.round((overall.checked_in / overall.total_tickets) * 100)
          : 0,
      },
      by_session: bySessionRes.rows.map((s) => ({
        ...s,
        checkin_rate: s.total_tickets > 0
          ? Math.round((s.checked_in / s.total_tickets) * 100)
          : 0,
      })),
      by_ticket_type: byTicketTypeRes.rows.map((tt) => ({
        ...tt,
        checkin_rate: tt.total_tickets > 0
          ? Math.round((tt.checked_in / tt.total_tickets) * 100)
          : 0,
      })),
      recent_checkins: recentRes.rows,
    };
  }

  // ─── Revenue Dashboard ─────────────────────────────────────────────────────

  /**
   * Aggregate revenue stats for the organizer:
   * - Overall totals (gross, platform_fee, net)
   * - Per-event breakdown
   * - Daily revenue for last 30 days (for chart)
   * - Per-ticket-type revenue
   */
  async getRevenueStats(organizerId, { eventId, dateFrom, dateTo } = {}) {
    const baseConditions = ['o.organizer_id = $1', "o.status = 'PAID'"];
    const params = [organizerId];
    let idx = 2;

    if (eventId) {
      baseConditions.push(`ev_ref.event_id = $${idx}`);
      params.push(eventId);
      idx += 1;
    }
    if (dateFrom) {
      baseConditions.push(`o.created_at >= $${idx}`);
      params.push(dateFrom);
      idx += 1;
    }
    if (dateTo) {
      baseConditions.push(`o.created_at <= $${idx}`);
      params.push(dateTo);
      idx += 1;
    }

    const whereClause = baseConditions.join(' AND ');

    const overallRes = await db.query(
      `
      SELECT
        COUNT(DISTINCT o.id)::int                    AS total_orders,
        COALESCE(SUM(o.total_amount), 0)::numeric    AS gross_revenue,
        COALESCE(SUM(o.platform_fee), 0)::numeric    AS total_platform_fee,
        COALESCE(SUM(o.total_amount - o.platform_fee), 0)::numeric AS net_revenue,
        COALESCE(SUM(o.discount_amount), 0)::numeric AS total_discount,
        COALESCE(
          (SELECT SUM(oi2.quantity) FROM order_items oi2
           JOIN orders o2 ON o2.id = oi2.order_id
           WHERE o2.organizer_id = $1 AND o2.status = 'PAID'),
          0
        )::int AS total_tickets_sold
      FROM orders o
      JOIN LATERAL (
        SELECT es_inner.event_id
        FROM order_items oi_inner
        JOIN ticket_types tt_inner ON tt_inner.id = oi_inner.ticket_type_id
        JOIN event_sessions es_inner ON es_inner.id = tt_inner.event_session_id
        WHERE oi_inner.order_id = o.id
        LIMIT 1
      ) ev_ref ON true
      WHERE ${whereClause}
      `,
      params,
    );

    const byEventRes = await db.query(
      `
      SELECT
        e.id    AS event_id,
        e.title AS event_title,
        e.status AS event_status,
        e.start_time,
        COUNT(DISTINCT o.id)::int                          AS total_orders,
        COALESCE(SUM(o.total_amount), 0)::numeric          AS gross_revenue,
        COALESCE(SUM(o.platform_fee), 0)::numeric          AS platform_fee,
        COALESCE(SUM(o.total_amount - o.platform_fee), 0)::numeric AS net_revenue
      FROM orders o
      JOIN LATERAL (
        SELECT es_inner.event_id
        FROM order_items oi_inner
        JOIN ticket_types tt_inner ON tt_inner.id = oi_inner.ticket_type_id
        JOIN event_sessions es_inner ON es_inner.id = tt_inner.event_session_id
        WHERE oi_inner.order_id = o.id
        LIMIT 1
      ) ev_ref ON true
      JOIN events e ON e.id = ev_ref.event_id
      WHERE o.organizer_id = $1
        AND o.status = 'PAID'
        ${eventId ? `AND e.id = $${params.indexOf(eventId) + 1}` : ''}
        ${dateFrom ? `AND o.created_at >= $${params.indexOf(dateFrom) + 1}` : ''}
        ${dateTo ? `AND o.created_at <= $${params.indexOf(dateTo) + 1}` : ''}
      GROUP BY e.id, e.title, e.status, e.start_time
      ORDER BY gross_revenue DESC
      `,
      params,
    );

    // Daily revenue for last 30 days (or filtered range)
    const dailyParams = [organizerId];
    const dailyFrom = dateFrom || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const dailyTo = dateTo || new Date().toISOString();
    dailyParams.push(dailyFrom, dailyTo);
    if (eventId) dailyParams.push(eventId);

    const dailyRes = await db.query(
      `
      SELECT
        DATE(o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS day,
        COUNT(DISTINCT o.id)::int                           AS orders,
        COALESCE(SUM(o.total_amount), 0)::numeric           AS gross_revenue,
        COALESCE(SUM(o.total_amount - o.platform_fee), 0)::numeric AS net_revenue
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
        AND o.status = 'PAID'
        AND o.created_at >= $2
        AND o.created_at <= $3
        ${eventId ? `AND ev_ref.event_id = $4` : ''}
      GROUP BY day
      ORDER BY day ASC
      `,
      dailyParams,
    );

    return {
      overall: overallRes.rows[0] ?? {
        total_orders: 0,
        gross_revenue: 0,
        total_platform_fee: 0,
        net_revenue: 0,
        total_discount: 0,
        total_tickets_sold: 0,
      },
      by_event: byEventRes.rows,
      daily_revenue: dailyRes.rows,
    };
  }
  // ─── Ticket Sales Analytics ───────────────────────────────────────────────

  /**
   * Ticket sales analytics for an organizer:
   * - Overall totals (tickets sold, revenue, avg ticket price)
   * - Sales by ticket type (quantity sold, revenue, occupancy rate)
   * - Sales by event (occupancy rate)
   * - Daily sales trend (for chart)
   */
  async getTicketSalesAnalytics(organizerId, { eventId, dateFrom, dateTo } = {}) {
    const baseConditions = ['o.organizer_id = $1', "o.status = 'PAID'"];
    const params = [organizerId];
    let idx = 2;

    if (eventId) {
      baseConditions.push(`ev_ref.event_id = $${idx}`);
      params.push(eventId);
      idx += 1;
    }
    if (dateFrom) {
      baseConditions.push(`o.created_at >= $${idx}`);
      params.push(dateFrom);
      idx += 1;
    }
    if (dateTo) {
      baseConditions.push(`o.created_at <= $${idx}`);
      params.push(dateTo);
      idx += 1;
    }

    const whereClause = baseConditions.join(' AND ');

    // Overall totals
    const overallRes = await db.query(
      `
      SELECT
        COALESCE(SUM(oi.quantity), 0)::int                     AS total_tickets_sold,
        COALESCE(SUM(oi.final_price), 0)::numeric              AS total_revenue,
        COALESCE(
          CASE WHEN SUM(oi.quantity) > 0
            THEN SUM(oi.final_price) / SUM(oi.quantity)
            ELSE 0
          END, 0
        )::numeric                                             AS avg_ticket_price,
        COUNT(DISTINCT o.id)::int                              AS total_orders
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN LATERAL (
        SELECT es_inner.event_id
        FROM order_items oi_inner
        JOIN ticket_types tt_inner ON tt_inner.id = oi_inner.ticket_type_id
        JOIN event_sessions es_inner ON es_inner.id = tt_inner.event_session_id
        WHERE oi_inner.order_id = o.id
        LIMIT 1
      ) ev_ref ON true
      WHERE ${whereClause}
      `,
      params,
    );

    // Sales by ticket type
    const byTicketTypeRes = await db.query(
      `
      SELECT
        tt.id                                                  AS ticket_type_id,
        tt.name                                                AS ticket_type_name,
        tt.price                                               AS unit_price,
        tt.quantity                                            AS capacity,
        COALESCE(SUM(oi.quantity), 0)::int                     AS sold_quantity,
        COALESCE(SUM(oi.final_price), 0)::numeric              AS revenue,
        CASE WHEN tt.quantity > 0
          THEN ROUND((COALESCE(SUM(oi.quantity), 0)::numeric / tt.quantity) * 100, 1)
          ELSE 0
        END                                                    AS occupancy_rate
      FROM ticket_types tt
      JOIN event_sessions es ON es.id = tt.event_session_id
      JOIN events e ON e.id = es.event_id
      LEFT JOIN order_items oi ON oi.ticket_type_id = tt.id
      LEFT JOIN orders o ON o.id = oi.order_id
        AND o.organizer_id = $1
        AND o.status = 'PAID'
        ${eventId ? `AND EXISTS (
          SELECT 1 FROM order_items oi2
          JOIN ticket_types tt2 ON tt2.id = oi2.ticket_type_id
          JOIN event_sessions es2 ON es2.id = tt2.event_session_id
          WHERE oi2.order_id = o.id AND es2.event_id = $${params.indexOf(eventId) + 1}
        )` : ''}
        ${dateFrom ? `AND o.created_at >= $${params.indexOf(dateFrom) + 1}` : ''}
        ${dateTo   ? `AND o.created_at <= $${params.indexOf(dateTo) + 1}`   : ''}
      WHERE e.organizer_id = $1
        AND e.deleted_at IS NULL
        ${eventId ? `AND e.id = $${params.indexOf(eventId) + 1}` : ''}
      GROUP BY tt.id, tt.name, tt.price, tt.quantity
      ORDER BY sold_quantity DESC
      `,
      params,
    );

    // Sales by event (occupancy)
    const byEventRes = await db.query(
      `
      SELECT
        e.id                                                   AS event_id,
        e.title                                                AS event_title,
        e.status                                               AS event_status,
        e.start_time,
        COALESCE(
          (SELECT SUM(tt2.quantity)
           FROM ticket_types tt2
           JOIN event_sessions es2 ON es2.id = tt2.event_session_id
           WHERE es2.event_id = e.id), 0
        )::int                                                 AS total_capacity,
        COALESCE(SUM(oi.quantity), 0)::int                     AS sold_quantity,
        COALESCE(SUM(oi.final_price), 0)::numeric              AS revenue,
        COUNT(DISTINCT o.id)::int                              AS total_orders
      FROM events e
      LEFT JOIN event_sessions es ON es.id = (
        SELECT es2.id FROM event_sessions es2 WHERE es2.event_id = e.id LIMIT 1
      )
      LEFT JOIN ticket_types tt ON tt.event_session_id IN (
        SELECT id FROM event_sessions WHERE event_id = e.id
      )
      LEFT JOIN order_items oi ON oi.ticket_type_id = tt.id
      LEFT JOIN orders o ON o.id = oi.order_id
        AND o.organizer_id = $1
        AND o.status = 'PAID'
        ${dateFrom ? `AND o.created_at >= $${params.indexOf(dateFrom) + 1}` : ''}
        ${dateTo   ? `AND o.created_at <= $${params.indexOf(dateTo) + 1}`   : ''}
      WHERE e.organizer_id = $1
        AND e.deleted_at IS NULL
        ${eventId ? `AND e.id = $${params.indexOf(eventId) + 1}` : ''}
      GROUP BY e.id, e.title, e.status, e.start_time
      ORDER BY sold_quantity DESC
      `,
      params,
    );

    // Daily sales trend
    const dailyParams = [organizerId];
    const dailyFrom = dateFrom || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const dailyTo   = dateTo   || new Date().toISOString();
    dailyParams.push(dailyFrom, dailyTo);
    if (eventId) dailyParams.push(eventId);

    const dailyRes = await db.query(
      `
      SELECT
        DATE(o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')     AS day,
        COUNT(DISTINCT o.id)::int                              AS orders,
        COALESCE(SUM(oi.quantity), 0)::int                     AS tickets_sold,
        COALESCE(SUM(oi.final_price), 0)::numeric              AS revenue
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN LATERAL (
        SELECT es_inner.event_id
        FROM order_items oi_inner
        JOIN ticket_types tt_inner ON tt_inner.id = oi_inner.ticket_type_id
        JOIN event_sessions es_inner ON es_inner.id = tt_inner.event_session_id
        WHERE oi_inner.order_id = o.id
        LIMIT 1
      ) ev_ref ON true
      WHERE o.organizer_id = $1
        AND o.status = 'PAID'
        AND o.created_at >= $2
        AND o.created_at <= $3
        ${eventId ? `AND ev_ref.event_id = $4` : ''}
      GROUP BY day
      ORDER BY day ASC
      `,
      dailyParams,
    );

    // Compute occupancy per event
    const byEvent = byEventRes.rows.map((ev) => ({
      ...ev,
      occupancy_rate: ev.total_capacity > 0
        ? Math.round((ev.sold_quantity / ev.total_capacity) * 100)
        : 0,
    }));

    return {
      overall:       overallRes.rows[0] ?? {
        total_tickets_sold: 0,
        total_revenue:      0,
        avg_ticket_price:   0,
        total_orders:       0,
      },
      by_ticket_type: byTicketTypeRes.rows,
      by_event:        byEvent,
      daily_sales:     dailyRes.rows,
    };
  }
}

module.exports = new OrganizerOrdersRepository();
