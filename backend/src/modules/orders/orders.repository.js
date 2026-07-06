const crypto = require('crypto');
const db = require('../../infrastructure/database/db.client');
const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const promotionsRepository = require('../promotions/promotions.repository');
const { validateSelectedSeats } = require('../events/seatingRules');

const HOLD_MINUTES = Number(process.env.TICKET_HOLD_MINUTES || 15);
const MAX_TICKETS_PER_ORDER = Number(process.env.MAX_TICKETS_PER_ORDER || 4);
const MAX_TICKETS_PER_EVENT_ACCOUNT = Number(process.env.MAX_TICKETS_PER_EVENT_ACCOUNT || 6);

function orderCode() {
  return `ORD-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

function providerOrderCode() {
  return Number(`${Date.now()}${crypto.randomInt(100, 1000)}`);
}

function ticketCode() {
  return `EH-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

function attendeeKey(ticketTypeId, sessionSeatId = null) {
  return `${ticketTypeId}:${sessionSeatId || ''}`;
}

function buildAttendeeQueues(attendees = []) {
  const queues = new Map();
  attendees.forEach((attendee) => {
    const key = attendeeKey(attendee.ticket_type_id, attendee.session_seat_id);
    if (!queues.has(key)) queues.set(key, []);
    queues.get(key).push({
      name: attendee.name,
      email: attendee.email,
    });
  });
  return queues;
}

class OrdersRepository {
  async ensureRequireAttendeeInfoColumn(client = db) {
    await client.query('ALTER TABLE events ADD COLUMN IF NOT EXISTS require_attendee_info BOOLEAN NOT NULL DEFAULT FALSE');
  }

  async ensureAttendeeInfoColumn(client = db) {
    await client.query(
      `
      ALTER TABLE order_items
      ADD COLUMN IF NOT EXISTS attendee_info JSONB NOT NULL DEFAULT '[]'::jsonb
      `,
    );
  }

  async expirePendingOrders() {
    await db.query(
      `
      WITH expired AS (
        UPDATE orders
        SET status = 'EXPIRED', updated_at = now()
        WHERE status = 'PENDING'
          AND expired_at <= now()
        RETURNING id
      )
      UPDATE session_seats ss
      SET status = 'AVAILABLE',
          held_by = NULL,
          held_until = NULL,
          order_id = NULL
      FROM expired e
      WHERE ss.order_id = e.id
        AND ss.status = 'HELD'
      `,
    );

    await db.query(
      `
      UPDATE ticket_holds th
      SET status = 'EXPIRED', updated_at = now()
      FROM orders o
      WHERE th.order_id = o.id
        AND th.status = 'ACTIVE'
        AND o.status = 'EXPIRED'
      `,
    );


    await db.query(
      `
      WITH expired_holds AS (
        UPDATE ticket_holds
        SET status = 'EXPIRED', updated_at = now()
        WHERE status = 'ACTIVE'
          AND order_id IS NULL
          AND expires_at <= now()
        RETURNING session_seat_id
      )
      UPDATE session_seats ss
      SET status = 'AVAILABLE',
          held_by = NULL,
          held_until = NULL,
          order_id = NULL
      FROM expired_holds eh
      WHERE ss.id = eh.session_seat_id
        AND ss.status = 'HELD'
        AND ss.order_id IS NULL
        AND ss.held_until <= now()
      `,
    );
    await db.query(
      `
      UPDATE payment_orders po
      SET status = 'EXPIRED', updated_at = now()
      FROM orders o
      WHERE po.order_id = o.id
        AND po.status = 'PENDING'
        AND o.status = 'EXPIRED'
      `,
    );
  }

  async createPendingCheckout({ userId, eventId, buyer, attendees = [], promoCode, items, totals, paymentChannel }) {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');
      await this.ensureRequireAttendeeInfoColumn(client);
      await this.ensureAttendeeInfoColumn(client);

      const ticketTypeIds = [...new Set(items.map((item) => item.ticket_type_id))];
      const ticketTypesResult = await client.query(
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
          es.id AS session_id,
          es.status AS session_status,
          es.start_time AS session_start_time,
          es.end_time AS session_end_time,
          e.id AS event_id,
          e.title AS event_title,
          e.slug AS event_slug,
          e.end_time AS event_end_time,
          e.organizer_id,
          e.status AS event_status,
          e.visibility,
          e.approval_status,
          e.deleted_at,
          e.seating_rules,
          e.require_attendee_info
        FROM ticket_types tt
        JOIN event_sessions es ON es.id = tt.event_session_id
        JOIN events e ON e.id = es.event_id
        WHERE tt.id = ANY($1::uuid[])
        FOR UPDATE OF tt
        `,
        [ticketTypeIds],
      );

      if (ticketTypesResult.rows.length !== ticketTypeIds.length) {
        throw new AppError('Th\u00f4ng tin v\u00e9 kh\u00f4ng h\u1ee3p l\u1ec7.', 400, ErrorCodes.ORDER_INVALID_ITEMS);
      }

      const ticketTypeMap = new Map(ticketTypesResult.rows.map((row) => [row.id, row]));
      const firstTicket = ticketTypesResult.rows[0];

      if (
        !firstTicket ||
        firstTicket.event_id !== eventId ||
        firstTicket.deleted_at ||
        firstTicket.event_status !== 'PUBLISHED' ||
        firstTicket.visibility !== 'PUBLIC' ||
        firstTicket.approval_status !== 'APPROVED'
      ) {
        throw new AppError('S\u1ef1 ki\u1ec7n hi\u1ec7n kh\u00f4ng kh\u1ea3 d\u1ee5ng \u0111\u1ec3 \u0111\u1eb7t v\u00e9.', 400, ErrorCodes.ORDER_INVALID_ITEMS);
      }

      if (firstTicket.event_end_time && new Date(firstTicket.event_end_time).getTime() < Date.now()) {
        throw new AppError('S\u1ef1 ki\u1ec7n \u0111\u00e3 k\u1ebft th\u00fac, kh\u00f4ng th\u1ec3 b\u00e1n v\u00e9.', 400, ErrorCodes.ORDER_TICKET_SALE_CLOSED);
      }

      if (firstTicket.organizer_id !== paymentChannel.organizer_id) {
        throw new AppError('K\u00eanh thanh to\u00e1n c\u1ee7a ban t\u1ed5 ch\u1ee9c kh\u00f4ng h\u1ee3p l\u1ec7.', 400, ErrorCodes.ORDER_INVALID_ITEMS);
      }


      const totalRequested = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      if (totalRequested > MAX_TICKETS_PER_ORDER) {
        throw new AppError(`B\u1ea1n ch\u1ec9 \u0111\u01b0\u1ee3c ch\u1ecdn t\u1ed1i \u0111a ${MAX_TICKETS_PER_ORDER} v\u00e9 trong m\u1ed9t \u0111\u01a1n h\u00e0ng.`, 400, ErrorCodes.ORDER_INVALID_ITEMS);
      }

      const requireAttendeeInfo = Boolean(firstTicket.require_attendee_info);
      if (requireAttendeeInfo && attendees.length !== totalRequested) {
        throw new AppError('Vui l\u00f2ng nh\u1eadp \u0111\u1ee7 th\u00f4ng tin ng\u01b0\u1eddi tham d\u1ef1 cho t\u1eebng v\u00e9.', 400, ErrorCodes.INVALID_INPUT);
      }
      const attendeeQueues = requireAttendeeInfo ? buildAttendeeQueues(attendees) : new Map();

      const purchasedResult = await client.query(
        `
        SELECT COALESCE(SUM(oi.quantity), 0)::int AS quantity
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN ticket_types tt ON tt.id = oi.ticket_type_id
        JOIN event_sessions es ON es.id = tt.event_session_id
        WHERE es.event_id = $1
          AND o.status = 'PAID'
          AND (
            o.user_id = $2
            OR lower(o.buyer_email) = lower($3::text)
            OR ($4::text IS NOT NULL AND o.buyer_phone = $4::text)
          )
        `,
        [eventId, userId, buyer.email, buyer.phone || null],
      );
      const purchasedQuantity = Number(purchasedResult.rows[0]?.quantity || 0);
      if (purchasedQuantity + totalRequested > MAX_TICKETS_PER_EVENT_ACCOUNT) {
        throw new AppError(`T\u00e0i kho\u1ea3n n\u00e0y ch\u1ec9 \u0111\u01b0\u1ee3c mua t\u1ed1i \u0111a ${MAX_TICKETS_PER_EVENT_ACCOUNT} v\u00e9 cho s\u1ef1 ki\u1ec7n n\u00e0y.`, 400, ErrorCodes.ORDER_INVALID_ITEMS);
      }
      const expiresAtResult = await client.query(
        `SELECT now() + ($1::text || ' minutes')::interval AS expired_at`,
        [HOLD_MINUTES],
      );
      const expiredAt = expiresAtResult.rows[0].expired_at;

      const subtotal = items.reduce((sum, item) => {
        const ticketType = ticketTypeMap.get(item.ticket_type_id);
        return sum + Number(ticketType?.price || 0) * Number(item.quantity || 0);
      }, 0);
      let promo = null;
      let discountAmount = 0;

      if (promoCode) {
        await promotionsRepository.ensureSupportSchema(client);
        const promoResult = await client.query(
          `
          SELECT *
          FROM promo_codes
          WHERE (
              event_id = $1
              OR EXISTS (
                SELECT 1
                FROM promo_code_events pce
                WHERE pce.promo_code_id = promo_codes.id
                  AND pce.event_id = $1
              )
              OR (
                event_id IS NULL
                AND NOT EXISTS (
                  SELECT 1
                  FROM promo_code_events pce_any
                  WHERE pce_any.promo_code_id = promo_codes.id
                )
              )
            )
            AND organizer_id = $3
            AND UPPER(code) = UPPER($2)
            AND is_active = true
            AND (start_time IS NULL OR start_time <= now())
            AND (end_time IS NULL OR end_time >= now())
            AND (usage_limit IS NULL OR used_count < usage_limit)
          LIMIT 1
          `,
          [eventId, promoCode, firstTicket.organizer_id],
        );
        promo = promoResult.rows[0];

        if (!promo || subtotal < Number(promo.min_order_value || 0)) {
          throw new AppError('M\u00e3 khuy\u1ebfn m\u00e3i kh\u00f4ng h\u1ee3p l\u1ec7 cho \u0111\u01a1n h\u00e0ng n\u00e0y.', 400, ErrorCodes.INVALID_INPUT);
        }

        if (promo.discount_type === 'PERCENTAGE') {
          discountAmount = Math.round((subtotal * Number(promo.discount_value)) / 100);
          if (promo.max_discount !== null && promo.max_discount !== undefined) {
            discountAmount = Math.min(discountAmount, Number(promo.max_discount));
          }
        } else {
          discountAmount = Number(promo.discount_value);
        }

        discountAmount = Math.min(discountAmount, subtotal);
      }

      const totalAmount = subtotal - discountAmount;

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
          promo_code_id,
          subtotal,
          discount_amount,
          platform_fee,
          total_amount,
          expired_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7, $8, $9, 0, $10, $11)
        RETURNING *
        `,
        [
          userId,
          firstTicket.organizer_id,
          buyer.name,
          buyer.email,
          buyer.phone || null,
          orderCode(),
          promo?.id || null,
          subtotal,
          discountAmount,
          totalAmount,
          expiredAt,
        ],
      );

      const order = orderResult.rows[0];
      const orderItems = [];

      for (const item of items) {
        const ticketType = ticketTypeMap.get(item.ticket_type_id);
        const selectedSeatIds = item.session_seat_ids || [];

        if (!ticketType || ticketType.event_id !== eventId) {
          throw new AppError('Lo\u1ea1i v\u00e9 kh\u00f4ng thu\u1ed9c s\u1ef1 ki\u1ec7n n\u00e0y.', 400, ErrorCodes.ORDER_INVALID_ITEMS);
        }

        if (ticketType.session_status !== 'UPCOMING') {
          throw new AppError('Su\u1ea5t di\u1ec5n hi\u1ec7n kh\u00f4ng kh\u1ea3 d\u1ee5ng \u0111\u1ec3 \u0111\u1eb7t v\u00e9.', 400, ErrorCodes.ORDER_INVALID_ITEMS);
        }

        const now = Date.now();
        const sessionEnd = ticketType.session_end_time ? new Date(ticketType.session_end_time).getTime() : null;
        if (sessionEnd && sessionEnd < now) {
          throw new AppError('Su\u1ea5t di\u1ec5n \u0111\u00e3 k\u1ebft th\u00fac, kh\u00f4ng th\u1ec3 b\u00e1n v\u00e9.', 400, ErrorCodes.ORDER_TICKET_SALE_CLOSED);
        }

        const saleStart = ticketType.sale_start ? new Date(ticketType.sale_start).getTime() : null;
        const saleEnd = ticketType.sale_end ? new Date(ticketType.sale_end).getTime() : null;
        if ((saleStart && saleStart > now) || (saleEnd && saleEnd < now)) {
          throw new AppError(`V\u00e9 "${ticketType.name}" hi\u1ec7n ch\u01b0a m\u1edf b\u00e1n ho\u1eb7c \u0111\u00e3 ng\u1eebng b\u00e1n.`, 400, ErrorCodes.ORDER_TICKET_SALE_CLOSED);
        }

        if (item.quantity > Math.min(ticketType.max_per_order || MAX_TICKETS_PER_ORDER, MAX_TICKETS_PER_ORDER)) {
          throw new AppError(`B\u1ea1n ch\u1ec9 \u0111\u01b0\u1ee3c mua t\u1ed1i \u0111a ${Math.min(ticketType.max_per_order || MAX_TICKETS_PER_ORDER, MAX_TICKETS_PER_ORDER)} v\u00e9 trong m\u1ed9t \u0111\u01a1n h\u00e0ng.`, 400, ErrorCodes.ORDER_INVALID_ITEMS);
        }

        if (ticketType.is_seated || selectedSeatIds.length > 0) {
          if (selectedSeatIds.length !== item.quantity) {
            throw new AppError('Số ghế đã chọn không khớp với số lượng vé.', 400, ErrorCodes.ORDER_INVALID_ITEMS);
          }

          const seatsResult = await client.query(
            `
            SELECT
              ss.id,
              ss.status,
              ss.held_until,
              ss.held_by,
              ss.order_id,
              ss.event_session_id,
              s.is_disabled,
              s.row_label,
              s.seat_number,
              s.x_position,
              s.y_position,
              tts.ticket_type_id AS mapped_ticket_type_id,
              EXISTS (
                SELECT 1
                FROM order_items oi_sold
                JOIN orders o_sold ON o_sold.id = oi_sold.order_id
                LEFT JOIN tickets t_sold ON t_sold.order_item_id = oi_sold.id
                WHERE COALESCE(t_sold.session_seat_id, oi_sold.session_seat_id) = ss.id
                  AND o_sold.status = 'PAID'
                  AND (t_sold.id IS NULL OR t_sold.status <> 'CANCELLED')
              ) AS has_paid_ticket
            FROM session_seats ss
            JOIN seats s ON s.id = ss.seat_id
            LEFT JOIN ticket_type_seats tts
              ON tts.seat_id = s.id
             AND tts.ticket_type_id = $2
            WHERE ss.id = ANY($1::uuid[])
              AND ss.event_session_id = $3
            FOR UPDATE OF ss
            `,
            [selectedSeatIds, item.ticket_type_id, ticketType.event_session_id],
          );

          if (seatsResult.rows.length !== selectedSeatIds.length) {
            throw new AppError('M\u1ed9t ho\u1eb7c nhi\u1ec1u gh\u1ebf \u0111\u00e3 ch\u1ecdn kh\u00f4ng h\u1ee3p l\u1ec7.', 400, ErrorCodes.ORDER_INVALID_ITEMS);
          }

          const hasSeatMapping = await client.query(
            'SELECT EXISTS (SELECT 1 FROM ticket_type_seats WHERE ticket_type_id = $1) AS has_mapping',
            [item.ticket_type_id],
          );
          const requiresMapping = Boolean(hasSeatMapping.rows[0]?.has_mapping);

          const eligibleSeatsResult = await client.query(
            `
            SELECT
              ss.id AS session_seat_id,
              CASE
                WHEN EXISTS (
                  SELECT 1
                  FROM order_items oi_sold
                  JOIN orders o_sold ON o_sold.id = oi_sold.order_id
                  LEFT JOIN tickets t_sold ON t_sold.order_item_id = oi_sold.id
                  WHERE COALESCE(t_sold.session_seat_id, oi_sold.session_seat_id) = ss.id
                    AND o_sold.status = 'PAID'
                    AND (t_sold.id IS NULL OR t_sold.status <> 'CANCELLED')
                ) THEN 'SOLD'
                WHEN ss.status = 'HELD' AND ss.order_id IS NULL THEN 'AVAILABLE'
                WHEN ss.status = 'HELD' AND ss.held_until <= now() THEN 'AVAILABLE'
                ELSE ss.status
              END AS status,
              ss.held_until,
              s.row_label,
              s.seat_number,
              s.x_position,
              s.y_position,
              s.is_disabled
            FROM session_seats ss
            JOIN seats s ON s.id = ss.seat_id
            LEFT JOIN ticket_type_seats tts
              ON tts.seat_id = s.id
             AND tts.ticket_type_id = $1
            WHERE ss.event_session_id = $2
              AND (
                NOT EXISTS (SELECT 1 FROM ticket_type_seats WHERE ticket_type_id = $1)
                OR tts.ticket_type_id IS NOT NULL
              )
            ORDER BY s.row_label ASC, s.seat_number ASC
            `,
            [item.ticket_type_id, ticketType.event_session_id],
          );
          const seatingRuleIssues = validateSelectedSeats({
            rules: ticketType.seating_rules,
            selectedSeats: seatsResult.rows.map((seat) => ({ ...seat, session_seat_id: seat.id })),
            eligibleSeats: eligibleSeatsResult.rows,
          });
          if (seatingRuleIssues.length) {
            throw new AppError(seatingRuleIssues[0], 400, ErrorCodes.ORDER_INVALID_ITEMS);
          }

          for (const seat of seatsResult.rows) {
            const heldStillValid =
              seat.status === 'HELD' &&
              seat.order_id &&
              seat.held_until &&
              new Date(seat.held_until).getTime() > Date.now();
            if (
              seat.is_disabled ||
              seat.has_paid_ticket ||
              seat.status === 'SOLD' ||
              heldStillValid ||
              (requiresMapping && !seat.mapped_ticket_type_id)
            ) {
              throw new AppError(
                'Rất tiếc, vé/ghế bạn chọn vừa có người đặt. Vui lòng chọn vé/ghế khác.',
                409,
                ErrorCodes.ORDER_TICKET_UNAVAILABLE,
              );
            }

            const attendeeInfo = requireAttendeeInfo
              ? attendeeQueues.get(attendeeKey(item.ticket_type_id, seat.id))?.shift()
              : null;
            if (requireAttendeeInfo && !attendeeInfo) {
              throw new AppError('Th\u00f4ng tin ng\u01b0\u1eddi tham d\u1ef1 kh\u00f4ng kh\u1edbp v\u1edbi v\u00e9/gh\u1ebf \u0111\u00e3 ch\u1ecdn.', 400, ErrorCodes.INVALID_INPUT);
            }

            const itemResult = await client.query(
              `
              INSERT INTO order_items (order_id, ticket_type_id, session_seat_id, quantity, unit_price, final_price, attendee_info)
              VALUES ($1, $2, $3, 1, $4, $4, $5::jsonb)
              RETURNING *
              `,
              [
                order.id,
                item.ticket_type_id,
                seat.id,
                Number(ticketType.price),
                JSON.stringify(attendeeInfo ? [attendeeInfo] : []),
              ],
            );
            orderItems.push({ ...itemResult.rows[0], ticket_type_name: ticketType.name });

            await client.query(
              `
              UPDATE session_seats
              SET status = 'HELD',
                  held_by = $2,
                  held_until = $3,
                  order_id = $4
              WHERE id = $1
                AND (
                  status = 'AVAILABLE'
                  OR (status = 'HELD' AND held_until <= now())
                  OR (status = 'HELD' AND order_id IS NULL)
                )
              `,
              [seat.id, userId, expiredAt, order.id],
            );

            const claimedHold = await client.query(
              `
              UPDATE ticket_holds
              SET order_id = $4, expires_at = $5, updated_at = now()
              WHERE user_id = $1
                AND ticket_type_id = $2
                AND session_seat_id = $3
                AND order_id IS NULL
                AND status = 'ACTIVE'
              RETURNING id
              `,
              [userId, item.ticket_type_id, seat.id, order.id, expiredAt],
            );

            if (!claimedHold.rows[0]) {
              await client.query(
                `
                INSERT INTO ticket_holds (user_id, ticket_type_id, session_seat_id, quantity, order_id, expires_at, status)
                VALUES ($1, $2, $3, 1, $4, $5, 'ACTIVE')
                `,
                [userId, item.ticket_type_id, seat.id, order.id, expiredAt],
              );
            }
          }
        } else {
          const availabilityResult = await client.query(
            `
            SELECT
              COALESCE(SUM(oi.quantity) FILTER (WHERE o.status = 'PAID'), 0)::int AS sold_quantity,
              COALESCE((
                SELECT SUM(th.quantity)::int
                FROM ticket_holds th
                WHERE th.ticket_type_id = $1
                  AND th.status = 'ACTIVE'
                  AND th.expires_at > now()
              ), 0) AS active_hold_quantity
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE oi.ticket_type_id = $1
            `,
            [item.ticket_type_id],
          );

          const sold = Number(availabilityResult.rows[0]?.sold_quantity || 0);
          const held = Number(availabilityResult.rows[0]?.active_hold_quantity || 0);
          const available = Number(ticketType.quantity) - sold - held;
          if (item.quantity > available) {
            throw new AppError('S\u1ed1 l\u01b0\u1ee3ng v\u00e9 c\u00f2n l\u1ea1i kh\u00f4ng \u0111\u1ee7.', 409, ErrorCodes.ORDER_TICKET_UNAVAILABLE);
          }

          const attendeeInfo = [];
          if (requireAttendeeInfo) {
            const queue = attendeeQueues.get(attendeeKey(item.ticket_type_id));
            if (!queue || queue.length < Number(item.quantity)) {
              throw new AppError('Th\u00f4ng tin ng\u01b0\u1eddi tham d\u1ef1 kh\u00f4ng kh\u1edbp v\u1edbi s\u1ed1 l\u01b0\u1ee3ng v\u00e9.', 400, ErrorCodes.INVALID_INPUT);
            }
            attendeeInfo.push(...queue.splice(0, Number(item.quantity)));
          }

          const itemResult = await client.query(
            `
            INSERT INTO order_items (order_id, ticket_type_id, session_seat_id, quantity, unit_price, final_price, attendee_info)
            VALUES ($1, $2, NULL, $3, $4, $5, $6::jsonb)
            RETURNING *
            `,
            [
              order.id,
              item.ticket_type_id,
              item.quantity,
              Number(ticketType.price),
              Number(ticketType.price) * item.quantity,
              JSON.stringify(attendeeInfo),
            ],
          );
          orderItems.push({ ...itemResult.rows[0], ticket_type_name: ticketType.name });

          await client.query(
            `
            INSERT INTO ticket_holds (user_id, ticket_type_id, session_seat_id, quantity, order_id, expires_at, status)
            VALUES ($1, $2, NULL, $3, $4, $5, 'ACTIVE')
            `,
            [userId, item.ticket_type_id, item.quantity, order.id, expiredAt],
          );
        }
      }

      const paymentOrderResult = await client.query(
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
          expired_at
        )
        VALUES ($1, $2, 'ORGANIZER', $3, 'TICKET_ORDER', $1, 'PAYOS', $4, $5, 'VND', $6, 'PENDING', $7)
        RETURNING *
        `,
        [
          order.id,
          firstTicket.organizer_id,
          paymentChannel.id,
          providerOrderCode(),
          totalAmount,
          `EH ${order.order_code}`.slice(0, 25),
          expiredAt,
        ],
      );

      await client.query('COMMIT');

      return {
        event: {
          id: firstTicket.event_id,
          title: firstTicket.event_title,
          slug: firstTicket.event_slug,
        },
        order,
        orderItems,
        paymentOrder: paymentOrderResult.rows[0],
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async cancelOrder(orderId, userId = null) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const params = userId ? [orderId, userId] : [orderId];
      const ownerClause = userId ? 'AND user_id = $2' : '';
      const orderResult = await client.query(
        `
        UPDATE orders
        SET status = 'CANCELLED', updated_at = now()
        WHERE id = $1
          ${ownerClause}
          AND status = 'PENDING'
        RETURNING *
        `,
        params,
      );

      if (!orderResult.rows[0]) {
        await client.query('ROLLBACK');
        return null;
      }

      await client.query(
        `
        UPDATE ticket_holds
        SET status = 'CANCELLED', updated_at = now()
        WHERE order_id = $1 AND status = 'ACTIVE'
        `,
        [orderId],
      );
      await client.query(
        `
        UPDATE session_seats
        SET status = 'AVAILABLE',
            held_by = NULL,
            held_until = NULL,
            order_id = NULL
        WHERE order_id = $1 AND status = 'HELD'
        `,
        [orderId],
      );
      await client.query(
        `
        UPDATE payment_orders
        SET status = 'CANCELLED', updated_at = now()
        WHERE order_id = $1 AND status = 'PENDING'
        `,
        [orderId],
      );

      await client.query('COMMIT');
      return orderResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async findOrderStatus(orderId, userId) {
    const { rows } = await db.query(
      `
      SELECT
        o.*,
        e.id AS event_id,
        e.title AS event_title,
        e.slug AS event_slug,
        po.id AS payment_order_id,
        po.provider_order_code,
        po.checkout_url,
        po.qr_code,
        po.status AS payment_status,
        po.amount AS payment_amount
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN ticket_types tt ON tt.id = oi.ticket_type_id
      LEFT JOIN event_sessions es ON es.id = tt.event_session_id
      LEFT JOIN events e ON e.id = es.event_id
      LEFT JOIN LATERAL (
        SELECT *
        FROM payment_orders po
        WHERE po.order_id = o.id
        ORDER BY po.created_at DESC
        LIMIT 1
      ) po ON true
      WHERE o.id = $1 AND o.user_id = $2
      GROUP BY o.id, e.id, e.title, e.slug, po.id, po.provider_order_code, po.checkout_url, po.qr_code, po.status, po.amount
      LIMIT 1
      `,
      [orderId, userId],
    );
    const order = rows[0];
    if (!order) return null;

    const itemsResult = await db.query(
      `
      SELECT
        oi.id,
        oi.ticket_type_id,
        oi.session_seat_id,
        oi.quantity,
        oi.unit_price,
        oi.final_price,
        t.id AS ticket_id,
        t.ticket_code,
        t.status AS ticket_status,
        tt.name AS ticket_type_name,
        ss.id AS session_seat_id,
        s.row_label,
        s.seat_number
      FROM order_items oi
      JOIN ticket_types tt ON tt.id = oi.ticket_type_id
      LEFT JOIN tickets t ON t.order_item_id = oi.id
      LEFT JOIN session_seats ss ON ss.id = oi.session_seat_id
      LEFT JOIN seats s ON s.id = ss.seat_id
      WHERE oi.order_id = $1
      ORDER BY oi.id ASC
      `,
      [orderId],
    );

    return { order, items: itemsResult.rows };
  }

  async confirmPayment({ providerOrderCode, amount, transactionId, rawPayload }) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const paymentResult = await client.query(
        `
        SELECT *
        FROM payment_orders
        WHERE provider_order_code = $1
        FOR UPDATE
        `,
        [providerOrderCode],
      );
      const paymentOrder = paymentResult.rows[0];
      if (!paymentOrder) {
        throw new AppError('Kh\u00f4ng t\u00ecm th\u1ea5y \u0111\u01a1n thanh to\u00e1n.', 404, ErrorCodes.RESOURCE_NOT_FOUND);
      }

      if (paymentOrder.status === 'PAID') {
        await client.query('COMMIT');
        return { alreadyPaid: true, orderId: paymentOrder.order_id };
      }

      if (Number(paymentOrder.amount) !== Number(amount)) {
        throw new AppError('S\u1ed1 ti\u1ec1n thanh to\u00e1n kh\u00f4ng h\u1ee3p l\u1ec7.', 400, ErrorCodes.INVALID_INPUT);
      }

      const orderResult = await client.query(
        'SELECT * FROM orders WHERE id = $1 FOR UPDATE',
        [paymentOrder.order_id],
      );
      const order = orderResult.rows[0];
      if (!order) {
        throw new AppError('Kh\u00f4ng t\u00ecm th\u1ea5y \u0111\u01a1n h\u00e0ng.', 404, ErrorCodes.ORDER_NOT_FOUND);
      }

      if (order.status !== 'PENDING') {
        throw new AppError('Kh\u00f4ng th\u1ec3 x\u00e1c nh\u1eadn \u0111\u01a1n h\u00e0ng.', 400, ErrorCodes.INVALID_INPUT);
      }

      if (order.expired_at && new Date(order.expired_at).getTime() <= Date.now()) {
        await client.query(
          `
          UPDATE orders
          SET status = 'EXPIRED', updated_at = now()
          WHERE id = $1 AND status = 'PENDING'
          `,
          [order.id],
        );
        await client.query(
          `
          UPDATE payment_orders
          SET status = 'EXPIRED', updated_at = now()
          WHERE id = $1 AND status = 'PENDING'
          `,
          [paymentOrder.id],
        );
        await client.query(
          `
          UPDATE ticket_holds
          SET status = 'EXPIRED', updated_at = now()
          WHERE order_id = $1 AND status = 'ACTIVE'
          `,
          [order.id],
        );
        await client.query(
          `
          UPDATE session_seats
          SET status = 'AVAILABLE', held_by = NULL, held_until = NULL, order_id = NULL
          WHERE order_id = $1 AND status = 'HELD'
          `,
          [order.id],
        );
        throw new AppError('Th\u1eddi gian gi\u1eef \u0111\u01a1n h\u00e0ng \u0111\u00e3 h\u1ebft.', 400, ErrorCodes.ORDER_TICKET_UNAVAILABLE);
      }

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
        VALUES ($1, 'PAYOS', $2, $3, 'PAID', $4::jsonb)
        `,
        [paymentOrder.id, transactionId || String(providerOrderCode), amount, JSON.stringify(rawPayload || {})],
      );

      await client.query(
        `
        UPDATE payment_orders
        SET status = 'PAID', paid_at = now(), updated_at = now()
        WHERE id = $1
        `,
        [paymentOrder.id],
      );
      await client.query(
        `
        UPDATE orders
        SET status = 'PAID', updated_at = now()
        WHERE id = $1
        `,
        [order.id],
      );
      await client.query(
        `
        UPDATE ticket_holds
        SET status = 'CONFIRMED', updated_at = now()
        WHERE order_id = $1
          AND status IN ('ACTIVE', 'EXPIRED')
        `,
        [order.id],
      );
      await client.query(
        `
        UPDATE session_seats
        SET status = 'SOLD',
            held_until = NULL
        WHERE order_id = $1
          AND status IN ('HELD', 'AVAILABLE')
        `,
        [order.id],
      );

      if (order.promo_code_id) {
        await client.query(
          `
          INSERT INTO promo_code_usages (promo_code_id, user_id, order_id)
          VALUES ($1, $2, $3)
          ON CONFLICT DO NOTHING
          `,
          [order.promo_code_id, order.user_id, order.id],
        );
        await client.query(
          `
          UPDATE promo_codes
          SET used_count = used_count + 1
          WHERE id = $1
          `,
          [order.promo_code_id],
        );
      }

      await this.ensureRequireAttendeeInfoColumn(client);

      const itemResult = await client.query(
        `
        SELECT
          oi.*,
          tt.event_session_id,
          es.event_id,
          e.require_attendee_info,
          t.id AS existing_ticket_id
        FROM order_items oi
        JOIN ticket_types tt ON tt.id = oi.ticket_type_id
        JOIN event_sessions es ON es.id = tt.event_session_id
        JOIN events e ON e.id = es.event_id
        LEFT JOIN tickets t ON t.order_item_id = oi.id
        WHERE oi.order_id = $1
        ORDER BY oi.id
        `,
        [order.id],
      );

      const issuedTickets = [];
      for (const item of itemResult.rows) {
        if (item.existing_ticket_id) continue;

        const quantity = item.session_seat_id ? 1 : Number(item.quantity);
        const attendeeInfo = Array.isArray(item.attendee_info) ? item.attendee_info : [];
        for (let index = 0; index < quantity; index += 1) {
          const attendee = item.require_attendee_info ? attendeeInfo[index] : null;
          const code = ticketCode();
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
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'VALID')
            RETURNING id, ticket_code, status, created_at
            `,
            [
              item.id,
              item.event_id,
              item.event_session_id,
              item.ticket_type_id,
              item.session_seat_id,
              code,
              code,
              attendee?.name || null,
              attendee?.email || null,
            ],
          );
          issuedTickets.push(ticketResult.rows[0]);
        }
      }

      await client.query('COMMIT');
      return { order, issuedTickets };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = new OrdersRepository();
