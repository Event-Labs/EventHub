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
}

module.exports = new OrganizerOrdersRepository();
