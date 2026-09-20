const db = require('../../infrastructure/database/db.client');

const REFUND_SELECT = `
  rr.id,
  rr.order_id,
  rr.ticket_id,
  rr.event_id,
  rr.customer_id,
  rr.organizer_id,
  rr.refund_amount,
  rr.refund_rate,
  rr.policy_snapshot,
  rr.reason,
  rr.status,
  rr.refund_method,
  rr.bank_name,
  rr.bank_account_number,
  rr.bank_account_name,
  rr.organizer_note,
  rr.organizer_proof_url,
  rr.organizer_transaction_ref,
  rr.processed_by_id,
  rr.requested_at,
  rr.reviewed_at,
  rr.refunded_at,
  rr.created_at,
  rr.updated_at,
  e.title AS event_title,
  e.banner_url AS event_banner_url,
  e.start_time AS event_start_time,
  e.end_time AS event_end_time,
  e.refund_policy AS event_refund_policy,
  o.order_code,
  o.total_amount AS order_total_amount,
  o.subtotal AS order_subtotal,
  o.discount_amount AS order_discount_amount,
  o.status AS order_status,
  t.ticket_code,
  t.status AS ticket_status,
  t.checked_in_at,
  t.refund_policy_snapshot AS ticket_refund_policy_snapshot,
  COALESCE(t.session_seat_id, oi.session_seat_id) AS session_seat_id,
  es.start_time AS session_start_time,
  es.end_time AS session_end_time,
  tt.name AS ticket_type_name,
  tt.price AS ticket_type_price,
  oi.unit_price AS ticket_unit_price,
  oi.final_price AS ticket_final_price,
  u_cust.full_name AS customer_name,
  u_cust.email AS customer_email,
  u_cust.phone AS customer_phone,
  u_proc.full_name AS processed_by_name
`;

const REFUND_JOINS = `
  FROM refund_requests rr
  JOIN events e ON e.id = rr.event_id
  JOIN orders o ON o.id = rr.order_id
  LEFT JOIN tickets t ON t.id = rr.ticket_id
  LEFT JOIN order_items oi ON oi.id = t.order_item_id
  LEFT JOIN ticket_types tt ON tt.id = COALESCE(t.ticket_type_id, oi.ticket_type_id)
  LEFT JOIN event_sessions es ON es.id = COALESCE(t.event_session_id, tt.event_session_id)
  JOIN users u_cust ON u_cust.id = rr.customer_id
  LEFT JOIN users u_proc ON u_proc.id = rr.processed_by_id
`;

class RefundsRepository {
  async getRefundContext(customerId, orderId, ticketId = null, client = db, forUpdate = false) {
    const lockClause = forUpdate ? 'FOR UPDATE OF o' : '';
    const { rows } = await client.query(
      `
      SELECT
        o.id AS order_id,
        o.order_code,
        o.user_id AS customer_id,
        org.user_id AS organizer_id,
        o.status AS order_status,
        o.total_amount AS order_total_amount,
        o.subtotal AS order_subtotal,
        o.discount_amount AS order_discount_amount,
        o.platform_fee AS order_platform_fee,
        t.id AS ticket_id,
        t.ticket_code,
        t.status AS ticket_status,
        t.checked_in_at,
        t.refund_policy_snapshot AS ticket_refund_policy_snapshot,
        COALESCE(t.session_seat_id, oi.session_seat_id) AS session_seat_id,
        e.id AS event_id,
        e.title AS event_title,
        e.start_time AS event_start_time,
        e.end_time AS event_end_time,
        e.refund_policy AS event_refund_policy,
        es.start_time AS session_start_time,
        es.end_time AS session_end_time,
        tt.name AS ticket_type_name,
        oi.unit_price AS ticket_unit_price,
        oi.final_price AS ticket_final_price
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN tickets t ON t.order_item_id = oi.id
      JOIN ticket_types tt ON tt.id = oi.ticket_type_id
      JOIN event_sessions es ON es.id = tt.event_session_id
      JOIN events e ON e.id = es.event_id
      JOIN organizers org ON org.id = e.organizer_id
      WHERE (o.user_id = $1 OR t.id = $3)
        AND ($2::uuid IS NULL OR o.id = $2)
        AND ($3::uuid IS NULL OR t.id = $3)
      ${lockClause}
      LIMIT 1
      `,
      [customerId, orderId || null, ticketId || null],
    );
    return rows[0] || null;
  }

  async findExistingActiveRefund(orderId, ticketId = null, client = db) {
    const { rows } = await client.query(
      `
      SELECT *
      FROM refund_requests
      WHERE ($1::uuid IS NULL OR order_id = $1)
        AND ($2::uuid IS NULL OR ticket_id = $2)
        AND status IN ('PENDING', 'APPROVED', 'PROCESSING', 'REFUNDED')
      LIMIT 1
      `,
      [orderId || null, ticketId || null],
    );
    return rows[0] || null;
  }

