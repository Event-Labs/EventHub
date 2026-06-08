const db = require('../../infrastructure/database/db.client');
const crypto = require('crypto');
const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');

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

  async checkout({ userId, eventId, organizerId, buyer, items, totals }) {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      const orderCode = `ORD-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

      const orderResult = await client.query(
        `
        INSERT INTO orders (
          user_id,
          organizer_id,
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
        VALUES ($1, $2, $3, $4, $5, $6, 'PAID', $7, 0, $8, $9, $10)
        RETURNING id, order_code, status, subtotal, platform_fee, total_amount, created_at
        `,
        [
          userId,
          organizerId,
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
        const sessionSeatIds = item.session_seat_ids || [];

        if (sessionSeatIds.length > 0) {
          const hasSeatMappingResult = await client.query(
            `
            SELECT EXISTS (
              SELECT 1
              FROM ticket_type_seats
              WHERE ticket_type_id = $1
            ) AS has_mapping
            `,
            [item.ticket_type_id],
          );
          const requiresTicketTypeSeatMapping = Boolean(hasSeatMappingResult.rows[0]?.has_mapping);

          const seatsResult = await client.query(
            `
            SELECT
              ss.id,
              ss.status,
              ss.event_session_id,
              ss.order_id,
              s.id AS seat_id,
              s.row_label,
              s.seat_number,
              s.is_disabled,
              tts.ticket_type_id AS mapped_ticket_type_id
            FROM session_seats ss
            JOIN seats s ON s.id = ss.seat_id
            LEFT JOIN ticket_type_seats tts
              ON tts.seat_id = s.id
             AND tts.ticket_type_id = $2
            WHERE ss.id = ANY($1::uuid[])
              AND ss.event_session_id = $3
            FOR UPDATE OF ss
            `,
            [sessionSeatIds, item.ticket_type_id, item.event_session_id],
          );

          if (seatsResult.rows.length !== sessionSeatIds.length) {
            throw new AppError(
              'One or more selected seats are invalid for this event session',
              400,
              ErrorCodes.ORDER_INVALID_ITEMS,
            );
          }

          for (const seat of seatsResult.rows) {
            if (seat.is_disabled) {
              throw new AppError(
                `Seat ${seat.row_label}${seat.seat_number} is disabled`,
                400,
                ErrorCodes.ORDER_INVALID_ITEMS,
              );
            }

            if (seat.status !== 'AVAILABLE') {
              throw new AppError(
                `Seat ${seat.row_label}${seat.seat_number} is not available`,
                400,
                ErrorCodes.ORDER_TICKET_UNAVAILABLE,
              );
            }

            if (requiresTicketTypeSeatMapping && !seat.mapped_ticket_type_id) {
              throw new AppError(
                `Seat ${seat.row_label}${seat.seat_number} does not belong to this ticket type`,
                400,
                ErrorCodes.ORDER_INVALID_ITEMS,
              );
            }
          }

          await client.query(
            `
            UPDATE session_seats
            SET status = 'SOLD',
                order_id = $2,
                held_by = $3,
                held_until = NULL
            WHERE id = ANY($1::uuid[])
            `,
            [sessionSeatIds, order.id, userId],
          );
        }

        const orderItemSeatIds = sessionSeatIds.length > 0 ? sessionSeatIds : [null];

        for (const sessionSeatId of orderItemSeatIds) {
          const orderItemQuantity = sessionSeatId ? 1 : item.quantity;
          const orderItemFinalPrice = sessionSeatId ? item.unit_price : item.line_total;

          const orderItemResult = await client.query(
            `
            INSERT INTO order_items (
              order_id,
              ticket_type_id,
              session_seat_id,
              quantity,
              unit_price,
              final_price
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, session_seat_id
            `,
            [
              order.id,
              item.ticket_type_id,
              sessionSeatId,
              orderItemQuantity,
              item.unit_price,
              orderItemFinalPrice,
            ],
          );

          const orderItem = orderItemResult.rows[0];
          const ticketQuantity = sessionSeatId ? 1 : item.quantity;

          for (let index = 0; index < ticketQuantity; index += 1) {
          const ticketCode = `EH-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
          const ticketResult = await client.query(
            `
            INSERT INTO tickets (
              order_item_id,
              event_id,
              event_session_id,
              ticket_type_id,
              session_seat_id,
              ticket_code,
              qr_code,
              attendee_name,
              attendee_email,
              status
            )
            VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8, 'VALID')
            RETURNING id, ticket_code, status, created_at
            `,
            [
              orderItem.id,
              eventId,
              item.event_session_id,
              item.ticket_type_id,
              orderItem.session_seat_id,
              ticketCode,
              item.attendee_name,
              item.attendee_email,
            ],
          );
          issuedTickets.push(ticketResult.rows[0]);
        }
        }
      }

      await client.query(
        `
        INSERT INTO payment_orders (
          order_id,
          organizer_id,
          payment_owner_type,
          payment_channel_id,
          reference_type,
          reference_id,
          provider,
          provider_order_code,
          amount,
          currency,
          description,
          status,
          paid_at
        )
        VALUES ($1, $2, 'ORGANIZER', NULL, 'TICKET_ORDER', $1, 'MANUAL', $3, $4, 'VND', $5, 'PAID', now())
        `,
        [
          order.id,
          organizerId,
          Number(`${Date.now()}${crypto.randomInt(100, 1000)}`),
          totals.total_amount,
          `Manual payment for order ${order.order_code}`,
        ],
      );

      await client.query(
        `
        INSERT INTO payment_transactions (
          payment_order_id,
          provider,
          provider_transaction_id,
          amount,
          status,
          raw_payload
        )
        SELECT id, provider, $2, amount, 'PAID', $3::jsonb
        FROM payment_orders
        WHERE order_id = $1
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [
          order.id,
          `SIM-${order.order_code}`,
          JSON.stringify({ order_code: order.order_code, method: 'CASH' }),
        ],
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

}

module.exports = new OrdersRepository();
