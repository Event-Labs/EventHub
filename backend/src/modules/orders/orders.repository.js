const db = require('../../infrastructure/database/db.client');
const crypto = require('crypto');

class OrdersRepository {
  async findEventById(eventId) {
    const { rows } = await db.query(
      `
      SELECT id, title, slug, organizer_id, category_id, start_time, end_time, status, deleted_at
      FROM events
      WHERE id = $1
      LIMIT 1
      `,
      [eventId],
    );
    return rows[0];
  }

  async findTicketTypesByIds(ticketTypeIds) {
    const { rows } = await db.query(
      `
      SELECT
        tt.id,
        tt.event_session_id,
        tt.name,
        tt.price,
        tt.quantity,
        tt.max_per_order,
        tt.sale_start,
        tt.sale_end,
        tt.is_seated,
        es.event_id,
        es.start_time AS session_start_time,
        es.end_time AS session_end_time
      FROM ticket_types tt
      JOIN event_sessions es ON es.id = tt.event_session_id
      WHERE tt.id = ANY($1::uuid[])
      `,
      [ticketTypeIds],
    );
    return rows;
  }

  async countSoldTickets(ticketTypeId) {
    const { rows } = await db.query(
      `
      SELECT COUNT(t.id)::int AS sold
      FROM tickets t
      JOIN order_items oi ON oi.id = t.order_item_id
      JOIN orders o ON o.id = oi.order_id
      WHERE oi.ticket_type_id = $1
        AND o.status = 'PAID'
      `,
      [ticketTypeId],
    );
    return rows[0]?.sold || 0;
  }

  async checkout({ userId, eventId, buyer, items, totals }) {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      const orderCode = `ORD-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

      const orderResult = await client.query(
        `
        INSERT INTO orders (
          user_id,
          buyer_name,
          buyer_email,
          buyer_phone,
          order_code,
          status,
          subtotal,
          discount_amount,
          platform_fee_config_id,
          platform_fee,
          total_amount
        )
        VALUES ($1, $2, $3, $4, $5, 'PAID', $6, 0, $7, $8, $9)
        RETURNING id, order_code, status, subtotal, platform_fee, total_amount, created_at
        `,
        [
          userId,
          buyer.name,
          buyer.email,
          buyer.phone || null,
          orderCode,
          totals.subtotal,
          totals.platform_fee_config_id,
          totals.platform_fee,
          totals.total_amount,
        ],
      );

      const order = orderResult.rows[0];
      const issuedTickets = [];

      for (const item of items) {
        const orderItemResult = await client.query(
          `
          INSERT INTO order_items (
            order_id,
            ticket_type_id,
            quantity,
            unit_price,
            final_price
          )
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id
          `,
          [
            order.id,
            item.ticket_type_id,
            item.quantity,
            item.unit_price,
            item.line_total,
          ],
        );

        const orderItemId = orderItemResult.rows[0].id;

        for (let index = 0; index < item.quantity; index += 1) {
          const ticketCode = `EH-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
          const ticketResult = await client.query(
            `
            INSERT INTO tickets (
              order_item_id,
              event_id,
              event_session_id,
              ticket_type_id,
              ticket_code,
              attendee_name,
              attendee_email,
              status
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'VALID')
            RETURNING id, ticket_code, status, created_at
            `,
            [
              orderItemId,
              eventId,
              item.event_session_id,
              item.ticket_type_id,
              ticketCode,
              item.attendee_name,
              item.attendee_email,
            ],
          );
          issuedTickets.push(ticketResult.rows[0]);
        }
      }

      await client.query(
        `
        INSERT INTO payments (
          order_id,
          payment_method,
          provider,
          transaction_code,
          amount,
          status,
          paid_at
        )
        VALUES ($1, 'CASH', 'MANUAL', $2, $3, 'SUCCESS', now())
        `,
        [order.id, `SIM-${order.order_code}`, totals.total_amount],
      );

      await client.query('COMMIT');

      return {
        order,
        tickets: issuedTickets,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async findTicketsByUserId(userId) {
    const { rows } = await db.query(
      `
      SELECT
        t.id,
        t.ticket_code,
        t.status,
        t.attendee_name,
        t.attendee_email,
        t.created_at,
        t.checked_in_at,
        e.id AS event_id,
        e.title AS event_title,
        e.slug AS event_slug,
        e.start_time AS event_start_time,
        e.end_time AS event_end_time,
        e.thumbnail_url AS event_thumbnail_url,
        tt.name AS ticket_type_name,
        tt.price AS ticket_type_price,
        o.order_code,
        o.created_at AS order_created_at
      FROM tickets t
      JOIN order_items oi ON oi.id = t.order_item_id
      JOIN orders o ON o.id = oi.order_id
      JOIN events e ON e.id = t.event_id
      JOIN ticket_types tt ON tt.id = t.ticket_type_id
      WHERE o.user_id = $1
        AND o.status = 'PAID'
        AND e.deleted_at IS NULL
      ORDER BY e.start_time DESC, t.created_at DESC
      `,
      [userId],
    );
    return rows;
  }
}

module.exports = new OrdersRepository();
