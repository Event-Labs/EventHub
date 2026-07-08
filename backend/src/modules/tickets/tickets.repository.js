const db = require('../../infrastructure/database/db.client');

const STAFF_TICKET_SELECT = `
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
    e.id AS event_id,
    e.title AS event_title,
    e.slug AS event_slug,
    e.start_time AS event_start_time,
    e.end_time AS event_end_time,
    es.id AS event_session_id,
    es.session_name,
    es.start_time AS session_start_time,
    es.end_time AS session_end_time,
    tt.id AS ticket_type_id,
    tt.name AS ticket_type_name,
    tt.price AS ticket_type_price,
    o.id AS order_id,
    o.order_code,
    o.status AS order_status,
    o.buyer_name,
    o.buyer_email,
    o.buyer_phone,
    checker.id AS checked_in_by_id,
    checker.full_name AS checked_in_by_name,
    checker.email AS checked_in_by_email
  FROM tickets t
  JOIN order_items oi ON oi.id = t.order_item_id
  JOIN orders o ON o.id = oi.order_id
  JOIN events e ON e.id = t.event_id
  JOIN event_sessions es ON es.id = t.event_session_id
  JOIN ticket_types tt ON tt.id = t.ticket_type_id
  LEFT JOIN users checker ON checker.id = t.checked_in_by
`;

class TicketsRepository {
  async ensureRequireAttendeeInfoColumn(client = db) {
    await client.query('ALTER TABLE events ADD COLUMN IF NOT EXISTS require_attendee_info BOOLEAN NOT NULL DEFAULT FALSE');
  }

