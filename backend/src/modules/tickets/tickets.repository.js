const db = require('../../infrastructure/database/db.client');

class TicketsRepository {
  async findTicketsByUserId(userId, filters = {}) {
    const params = [userId];
    let statusFilter = '';

    if (filters.status) {
      params.push(filters.status);
      statusFilter = `AND t.status = $${params.length}`;
    }

    const { rows } = await db.query(
      `
      SELECT
        t.id,
        t.ticket_code,
        t.qr_code,
        t.status,
        t.attendee_name,
        t.attendee_email,
        t.created_at,
        t.checked_in_at,
        oi.id AS order_item_id,
        oi.quantity AS order_item_quantity,
        oi.unit_price AS order_item_unit_price,
        oi.final_price AS order_item_final_price,
        oi.session_seat_id AS order_item_session_seat_id,
        e.id AS event_id,
        e.title AS event_title,
        e.slug AS event_slug,
        e.short_description AS event_short_description,
        e.start_time AS event_start_time,
        e.end_time AS event_end_time,
        e.thumbnail_url AS event_thumbnail_url,
        e.banner_url AS event_banner_url,
        es.id AS event_session_id,
        es.session_name,
        es.start_time AS session_start_time,
        es.end_time AS session_end_time,
        es.checkin_start_time,
        v.id AS venue_id,
        v.name AS venue_name,
        v.address_line AS venue_address,
        v.city AS venue_city,
        v.district AS venue_district,
        v.ward AS venue_ward,
        tt.id AS ticket_type_id,
        tt.name AS ticket_type_name,
        tt.price AS ticket_type_price,
        ss.id AS session_seat_id,
        ss.status AS session_seat_status,
        s.id AS seat_id,
        s.seat_map_id,
        s.row_label,
        s.seat_number,
        s.x_position,
        s.y_position,
        s.is_disabled,
        o.id AS order_id,
        o.order_code,
        o.buyer_name,
        o.buyer_email,
        o.total_amount,
        o.created_at AS order_created_at
      FROM tickets t
      JOIN order_items oi ON oi.id = t.order_item_id
      JOIN orders o ON o.id = oi.order_id
      JOIN events e ON e.id = t.event_id
      JOIN event_sessions es ON es.id = t.event_session_id
      JOIN venues v ON v.id = es.venue_id
      JOIN ticket_types tt ON tt.id = t.ticket_type_id
      LEFT JOIN session_seats ss ON ss.id = COALESCE(t.session_seat_id, oi.session_seat_id)
      LEFT JOIN seats s ON s.id = ss.seat_id
      WHERE o.user_id = $1
        AND o.status = 'PAID'
        AND e.deleted_at IS NULL
        ${statusFilter}
      ORDER BY es.start_time DESC, t.created_at DESC
      `,
      params,
    );
    return rows;
  }

  async findTicketByIdAndUserId(ticketId, userId) {
    const { rows } = await db.query(
      `
      SELECT
        t.id,
        t.ticket_code,
        t.qr_code,
        t.status,
        t.attendee_name,
        t.attendee_email,
        t.created_at,
        t.checked_in_at,
        t.checked_in_by,
        oi.id AS order_item_id,
        oi.quantity AS order_item_quantity,
        oi.unit_price AS order_item_unit_price,
        oi.final_price AS order_item_final_price,
        oi.session_seat_id AS order_item_session_seat_id,
        e.id AS event_id,
        e.title AS event_title,
        e.slug AS event_slug,
        e.short_description AS event_short_description,
        e.banner_url AS event_banner_url,
        e.thumbnail_url AS event_thumbnail_url,
        e.start_time AS event_start_time,
        e.end_time AS event_end_time,
        es.id AS event_session_id,
        es.session_name,
        es.start_time AS session_start_time,
        es.end_time AS session_end_time,
        es.checkin_start_time,
        v.id AS venue_id,
        v.name AS venue_name,
        v.address_line AS venue_address,
        v.city AS venue_city,
        v.district AS venue_district,
        v.ward AS venue_ward,
        tt.id AS ticket_type_id,
        tt.name AS ticket_type_name,
        tt.price AS ticket_type_price,
        ss.id AS session_seat_id,
        ss.status AS session_seat_status,
        s.id AS seat_id,
        s.seat_map_id,
        s.row_label,
        s.seat_number,
        s.x_position,
        s.y_position,
        s.is_disabled,
        o.id AS order_id,
        o.order_code,
        o.buyer_name,
        o.buyer_email,
        o.total_amount,
        o.created_at AS order_created_at,
        p.transaction_code,
        p.payment_method,
        p.provider,
        p.status AS payment_status,
        p.paid_at
      FROM tickets t
      JOIN order_items oi ON oi.id = t.order_item_id
      JOIN orders o ON o.id = oi.order_id
      JOIN events e ON e.id = t.event_id
      JOIN event_sessions es ON es.id = t.event_session_id
      JOIN venues v ON v.id = es.venue_id
      JOIN ticket_types tt ON tt.id = t.ticket_type_id
      LEFT JOIN session_seats ss ON ss.id = COALESCE(t.session_seat_id, oi.session_seat_id)
      LEFT JOIN seats s ON s.id = ss.seat_id
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(pt.provider_transaction_id, po.provider_order_code::text) AS transaction_code,
          'CASH'::text AS payment_method,
          po.provider::text AS provider,
          po.status,
          po.paid_at
        FROM payment_orders po
        LEFT JOIN payment_transactions pt ON pt.payment_order_id = po.id
        WHERE po.order_id = o.id
          AND po.status = 'PAID'
        ORDER BY po.paid_at DESC NULLS LAST, pt.created_at DESC NULLS LAST
        LIMIT 1
      ) p ON true
      WHERE t.id = $1
        AND o.user_id = $2
        AND o.status = 'PAID'
        AND e.deleted_at IS NULL
      ORDER BY p.paid_at DESC NULLS LAST
      LIMIT 1
      `,
      [ticketId, userId],
    );
    return rows[0];
  }
}

module.exports = new TicketsRepository();