  async create(data, client = db) {
    const { rows } = await client.query(
      `
      INSERT INTO refund_requests (
        order_id,
        ticket_id,
        event_id,
        customer_id,
        organizer_id,
        refund_amount,
        refund_rate,
        policy_snapshot,
        reason,
        status,
        refund_method,
        bank_name,
        bank_account_number,
        bank_account_name,
        requested_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, 'PENDING', $10, $11, $12, $13, now())
      RETURNING id
      `,
      [
        data.order_id,
        data.ticket_id || null,
        data.event_id,
        data.customer_id,
        data.organizer_id,
        data.refund_amount,
        data.refund_rate !== undefined ? data.refund_rate : null,
        data.policy_snapshot ? JSON.stringify(data.policy_snapshot) : null,
        data.reason,
        data.refund_method || 'PAYOS',
        data.bank_name || null,
        data.bank_account_number || null,
        data.bank_account_name || null,
      ],
    );

    return this.findById(rows[0].id, client);
  }

  async findById(id, client = db) {
    const { rows } = await client.query(
      `
      SELECT ${REFUND_SELECT}
      ${REFUND_JOINS}
      WHERE rr.id = $1
      LIMIT 1
      `,
      [id],
    );
    return rows[0] || null;
  }

  async findByIdForUpdate(id, client) {
    const { rows } = await client.query(
      `
      SELECT ${REFUND_SELECT}
      ${REFUND_JOINS}
      WHERE rr.id = $1
      FOR UPDATE OF rr
      LIMIT 1
      `,
      [id],
    );
    return rows[0] || null;
  }

  async findPaymentOrderWithChannel(orderId, client = db) {
    const { rows } = await client.query(
      `
      SELECT
        po.*,
        COALESCE(org_ch.client_id, opc.client_id) AS client_id,
        COALESCE(org_ch.api_key_encrypted, opc.api_key_encrypted) AS api_key_encrypted,
        COALESCE(org_ch.checksum_key_encrypted, opc.checksum_key_encrypted) AS checksum_key_encrypted,
        COALESCE(org_ch.payout_client_id, opc.payout_client_id) AS payout_client_id,
        COALESCE(org_ch.payout_api_key_encrypted, opc.payout_api_key_encrypted) AS payout_api_key_encrypted,
        COALESCE(org_ch.payout_checksum_key_encrypted, opc.payout_checksum_key_encrypted) AS payout_checksum_key_encrypted,
        COALESCE(org_ch.payout_status, opc.payout_status) AS payout_status,
        COALESCE(org_ch.bank_name, opc.bank_name) AS channel_bank_name,
        COALESCE(org_ch.bank_account_number, opc.bank_account_number) AS channel_account_number,
        COALESCE(org_ch.bank_account_holder, opc.bank_account_holder) AS channel_account_holder
      FROM payment_orders po
      LEFT JOIN organizer_payment_channels opc ON opc.id = po.payment_channel_id
      LEFT JOIN orders o ON o.id = po.order_id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN ticket_types tt ON tt.id = oi.ticket_type_id
      LEFT JOIN event_sessions es ON es.id = tt.event_session_id
      LEFT JOIN events e ON e.id = es.event_id
      LEFT JOIN organizer_payment_channels org_ch ON (
        org_ch.organizer_id = e.organizer_id 
        OR org_ch.organizer_id = po.organizer_id
        OR org_ch.organizer_id IN (SELECT id FROM organizers WHERE user_id = po.organizer_id)
      )
      WHERE po.order_id = $1
      ORDER BY
        CASE WHEN po.provider = 'PAYOS' AND po.status = 'PAID' THEN 0 ELSE 1 END,
        po.paid_at DESC NULLS LAST,
        po.created_at DESC
      LIMIT 1
      `,
      [orderId],
    );
    return rows[0] || null;
  }

  async lockTicketForRefund(ticketId, client = db) {
    const { rows } = await client.query(
      `
      UPDATE tickets
      SET status = 'REFUND_PENDING'
      WHERE id = $1 AND status = 'VALID'
      RETURNING *
      `,
      [ticketId],
    );
    return rows[0] || null;
  }

  async unlockTicketFromRefund(ticketId, client = db) {
    const { rows } = await client.query(
      `
      UPDATE tickets
      SET status = 'VALID'
      WHERE id = $1 AND status = 'REFUND_PENDING'
      RETURNING *
      `,
      [ticketId],
    );
    return rows[0] || null;
  }

  async invalidateTicketForRefund(ticketId, client = db) {
    const { rows } = await client.query(
      `
      UPDATE tickets
      SET status = 'REFUNDED'
      WHERE id = $1
      RETURNING *
      `,
      [ticketId],
    );
    return rows[0] || null;
  }

