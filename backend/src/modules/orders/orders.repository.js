const crypto = require('crypto');
const db = require('../../infrastructure/database/db.client');
const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const promotionsRepository = require('../promotions/promotions.repository');
const { validateSelectedSeats } = require('../events/seatingRules');

const HOLD_MINUTES = Number(process.env.TICKET_HOLD_MINUTES || 15);

function orderCode() {
  return `ORD-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

function providerOrderCode() {
  return Number(`${Date.now()}${crypto.randomInt(100, 1000)}`);
}

function ticketCode() {
  return `EH-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

function userIsAdmin(roles = []) {
  return roles.some((role) => ['ADMIN', 'SUPER_ADMIN'].includes(String(role).toUpperCase()));
}

async function ensureStaffDirectBookingSchema(client) {
  await client.query(`
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS created_by_staff_id UUID REFERENCES users(id),
      ADD COLUMN IF NOT EXISTS created_by_staff_name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS created_by_role VARCHAR(40),
      ADD COLUMN IF NOT EXISTS payment_method VARCHAR(40),
      ADD COLUMN IF NOT EXISTS internal_note TEXT,
      ADD COLUMN IF NOT EXISTS booking_source VARCHAR(40)
  `);
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

      if (paymentChannel && firstTicket.organizer_id !== paymentChannel.organizer_id) {
        throw new AppError('K\u00eanh thanh to\u00e1n c\u1ee7a ban t\u1ed5 ch\u1ee9c kh\u00f4ng h\u1ee3p l\u1ec7.', 400, ErrorCodes.ORDER_INVALID_ITEMS);
      }


      const totalRequested = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

      const requireAttendeeInfo = Boolean(firstTicket.require_attendee_info);
      if (requireAttendeeInfo && attendees.length !== totalRequested) {
        throw new AppError('Vui l\u00f2ng nh\u1eadp \u0111\u1ee7 th\u00f4ng tin ng\u01b0\u1eddi tham d\u1ef1 cho t\u1eebng v\u00e9.', 400, ErrorCodes.INVALID_INPUT);
      }
      const attendeeQueues = requireAttendeeInfo ? buildAttendeeQueues(attendees) : new Map();

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
        const sessionStart = ticketType.session_start_time ? new Date(ticketType.session_start_time).getTime() : null;
        if (sessionStart && sessionStart <= now) {
          throw new AppError('Su\u1ea5t di\u1ec5n \u0111\u00e3 k\u1ebft th\u00fac, kh\u00f4ng th\u1ec3 b\u00e1n v\u00e9.', 400, ErrorCodes.ORDER_TICKET_SALE_CLOSED);
        }

        const saleStart = ticketType.sale_start ? new Date(ticketType.sale_start).getTime() : null;
        const saleEnd = ticketType.sale_end ? new Date(ticketType.sale_end).getTime() : null;
        if ((saleStart && saleStart > now) || (saleEnd && saleEnd < now)) {
          throw new AppError(`V\u00e9 "${ticketType.name}" hi\u1ec7n ch\u01b0a m\u1edf b\u00e1n ho\u1eb7c \u0111\u00e3 ng\u1eebng b\u00e1n.`, 400, ErrorCodes.ORDER_TICKET_SALE_CLOSED);
        }

        if (ticketType.max_per_order && item.quantity > Number(ticketType.max_per_order)) {
          throw new AppError(`B\u1ea1n ch\u1ec9 \u0111\u01b0\u1ee3c mua t\u1ed1i \u0111a ${Number(ticketType.max_per_order)} v\u00e9 cho lo\u1ea1i v\u00e9 n\u00e0y trong m\u1ed9t \u0111\u01a1n h\u00e0ng.`, 400, ErrorCodes.ORDER_INVALID_ITEMS);
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
              seat.held_until &&
              new Date(seat.held_until).getTime() > Date.now() &&
              (seat.order_id || String(seat.held_by) !== String(userId));
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
        VALUES ($1, $2, 'ORGANIZER', $3, 'TICKET_ORDER', $1, $4, $5, $6, 'VND', $7, 'PENDING', $8)
        RETURNING *
        `,
        [
          order.id,
          firstTicket.organizer_id,
          paymentChannel?.id || null,
          paymentChannel ? 'PAYOS' : 'MANUAL',
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

  async findStaffDirectBookingEvents({ staffId, roles = [] }) {
    const isAdmin = userIsAdmin(roles);
    const { rows } = await db.query(
      `
      WITH ticket_inventory AS (
        SELECT
          tt.id,
          tt.event_session_id,
          tt.name,
          tt.description,
          tt.price,
          tt.quantity,
          tt.max_per_order,
          tt.sale_start,
          tt.sale_end,
          tt.is_seated,
          COALESCE(SUM(oi.quantity) FILTER (WHERE o.status = 'PAID'), 0)::int AS sold_quantity,
          COALESCE((
            SELECT SUM(th.quantity)::int
            FROM ticket_holds th
            WHERE th.ticket_type_id = tt.id
              AND th.status = 'ACTIVE'
              AND th.expires_at > now()
          ), 0) AS active_hold_quantity
        FROM ticket_types tt
        LEFT JOIN order_items oi ON oi.ticket_type_id = tt.id
        LEFT JOIN orders o ON o.id = oi.order_id
        GROUP BY tt.id
      )
      SELECT
        e.id AS event_id,
        e.title AS event_title,
        e.slug AS event_slug,
        e.banner_url,
        e.thumbnail_url,
        e.start_time AS event_start_time,
        e.end_time AS event_end_time,
        es.id AS session_id,
        es.session_name,
        es.start_time AS session_start_time,
        es.end_time AS session_end_time,
        v.name AS venue_name,
        v.address_line,
        v.ward,
        v.district,
        v.city,
        ti.id AS ticket_type_id,
        ti.name AS ticket_type_name,
        ti.description AS ticket_type_description,
        ti.price,
        ti.quantity,
        ti.max_per_order,
        ti.sale_start,
        ti.sale_end,
        ti.is_seated,
        GREATEST(ti.quantity - ti.sold_quantity - ti.active_hold_quantity, 0)::int AS available_quantity
      FROM ticket_inventory ti
      JOIN event_sessions es ON es.id = ti.event_session_id
      JOIN events e ON e.id = es.event_id
      LEFT JOIN venues v ON v.id = es.venue_id
      WHERE e.status = 'PUBLISHED'
        AND e.visibility = 'PUBLIC'
        AND e.approval_status = 'APPROVED'
        AND e.deleted_at IS NULL
        AND e.end_time >= now()
        AND es.status = 'UPCOMING'
        AND es.start_time > now()
        AND (ti.sale_start IS NULL OR ti.sale_start <= now())
        AND (ti.sale_end IS NULL OR ti.sale_end >= now())
        AND GREATEST(ti.quantity - ti.sold_quantity - ti.active_hold_quantity, 0) > 0
        AND (
          $2::boolean = true
          OR EXISTS (
            SELECT 1
            FROM event_staffs scope
            WHERE scope.event_id = e.id
              AND scope.staff_id = $1
          )
        )
      ORDER BY e.start_time ASC, es.start_time ASC, ti.price ASC
      `,
      [staffId, isAdmin],
    );

    const events = new Map();
    for (const row of rows) {
      if (!events.has(row.event_id)) {
        events.set(row.event_id, {
          id: row.event_id,
          title: row.event_title,
          slug: row.event_slug,
          banner_url: row.banner_url,
          thumbnail_url: row.thumbnail_url,
          start_time: row.event_start_time,
          end_time: row.event_end_time,
          sessions: [],
          ticket_types: [],
        });
      }

      const event = events.get(row.event_id);
      if (!event.sessions.some((session) => session.id === row.session_id)) {
        event.sessions.push({
          id: row.session_id,
          session_name: row.session_name,
          start_time: row.session_start_time,
          end_time: row.session_end_time,
          venue: {
            name: row.venue_name,
            address_line: row.address_line,
            district: row.district,
            city: row.city,
          },
        });
      }

      event.ticket_types.push({
        id: row.ticket_type_id,
        event_session_id: row.session_id,
        name: row.ticket_type_name,
        description: row.ticket_type_description,
        price: row.price,
        quantity: row.quantity,
        max_per_order: row.max_per_order,
        sale_start: row.sale_start,
        sale_end: row.sale_end,
        is_seated: row.is_seated,
        available_quantity: row.available_quantity,
      });
    }

    return [...events.values()];
  }

  async createStaffDirectBooking({ staffId, staffRoles = [], buyer, paymentMethod, internalNote, eventId, items }) {
    const client = await db.getClient();
    const isAdmin = userIsAdmin(staffRoles);

    try {
      await client.query('BEGIN');
      await ensureStaffDirectBookingSchema(client);

      const staffResult = await client.query(
        'SELECT id, full_name, email FROM users WHERE id = $1 AND deleted_at IS NULL',
        [staffId],
      );
      const staff = staffResult.rows[0];
      if (!staff) {
        throw new AppError('Không tìm thấy tài khoản nhân sự.', 403, ErrorCodes.AUTH_FORBIDDEN);
      }

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
          es.venue_id,
          e.id AS event_id,
          e.title AS event_title,
          e.slug AS event_slug,
          e.banner_url,
          e.thumbnail_url,
          e.start_time AS event_start_time,
          e.end_time AS event_end_time,
          e.organizer_id,
          e.status AS event_status,
          e.visibility,
          e.approval_status,
          e.deleted_at,
          v.name AS venue_name,
          v.address_line,
          v.ward,
          v.district,
          v.city,
          CONCAT_WS('', s.row_label, s.seat_number) AS seat_label
        FROM ticket_types tt
        JOIN event_sessions es ON es.id = tt.event_session_id
        JOIN events e ON e.id = es.event_id
        LEFT JOIN venues v ON v.id = es.venue_id
        WHERE tt.id = ANY($1::uuid[])
        FOR UPDATE OF tt
        `,
        [ticketTypeIds],
      );

      if (ticketTypesResult.rows.length !== ticketTypeIds.length) {
        throw new AppError('Thông tin vé không hợp lệ.', 400, ErrorCodes.ORDER_INVALID_ITEMS);
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
        throw new AppError('Sự kiện hiện không khả dụng để book vé trực tiếp.', 400, ErrorCodes.ORDER_INVALID_ITEMS);
      }

      if (!isAdmin) {
        const scopeResult = await client.query(
          `
          SELECT 1
          FROM event_staffs es
          JOIN events e ON e.id = es.event_id
          WHERE es.event_id = $1
            AND es.staff_id = $2
            AND e.deleted_at IS NULL
            AND e.status = 'PUBLISHED'
            AND e.approval_status = 'APPROVED'
            AND COALESCE(e.end_time, e.start_time) >= now()
          LIMIT 1
          `,
          [eventId, staffId],
        );
        if (!scopeResult.rows[0]) {
          throw new AppError('Bạn không còn quyền staff cho sự kiện này hoặc sự kiện đã kết thúc.', 403, ErrorCodes.AUTH_FORBIDDEN);
        }
      }

      const eventEnd = firstTicket.event_end_time ? new Date(firstTicket.event_end_time).getTime() : null;
      if (eventEnd && eventEnd < Date.now()) {
        throw new AppError('Sự kiện đã kết thúc, không thể bán vé.', 400, ErrorCodes.ORDER_TICKET_SALE_CLOSED);
      }

      const totalRequested = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      if (totalRequested > 20) {
        throw new AppError('Mỗi booking trực tiếp chỉ được tạo tối đa 20 vé.', 400, ErrorCodes.ORDER_INVALID_ITEMS);
      }

      const subtotal = items.reduce((sum, item) => {
        const ticketType = ticketTypeMap.get(item.ticket_type_id);
        return sum + Number(ticketType?.price || 0) * Number(item.quantity || 0);
      }, 0);

      const orderResult = await client.query(
        `
        INSERT INTO orders (
          user_id,
          organizer_id,
          buyer_name,
          buyer_email,
          buyer_phone,
          created_by_staff_id,
          created_by_staff_name,
          created_by_role,
          payment_method,
          internal_note,
          booking_source,
          order_channel,
          order_code,
          status,
          subtotal,
          discount_amount,
          platform_fee,
          total_amount,
          expired_at
        )
        VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, $8, $9, 'staff_direct', 'OFFLINE', $10, 'PAID', $11, 0, 0, $11, NULL)
        RETURNING *
        `,
        [
          firstTicket.organizer_id,
          buyer.name,
          buyer.email || null,
          buyer.phone,
          staffId,
          staff.full_name,
          isAdmin ? 'admin' : 'staff',
          paymentMethod,
          internalNote || null,
          orderCode(),
          subtotal,
        ],
      );
      const order = orderResult.rows[0];
      const orderItems = [];

      for (const item of items) {
        const ticketType = ticketTypeMap.get(item.ticket_type_id);
        if (!ticketType || ticketType.event_id !== eventId) {
          throw new AppError('Loại vé không thuộc sự kiện này.', 400, ErrorCodes.ORDER_INVALID_ITEMS);
        }
        if (ticketType.session_status !== 'UPCOMING') {
          throw new AppError('Suất diễn hiện không khả dụng để đặt vé.', 400, ErrorCodes.ORDER_INVALID_ITEMS);
        }

        const now = Date.now();
        const sessionStart = ticketType.session_start_time ? new Date(ticketType.session_start_time).getTime() : null;
        if (sessionStart && sessionStart <= now) {
          throw new AppError('Suất diễn đã kết thúc, không thể bán vé.', 400, ErrorCodes.ORDER_TICKET_SALE_CLOSED);
        }

        const saleStart = ticketType.sale_start ? new Date(ticketType.sale_start).getTime() : null;
        const saleEnd = ticketType.sale_end ? new Date(ticketType.sale_end).getTime() : null;
        if ((saleStart && saleStart > now) || (saleEnd && saleEnd < now)) {
          throw new AppError(`Vé "${ticketType.name}" hiện chưa mở bán hoặc đã ngừng bán.`, 400, ErrorCodes.ORDER_TICKET_SALE_CLOSED);
        }

        if (ticketType.is_seated) {
          throw new AppError('Book vé trực tiếp hiện chưa hỗ trợ loại vé chọn ghế.', 400, ErrorCodes.ORDER_INVALID_ITEMS);
        }

        const maxPerOrder = Math.min(Number(ticketType.max_per_order || 20), 20);
        if (Number(item.quantity) > maxPerOrder) {
          throw new AppError(`Loại vé "${ticketType.name}" chỉ được chọn tối đa ${maxPerOrder} vé.`, 400, ErrorCodes.ORDER_INVALID_ITEMS);
        }

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
        if (Number(item.quantity) > available) {
          throw new AppError('Số lượng vé còn lại không đủ.', 409, ErrorCodes.ORDER_TICKET_UNAVAILABLE);
        }

        const itemResult = await client.query(
          `
          INSERT INTO order_items (order_id, ticket_type_id, session_seat_id, quantity, unit_price, final_price)
          VALUES ($1, $2, NULL, $3, $4, $5)
          RETURNING *
          `,
          [
            order.id,
            item.ticket_type_id,
            Number(item.quantity),
            Number(ticketType.price),
            Number(ticketType.price) * Number(item.quantity),
          ],
        );
        const orderItem = itemResult.rows[0];
        orderItems.push({ ...orderItem, ticket_type_name: ticketType.name });

        for (let index = 0; index < Number(item.quantity); index += 1) {
          const code = ticketCode();
          await client.query(
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
            VALUES ($1, $2, $3, $4, NULL, $5::varchar(100), $6::text, $7, $8, 'VALID')
            `,
            [
              orderItem.id,
              ticketType.event_id,
              ticketType.event_session_id,
              ticketType.id,
              code,
              code,
              buyer.name,
              buyer.email || null,
            ],
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
          paid_at
        )
        VALUES ($1, $2, 'ORGANIZER', NULL, 'TICKET_ORDER', $1, 'MANUAL', $3, $4, 'VND', $5, 'PAID', now())
        RETURNING *
        `,
        [order.id, firstTicket.organizer_id, providerOrderCode(), subtotal, `Direct ${order.order_code}`.slice(0, 25)],
      );
      const paymentOrder = paymentOrderResult.rows[0];

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
        VALUES ($1, 'MANUAL', $2, $3, 'PAID', $4::jsonb)
        `,
        [
          paymentOrder.id,
          `${paymentMethod}-${order.order_code}`,
          subtotal,
          JSON.stringify({
            bookingSource: 'staff_direct',
            paymentMethod,
            staffId,
            staffName: staff.full_name,
            internalNote: internalNote || null,
          }),
        ],
      );

      const ticketsResult = await client.query(
        `
        SELECT
          t.id,
          t.ticket_code,
          t.qr_code,
          t.status,
          t.attendee_name,
          t.attendee_email,
          t.created_at,
          tt.name AS ticket_type_name,
          tt.price AS ticket_type_price,
          es.start_time AS session_start_time,
          es.end_time AS session_end_time,
          es.session_name,
          e.id AS event_id,
          e.title AS event_title,
          e.banner_url,
          e.thumbnail_url,
          v.name AS venue_name,
          v.address_line,
          v.ward,
          v.district,
          v.city
        FROM tickets t
        JOIN ticket_types tt ON tt.id = t.ticket_type_id
        JOIN event_sessions es ON es.id = t.event_session_id
        JOIN events e ON e.id = t.event_id
        LEFT JOIN venues v ON v.id = es.venue_id
        JOIN order_items oi ON oi.id = t.order_item_id
        LEFT JOIN session_seats ss ON ss.id = COALESCE(t.session_seat_id, oi.session_seat_id)
        LEFT JOIN seats s ON s.id = ss.seat_id
        WHERE oi.order_id = $1
        ORDER BY t.created_at ASC
        `,
        [order.id],
      );

      await client.query('COMMIT');

      return {
        order,
        paymentOrder,
        staff,
        event: {
          id: firstTicket.event_id,
          title: firstTicket.event_title,
          slug: firstTicket.event_slug,
          banner_url: firstTicket.banner_url,
          thumbnail_url: firstTicket.thumbnail_url,
          start_time: firstTicket.event_start_time,
          end_time: firstTicket.event_end_time,
          venue: {
            name: firstTicket.venue_name,
            address_line: firstTicket.address_line,
            district: firstTicket.district,
            city: firstTicket.city,
          },
        },
        items: orderItems,
        tickets: ticketsResult.rows,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async attachStaffDirectBookingMetadata({ orderId, staffId, staffRoles = [], paymentMethod, internalNote }) {
    const client = await db.getClient();
    const isAdmin = userIsAdmin(staffRoles);

    try {
      await client.query('BEGIN');
      await ensureStaffDirectBookingSchema(client);

      const staffResult = await client.query(
        'SELECT id, full_name, email FROM users WHERE id = $1 AND deleted_at IS NULL',
        [staffId],
      );
      const staff = staffResult.rows[0];
      if (!staff) {
        throw new AppError('Không tìm thấy tài khoản nhân sự.', 403, ErrorCodes.AUTH_FORBIDDEN);
      }

      const eventResult = await client.query(
        `
        SELECT DISTINCT es.event_id
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        JOIN ticket_types tt ON tt.id = oi.ticket_type_id
        JOIN event_sessions es ON es.id = tt.event_session_id
        WHERE o.id = $1
        LIMIT 1
        `,
        [orderId],
      );
      const eventId = eventResult.rows[0]?.event_id;
      if (!eventId) {
        throw new AppError('Không tìm thấy booking trực tiếp.', 404, ErrorCodes.ORDER_NOT_FOUND);
      }

      if (!isAdmin) {
        const scopeResult = await client.query(
          `
          SELECT 1
          FROM event_staffs es
          JOIN events e ON e.id = es.event_id
          WHERE es.event_id = $1
            AND es.staff_id = $2
            AND e.deleted_at IS NULL
            AND e.status = 'PUBLISHED'
            AND e.approval_status = 'APPROVED'
            AND COALESCE(e.end_time, e.start_time) >= now()
          LIMIT 1
          `,
          [eventId, staffId],
        );
        if (!scopeResult.rows[0]) {
          throw new AppError('Bạn không còn quyền staff cho sự kiện này hoặc sự kiện đã kết thúc.', 403, ErrorCodes.AUTH_FORBIDDEN);
        }
      }

      await client.query(
        `
        UPDATE orders
        SET user_id = NULL,
            created_by_staff_id = $2,
            created_by_staff_name = $3,
            created_by_role = $4,
            payment_method = $5,
            internal_note = $6,
            booking_source = 'staff_direct',
            order_channel = 'OFFLINE',
            updated_at = now()
        WHERE id = $1
        `,
        [orderId, staffId, staff.full_name, isAdmin ? 'admin' : 'staff', paymentMethod, internalNote || null],
      );

      await client.query('COMMIT');
      return { staff, eventId };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async findStaffDirectBookingStatus({ orderId, staffId, roles = [] }) {
    const isAdmin = userIsAdmin(roles);
    const orderResult = await db.query(
      `
      SELECT
        o.*,
        po.id AS payment_order_id,
        po.provider AS payment_provider,
        po.provider_order_code,
        po.checkout_url,
        po.qr_code AS payment_qr_code,
        po.status AS payment_status,
        po.amount AS payment_amount,
        po.paid_at,
        e.id AS event_id,
        e.title AS event_title,
        e.slug AS event_slug,
        e.banner_url,
        e.thumbnail_url,
        e.start_time AS event_start_time,
        e.end_time AS event_end_time,
        v.name AS venue_name,
        v.address_line,
        v.ward,
        v.district,
        v.city,
        u.full_name AS staff_full_name,
        u.email AS staff_email
      FROM orders o
      JOIN order_items first_item ON first_item.order_id = o.id
      JOIN ticket_types first_tt ON first_tt.id = first_item.ticket_type_id
      JOIN event_sessions es ON es.id = first_tt.event_session_id
      JOIN events e ON e.id = es.event_id
      LEFT JOIN venues v ON v.id = es.venue_id
      LEFT JOIN users u ON u.id = o.created_by_staff_id
      LEFT JOIN LATERAL (
        SELECT *
        FROM payment_orders po_latest
        WHERE po_latest.order_id = o.id
        ORDER BY po_latest.created_at DESC
        LIMIT 1
      ) po ON true
      WHERE o.id = $1
        AND o.booking_source = 'staff_direct'
        AND (
          $3::boolean = true
          OR o.created_by_staff_id = $2
          OR EXISTS (
            SELECT 1
            FROM event_staffs scope
            JOIN events scoped_event ON scoped_event.id = scope.event_id
            WHERE scope.event_id = e.id
              AND scope.staff_id = $2
              AND scoped_event.deleted_at IS NULL
              AND scoped_event.status = 'PUBLISHED'
              AND scoped_event.approval_status = 'APPROVED'
              AND COALESCE(scoped_event.end_time, scoped_event.start_time) >= now()
          )
        )
      LIMIT 1
      `,
      [orderId, staffId, isAdmin],
    );
    const order = orderResult.rows[0];
    if (!order) return null;

    const itemsResult = await db.query(
      `
      SELECT
        oi.*,
        tt.name AS ticket_type_name
      FROM order_items oi
      JOIN ticket_types tt ON tt.id = oi.ticket_type_id
      WHERE oi.order_id = $1
      ORDER BY oi.id
      `,
      [orderId],
    );

    const ticketsResult = await db.query(
      `
      SELECT
        t.id,
        t.ticket_code,
        t.qr_code,
        t.status,
        t.attendee_name,
        t.attendee_email,
        t.created_at,
        tt.name AS ticket_type_name,
        tt.price AS ticket_type_price,
        es.start_time AS session_start_time,
        es.end_time AS session_end_time,
        es.session_name,
        e.id AS event_id,
        e.title AS event_title,
        e.banner_url,
        e.thumbnail_url,
        v.name AS venue_name,
        v.address_line,
        v.ward,
        v.district,
        v.city,
        CONCAT_WS('', s.row_label, s.seat_number) AS seat_label
      FROM tickets t
      JOIN ticket_types tt ON tt.id = t.ticket_type_id
      JOIN event_sessions es ON es.id = t.event_session_id
      JOIN events e ON e.id = t.event_id
      LEFT JOIN venues v ON v.id = es.venue_id
      JOIN order_items oi ON oi.id = t.order_item_id
      LEFT JOIN session_seats ss ON ss.id = COALESCE(t.session_seat_id, oi.session_seat_id)
      LEFT JOIN seats s ON s.id = ss.seat_id
      WHERE oi.order_id = $1
      ORDER BY t.created_at ASC
      `,
      [orderId],
    );

    return {
      order,
      paymentOrder: {
        id: order.payment_order_id,
        provider: order.payment_provider,
        provider_order_code: order.provider_order_code,
        checkout_url: order.checkout_url,
        qr_code: order.payment_qr_code,
        status: order.payment_status,
        amount: order.payment_amount,
        paid_at: order.paid_at,
      },
      staff: {
        id: order.created_by_staff_id,
        full_name: order.created_by_staff_name || order.staff_full_name,
        email: order.staff_email,
      },
      event: {
        id: order.event_id,
        title: order.event_title,
        slug: order.event_slug,
        banner_url: order.banner_url,
        thumbnail_url: order.thumbnail_url,
        start_time: order.event_start_time,
        end_time: order.event_end_time,
        venue: {
          name: order.venue_name,
          address_line: order.address_line,
          district: order.district,
          city: order.city,
        },
      },
      items: itemsResult.rows,
      tickets: ticketsResult.rows,
    };
  }

  async confirmStaffDirectManualPayment({ orderId, paymentMethod, staffId, rawPayload = {} }) {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      const orderResult = await client.query(
        `
        SELECT o.*
        FROM orders o
        WHERE o.id = $1
          AND o.booking_source = 'staff_direct'
          AND o.status = 'PENDING'
        FOR UPDATE
        `,
        [orderId],
      );
      const order = orderResult.rows[0];
      if (!order) {
        throw new AppError('Không tìm thấy booking trực tiếp đang chờ thanh toán.', 404, ErrorCodes.ORDER_NOT_FOUND);
      }

      const paymentResult = await client.query(
        `
        SELECT *
        FROM payment_orders
        WHERE order_id = $1
          AND status = 'PENDING'
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE
        `,
        [orderId],
      );
      const paymentOrder = paymentResult.rows[0];
      if (!paymentOrder) {
        throw new AppError('Không tìm thấy giao dịch đang chờ thanh toán.', 404, ErrorCodes.ORDER_NOT_FOUND);
      }

      await client.query(
        `
        UPDATE payment_orders
        SET provider = 'MANUAL',
            status = 'PAID',
            paid_at = now(),
            updated_at = now()
        WHERE id = $1
        `,
        [paymentOrder.id],
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
        VALUES ($1, 'MANUAL', $2, $3, 'PAID', $4::jsonb)
        `,
        [
          paymentOrder.id,
          `${paymentMethod}-${order.order_code}`,
          Number(paymentOrder.amount || order.total_amount || 0),
          JSON.stringify({
            ...rawPayload,
            bookingSource: 'staff_direct',
            paymentMethod,
            staffId,
          }),
        ],
      );

      await client.query(
        `
        UPDATE orders
        SET status = 'PAID',
            payment_method = $2,
            updated_at = now()
        WHERE id = $1
        `,
        [orderId, paymentMethod],
      );

      await client.query(
        `
        UPDATE ticket_holds
        SET status = 'CONFIRMED', updated_at = now()
        WHERE order_id = $1
          AND status IN ('ACTIVE', 'EXPIRED')
        `,
        [orderId],
      );

      await client.query(
        `
        UPDATE session_seats
        SET status = 'SOLD',
            held_until = NULL
        WHERE order_id = $1
          AND status IN ('HELD', 'AVAILABLE')
        `,
        [orderId],
      );

      const itemResult = await client.query(
        `
        SELECT
          oi.*,
          tt.event_session_id,
          es.event_id,
          t.id AS existing_ticket_id
        FROM order_items oi
        JOIN ticket_types tt ON tt.id = oi.ticket_type_id
        JOIN event_sessions es ON es.id = tt.event_session_id
        LEFT JOIN tickets t ON t.order_item_id = oi.id
        WHERE oi.order_id = $1
        ORDER BY oi.id
        `,
        [orderId],
      );

      for (const item of itemResult.rows) {
        if (item.existing_ticket_id) continue;

        const quantity = item.session_seat_id ? 1 : Number(item.quantity);
        for (let index = 0; index < quantity; index += 1) {
          const code = ticketCode();
          await client.query(
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
            VALUES ($1, $2, $3, $4, $5, $6::varchar(100), $7::text, $8, $9, 'VALID')
            `,
            [
              item.id,
              item.event_id,
              item.event_session_id,
              item.ticket_type_id,
              item.session_seat_id,
              code,
              code,
              order.buyer_name,
              order.buyer_email,
            ],
          );
        }
      }

      await client.query('COMMIT');
      return { orderId };
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

  async findPaidOrderEmailDetails(orderId) {
    const { rows } = await db.query(
      `SELECT o.id, o.order_code, o.buyer_name, o.buyer_email, o.subtotal, o.discount_amount,
        o.platform_fee, o.total_amount, event_info.title AS event_title,
        event_info.banner_url, event_info.thumbnail_url,
        po.paid_at, COALESCE(pt.provider_transaction_id, po.provider_order_code::text) AS transaction_code
      FROM orders o
      JOIN LATERAL (
        SELECT e.id, e.title, e.banner_url, e.thumbnail_url
        FROM order_items oi
        JOIN ticket_types tt ON tt.id = oi.ticket_type_id
        JOIN event_sessions es ON es.id = tt.event_session_id
        JOIN events e ON e.id = es.event_id
        WHERE oi.order_id = o.id
        ORDER BY oi.id
        LIMIT 1
      ) event_info ON true
      JOIN payment_orders po ON po.order_id = o.id AND po.status = 'PAID'
      LEFT JOIN LATERAL (SELECT provider_transaction_id FROM payment_transactions
        WHERE payment_order_id = po.id AND status = 'PAID' ORDER BY created_at DESC LIMIT 1) pt ON true
      WHERE o.id = $1 AND o.status = 'PAID' ORDER BY po.paid_at DESC NULLS LAST LIMIT 1`,
      [orderId],
    );
    const order = rows[0];
    if (!order) return null;
    const ticketResult = await db.query(
      `SELECT t.id, t.ticket_code, t.qr_code, t.attendee_name, t.event_id, t.event_session_id,
        tt.name AS ticket_type_name, es.session_name, es.start_time AS session_start_time,
        v.name AS venue_name, v.address_line, v.ward, v.district, v.city,
        CONCAT_WS('', s.row_label, s.seat_number) AS seat_label
      FROM tickets t JOIN order_items oi ON oi.id = t.order_item_id
      JOIN ticket_types tt ON tt.id = t.ticket_type_id JOIN event_sessions es ON es.id = t.event_session_id
      JOIN venues v ON v.id = es.venue_id LEFT JOIN session_seats ss ON ss.id = COALESCE(t.session_seat_id, oi.session_seat_id)
      LEFT JOIN seats s ON s.id = ss.seat_id WHERE oi.order_id = $1 ORDER BY t.created_at, t.id`,
      [orderId],
    );
    return { order, tickets: ticketResult.rows };
  }
}

module.exports = new OrdersRepository();