  async findTicketsByUserId(userId, filters = {}) {
    await this.ensureRequireAttendeeInfoColumn();
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
        e.require_attendee_info,
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
    await this.ensureRequireAttendeeInfoColumn();
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
        e.require_attendee_info,
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

  async searchStaffTickets(staffId, filters = {}) {
    const params = [staffId];
    const conditions = [];

    if (filters.ticketCode) {
      params.push(`%${filters.ticketCode}%`);
      conditions.push(`(t.ticket_code ILIKE $${params.length} OR t.qr_code ILIKE $${params.length})`);
    }

    if (filters.buyerName) {
      params.push(`%${filters.buyerName}%`);
      conditions.push(`(o.buyer_name ILIKE $${params.length} OR t.attendee_name ILIKE $${params.length})`);
    }

    if (filters.buyerEmail) {
      params.push(`%${filters.buyerEmail}%`);
      conditions.push(`(o.buyer_email ILIKE $${params.length} OR t.attendee_email ILIKE $${params.length})`);
    }

    if (filters.buyerPhone) {
      params.push(`%${filters.buyerPhone}%`);
      conditions.push(`o.buyer_phone ILIKE $${params.length}`);
    }

    const { rows } = await db.query(
      `
      ${STAFF_TICKET_SELECT}
      JOIN event_staffs staff_scope
        ON staff_scope.event_id = t.event_id
       AND staff_scope.staff_id = $1
      WHERE e.deleted_at IS NULL
        AND (
          e.status = 'PUBLISHED'
          OR (e.status = 'COMPLETED' AND e.approval_status = 'APPROVED')
        )
        AND COALESCE(e.end_time, e.start_time) >= now()
        AND o.status = 'PAID'
        ${conditions.length ? `AND ${conditions.join(' AND ')}` : ''}
      ORDER BY es.start_time DESC, t.created_at DESC
      LIMIT 25
      `,
      params,
    );
    return rows;
  }

  async findTicketAccessForStaff(ticketRef, staffId) {
    const params = [ticketRef, staffId];
    const { rows } = await db.query(
      `
      ${STAFF_TICKET_SELECT}
      WHERE e.deleted_at IS NULL
        AND (
          t.id::text = $1
          OR UPPER(t.ticket_code) = UPPER($1)
          OR t.qr_code = $1
        )
      ORDER BY CASE WHEN EXISTS (
        SELECT 1 FROM event_staffs escope
        JOIN events scoped_event ON scoped_event.id = escope.event_id
        WHERE escope.event_id = t.event_id
          AND escope.staff_id = $2
          AND scoped_event.deleted_at IS NULL
          AND (
            scoped_event.status = 'PUBLISHED'
            OR (scoped_event.status = 'COMPLETED' AND scoped_event.approval_status = 'APPROVED')
          )
          AND COALESCE(scoped_event.end_time, scoped_event.start_time) >= now()
      ) THEN 0 ELSE 1 END
      LIMIT 1
      `,
      params,
    );

    const ticket = rows[0];
    if (!ticket) return null;

    const accessResult = await db.query(
      `
      SELECT 1
      FROM event_staffs es
      JOIN events e ON e.id = es.event_id
      WHERE es.event_id = $1
        AND es.staff_id = $2
        AND e.deleted_at IS NULL
        AND (
          e.status = 'PUBLISHED'
          OR (e.status = 'COMPLETED' AND e.approval_status = 'APPROVED')
        )
        AND COALESCE(e.end_time, e.start_time) >= now()
      LIMIT 1
      `,
      [ticket.event_id, staffId],
    );

    return {
      ...ticket,
      has_staff_access: accessResult.rowCount > 0,
    };
  }

  async checkInTicket(ticketId, staffId, method = 'MANUAL') {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      const lockResult = await client.query(
        `
        SELECT
          t.id,
          t.status,
          t.event_id,
          es.end_time AS session_end_time,
          o.status AS order_status,
          EXISTS (
            SELECT 1
            FROM event_staffs staff_scope
            JOIN events scoped_event ON scoped_event.id = staff_scope.event_id
            WHERE staff_scope.event_id = t.event_id
              AND staff_scope.staff_id = $2
              AND scoped_event.deleted_at IS NULL
              AND (
                scoped_event.status = 'PUBLISHED'
                OR (scoped_event.status = 'COMPLETED' AND scoped_event.approval_status = 'APPROVED')
              )
              AND COALESCE(scoped_event.end_time, scoped_event.start_time) >= now()
          ) AS has_staff_access
        FROM tickets t
        JOIN event_sessions es ON es.id = t.event_session_id
        JOIN order_items oi ON oi.id = t.order_item_id
        JOIN orders o ON o.id = oi.order_id
        JOIN events e ON e.id = t.event_id
        WHERE t.id = $1
          AND e.deleted_at IS NULL
        FOR UPDATE OF t
        `,
        [ticketId, staffId],
      );

      const lockedTicket = lockResult.rows[0];
      if (!lockedTicket) {
        await client.query('ROLLBACK');
        return { state: 'NOT_FOUND' };
      }

      if (!lockedTicket.has_staff_access) {
        await client.query('ROLLBACK');
        return { state: 'FORBIDDEN' };
      }

      if (lockedTicket.status !== 'VALID') {
        await client.query('ROLLBACK');
        return { state: 'INVALID_STATUS', ticket: lockedTicket };
      }

      if (lockedTicket.order_status !== 'PAID') {
        await client.query('ROLLBACK');
        return { state: 'INVALID_ORDER', ticket: lockedTicket };
      }

      if (lockedTicket.session_end_time && new Date(lockedTicket.session_end_time).getTime() < Date.now()) {
        await client.query('ROLLBACK');
        return { state: 'EXPIRED', ticket: lockedTicket };
      }

      await client.query(
        `
        UPDATE tickets
        SET status = 'USED',
            checked_in_at = now(),
            checked_in_by = $2
        WHERE id = $1
        `,
        [ticketId, staffId],
      );

      await client.query(
        `
        INSERT INTO checkin_logs (ticket_id, staff_id, method, checked_in_at)
        VALUES ($1, $2, $3, now())
        ON CONFLICT (ticket_id) DO NOTHING
        `,
        [ticketId, staffId, method],
      );

      const ticketResult = await client.query(
        `
        ${STAFF_TICKET_SELECT}
        WHERE t.id = $1
        LIMIT 1
        `,
        [ticketId],
      );

      await client.query('COMMIT');
      return { state: 'CHECKED_IN', ticket: ticketResult.rows[0] };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = new TicketsRepository();