  async releaseSessionSeat(sessionSeatId, client = db) {
    if (!sessionSeatId) return null;
    const { rows } = await client.query(
      `
      UPDATE session_seats
      SET status = 'AVAILABLE',
          held_by = NULL,
          held_until = NULL,
          order_id = NULL
      WHERE id = $1
      RETURNING *
      `,
      [sessionSeatId],
    );
    return rows[0] || null;
  }

  async findByCustomer(customerId, filters = {}) {
    const params = [customerId];
    const where = ['rr.customer_id = $1'];

    if (filters.status && filters.status !== 'ALL') {
      params.push(filters.status.toUpperCase());
      where.push(`rr.status = $${params.length}`);
    }

    const { rows } = await db.query(
      `
      SELECT ${REFUND_SELECT}
      ${REFUND_JOINS}
      WHERE ${where.join(' AND ')}
      ORDER BY rr.requested_at DESC
      `,
      params,
    );
    return rows;
  }

  async isEventOwnedByUser(eventId, userId) {
    const { rows } = await db.query(
      `
      SELECT 1 
      FROM events e 
      JOIN organizers org ON org.id = e.organizer_id 
      WHERE e.id = $1 AND (org.user_id = $2 OR org.id = $2) 
      LIMIT 1
      `,
      [eventId, userId],
    );
    return rows.length > 0;
  }

  async findByOrganizer(organizerUserId, filters = {}, userRole = 'ORGANIZER') {
    const params = [];
    const where = [];

    if (userRole !== 'ADMIN' && userRole !== 'admin') {
      params.push(organizerUserId);
      where.push(`(
        rr.organizer_id = $1 
        OR rr.organizer_id IN (SELECT org_sub.id FROM organizers org_sub WHERE org_sub.user_id = $1)
        OR rr.event_id IN (SELECT e_sub.id FROM events e_sub JOIN organizers org_sub ON org_sub.id = e_sub.organizer_id WHERE org_sub.user_id = $1 OR org_sub.id = $1)
      )`);
    }

    if (filters.eventId) {
      params.push(filters.eventId);
      where.push(`rr.event_id = $${params.length}`);
    }

    if (filters.status && filters.status !== 'ALL') {
      params.push(filters.status.toUpperCase());
      where.push(`rr.status = $${params.length}`);
    }

    if (filters.keyword) {
      params.push(`%${filters.keyword}%`);
      const idx = params.length;
      where.push(
        `(o.order_code ILIKE $${idx} OR t.ticket_code ILIKE $${idx} OR u_cust.full_name ILIKE $${idx} OR u_cust.email ILIKE $${idx} OR u_cust.phone ILIKE $${idx})`,
      );
    }

    if (filters.startDate) {
      params.push(filters.startDate);
      where.push(`rr.requested_at >= $${params.length}::timestamptz`);
    }

    if (filters.endDate) {
      params.push(filters.endDate);
      where.push(`rr.requested_at <= $${params.length}::timestamptz`);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const { rows } = await db.query(
      `
      SELECT ${REFUND_SELECT}
      ${REFUND_JOINS}
      ${whereClause}
      ORDER BY
        CASE WHEN rr.status = 'PENDING' THEN 0 ELSE 1 END,
        rr.requested_at DESC
      `,
      params,
    );
    return rows;
  }

  async updateStatus(id, updates, client = db) {
    const sets = [];
    const values = [];
    const addSet = (column, val) => {
      values.push(val);
      sets.push(`${column} = $${values.length}`);
    };

    if (updates.status !== undefined) addSet('status', updates.status);
    if (updates.refund_amount !== undefined) addSet('refund_amount', updates.refund_amount);
    if (updates.organizer_note !== undefined) addSet('organizer_note', updates.organizer_note);
    if (updates.organizer_proof_url !== undefined) addSet('organizer_proof_url', updates.organizer_proof_url);
    if (updates.organizer_transaction_ref !== undefined) addSet('organizer_transaction_ref', updates.organizer_transaction_ref);
    if (updates.processed_by_id !== undefined) addSet('processed_by_id', updates.processed_by_id);
    if (updates.reviewed_at !== undefined) addSet('reviewed_at', updates.reviewed_at);
    if (updates.refunded_at !== undefined) addSet('refunded_at', updates.refunded_at);

    addSet('updated_at', new Date());

    values.push(id);
    await client.query(
      `
      UPDATE refund_requests
      SET ${sets.join(', ')}
      WHERE id = $${values.length}
      `,
      values,
    );

    return this.findById(id, client);
  }

  async countActiveOrderTickets(orderId, client = db) {
    const { rows } = await client.query(
      `
      SELECT COUNT(*)::int AS count
      FROM tickets t
      JOIN order_items oi ON oi.id = t.order_item_id
      WHERE oi.order_id = $1 AND t.status IN ('VALID', 'USED')
      `,
      [orderId],
    );
    return Number(rows[0]?.count || 0);
  }
}

module.exports = new RefundsRepository();
