const crypto = require('crypto');
const db = require('../../infrastructure/database/db.client');
const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const promotionsRepository = require('../promotions/promotions.repository');
const { validateSelectedSeats } = require('../events/seatingRules');
const fieldCrypto = require('../../core/security/fieldCrypto');
const { COMPLETED_ORDER_STATUSES, TICKET_SOURCES } = require('./orders.constants');

function validateIdempotencyPayload(existingOrder, { userId, eventId, promoCode, items }) {
  if (existingOrder.user_id && existingOrder.user_id !== userId) {
    throw new AppError('Khóa Idempotency không thuộc về tài khoản này.', 403, ErrorCodes.AUTH_FORBIDDEN);
  }

  const orderEventId = existingOrder.event_info?.id;
  if (orderEventId && orderEventId !== eventId) {
    throw new AppError('Idempotency key đã được sử dụng với sự kiện khác.', 409, ErrorCodes.CONFLICT);
  }

  const existingPromo = (existingOrder.promo_code || '').trim().toUpperCase();
  const incomingPromo = (promoCode || '').trim().toUpperCase();
  if (existingPromo !== incomingPromo) {
    throw new AppError('Idempotency key đã được sử dụng với mã giảm giá khác.', 409, ErrorCodes.CONFLICT);
  }

  const existingItems = Array.isArray(existingOrder.items) ? existingOrder.items : [];
  const mapExisting = new Map();
  for (const it of existingItems) {
    mapExisting.set(it.ticket_type_id, (mapExisting.get(it.ticket_type_id) || 0) + Number(it.quantity));
  }
  const mapIncoming = new Map();
  for (const it of items) {
    mapIncoming.set(it.ticket_type_id, (mapIncoming.get(it.ticket_type_id) || 0) + Number(it.quantity));
  }

  if (mapExisting.size !== mapIncoming.size) {
    throw new AppError('Idempotency key đã được sử dụng với danh sách vé khác.', 409, ErrorCodes.CONFLICT);
  }

  for (const [ttId, qty] of mapIncoming.entries()) {
    if (mapExisting.get(ttId) !== qty) {
      throw new AppError('Idempotency key đã được sử dụng với số lượng vé khác.', 409, ErrorCodes.CONFLICT);
    }
  }

  return true;
}

function formatExistingOrderResponse(existingOrder) {
  const isCompleted = existingOrder.status === 'CONFIRMED' || existingOrder.status === 'PAID';
  const requiresPayment = existingOrder.status === 'PENDING';
  return {
    order: {
      id: existingOrder.id,
      order_code: existingOrder.order_code,
      status: existingOrder.status,
      subtotal: Number(existingOrder.subtotal || 0),
      discount_amount: Number(existingOrder.discount_amount || 0),
      platform_fee: Number(existingOrder.platform_fee || 0),
      total_amount: Number(existingOrder.total_amount || 0),
      expired_at: existingOrder.expired_at,
      created_at: existingOrder.created_at,
      event: existingOrder.event_info,
    },
    payment: existingOrder.payment_order_id
      ? {
          id: existingOrder.payment_order_id,
          provider_order_code: existingOrder.provider_order_code,
          status: existingOrder.payment_status,
          checkout_url: existingOrder.checkout_url,
          qr_code: existingOrder.qr_code,
          amount: Number(existingOrder.payment_amount || 0),
        }
      : null,
    items: (existingOrder.items || []).map((item) => ({
      ticket_type_id: item.ticket_type_id,
      ticket_type_name: item.ticket_type_name,
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price || 0),
      final_price: Number(item.final_price || 0),
    })),
    requires_payment: requiresPayment,
    is_completed: isCompleted,
    idempotent_replay: true,
  };
}

const HOLD_SECONDS = Number(process.env.TICKET_HOLD_SECONDS || 900);

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

  async createPendingCheckout({ userId, eventId, buyer, attendees = [], promoCode, items, totals, paymentChannel, requireEventTermsAcceptance = false, eventTermsAccepted = false, idempotencyKey = null }) {
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
          e.sales_status,
          e.display_state,
          e.sales_blocks,
          e.seating_rules,
          e.additional_terms,
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
        throw new AppError('Thông tin vé không hợp lệ.', 400, ErrorCodes.ORDER_INVALID_ITEMS);
      }

      const ticketTypeMap = new Map(ticketTypesResult.rows.map((row) => [row.id, row]));
      const firstTicket = ticketTypesResult.rows[0];

      if (
        !firstTicket ||
        firstTicket.event_id !== eventId ||
        firstTicket.deleted_at
      ) {
        throw new AppError('Sự kiện hiện không khả dụng để đặt vé.', 400, ErrorCodes.EVENT_NOT_AVAILABLE);
      }

      // Section 10.2: Point 2 - Order Creation / Checkout Checks
      if (firstTicket.event_status === 'CANCELLED' || firstTicket.event_status === 'ENDED') {
        throw new AppError('Sự kiện đã kết thúc hoặc đã bị hủy.', 400, ErrorCodes.EVENT_NOT_AVAILABLE);
      }

      if (firstTicket.display_state === 'SUSPENDED_BY_ADMIN') {
        throw new AppError('Sự kiện đang bị đình chỉ bởi Quản trị viên.', 403, ErrorCodes.SUSPENDED_BY_ADMIN);
      }

      const activeBlocks = Array.isArray(firstTicket.sales_blocks)
        ? firstTicket.sales_blocks.filter((b) => b && !b.released_at)
        : [];
      if (firstTicket.sales_status === 'PAUSED' || activeBlocks.length > 0) {
        const SYSTEM_CODES = ['ORGANIZER_PAUSE', 'HIDE', 'SUSPENDED', 'ADMIN_PAUSE', 'REFUND_OVERDUE', 'CANCELLATION_REQUESTED', 'CANCELLING'];
        const reasons = activeBlocks
          .map((b) => b.metadata?.note || b.note || b.metadata?.reason)
          .filter((r) => r && !SYSTEM_CODES.includes(String(r).trim()))
          .join(', ');
        throw new AppError(
          `Sự kiện đang tạm dừng bán vé${reasons ? ' (Lý do: ' + reasons + ')' : ''}.`,
          400,
          ErrorCodes.SALES_PAUSED,
        );
      }

      if (
        firstTicket.sales_status !== 'ON_SALE' ||
        firstTicket.event_status !== 'PUBLISHED' ||
        firstTicket.visibility !== 'PUBLIC' ||
        firstTicket.approval_status !== 'APPROVED'
      ) {
        throw new AppError('Sự kiện hiện không khả dụng để đặt vé.', 400, ErrorCodes.SALES_PAUSED);
      }

      if (requireEventTermsAcceptance && String(firstTicket.additional_terms || '').trim() && !eventTermsAccepted) {
        throw new AppError('Bạn cần đồng ý với điều khoản của sự kiện trước khi thanh toán.', 400, ErrorCodes.INVALID_INPUT);
      }

      if (firstTicket.event_end_time && new Date(firstTicket.event_end_time).getTime() < Date.now()) {
        throw new AppError('S\u1ef1 ki\u1ec7n \u0111\u00e3 k\u1ebft th\u00fac, kh\u00f4ng th\u1ec3 b\u00e1n v\u00e9.', 400, ErrorCodes.ORDER_TICKET_SALE_CLOSED);
      }

      if (paymentChannel && firstTicket.organizer_id !== paymentChannel.organizer_id) {
        throw new AppError('K\u00eanh thanh to\u00e1n c\u1ee7a ban t\u1ed5 ch\u1ee9c kh\u00f4ng h\u1ee3p l\u1ec7.', 400, ErrorCodes.ORDER_INVALID_ITEMS);
      }


      const totalRequested = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

      const seatingRules = typeof firstTicket.seating_rules === 'string'
        ? JSON.parse(firstTicket.seating_rules || '{}')
        : firstTicket.seating_rules || {};
      const maxTicketsPerOrder = Number.isInteger(Number(seatingRules.max_tickets_per_order)) && Number(seatingRules.max_tickets_per_order) > 0
        ? Number(seatingRules.max_tickets_per_order)
        : null;

      if (maxTicketsPerOrder && totalRequested > maxTicketsPerOrder) {
        throw new AppError(
          `Bạn chỉ được mua tối đa ${maxTicketsPerOrder} vé/chỗ trong một lần đặt cho sự kiện này.`,
          400,
          ErrorCodes.ORDER_INVALID_ITEMS,
        );
      }

      const requireAttendeeInfo = Boolean(firstTicket.require_attendee_info);
      if (requireAttendeeInfo && attendees.length !== totalRequested) {
        throw new AppError('Vui lòng nhập đủ thông tin người tham dự cho từng vé.', 400, ErrorCodes.INVALID_INPUT);
      }
      const attendeeQueues = requireAttendeeInfo ? buildAttendeeQueues(attendees) : new Map();

      const expiresAtResult = await client.query(
        `SELECT now() + ($1 * interval '1 second') AS expired_at`,
        [HOLD_SECONDS],
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
              OR $1 = ANY(event_ids)
              OR (
                event_id IS NULL
                AND COALESCE(cardinality(event_ids), 0) = 0
              )
            )
            AND organizer_id = $3
            AND UPPER(code) = UPPER($2)
            AND is_active = true
            AND (start_time IS NULL OR start_time <= now())
            AND (end_time IS NULL OR end_time >= now())
            AND (usage_limit IS NULL OR used_count < usage_limit)
          LIMIT 1
          FOR UPDATE
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
          expired_at,
          idempotency_key
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7, $8, $9, 0, $10, $11, $12)
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
          idempotencyKey || null,
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

        if (!['UPCOMING', 'ONGOING'].includes(ticketType.session_status)) {
          throw new AppError('Su\u1ea5t di\u1ec5n hi\u1ec7n kh\u00f4ng kh\u1ea3 d\u1ee5ng \u0111\u1ec3 \u0111\u1eb7t v\u00e9.', 400, ErrorCodes.ORDER_INVALID_ITEMS);
        }

        const now = Date.now();
        const sessionEnd = ticketType.session_end_time ? new Date(ticketType.session_end_time).getTime() : null;
        if (sessionEnd && sessionEnd <= now) {
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
                  AND o_sold.status IN ('PAID', 'CONFIRMED')
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
                    AND o_sold.status IN ('PAID', 'CONFIRMED')
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
              COALESCE(SUM(oi.quantity) FILTER (WHERE o.status IN ('PAID', 'CONFIRMED')), 0)::int AS sold_quantity,
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
          COALESCE(SUM(oi.quantity) FILTER (WHERE o.status IN ('PAID', 'CONFIRMED')), 0)::int AS sold_quantity,
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
        AND es.status IN ('UPCOMING', 'ONGOING')
        AND es.end_time > now()
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
          e.refund_policy AS event_refund_policy,
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
        if (!['UPCOMING', 'ONGOING'].includes(ticketType.session_status)) {
          throw new AppError('Suất diễn hiện không khả dụng để đặt vé.', 400, ErrorCodes.ORDER_INVALID_ITEMS);
        }

        const now = Date.now();
        const sessionEnd = ticketType.session_end_time ? new Date(ticketType.session_end_time).getTime() : null;
        if (sessionEnd && sessionEnd <= now) {
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
            COALESCE(SUM(oi.quantity) FILTER (WHERE o.status IN ('PAID', 'CONFIRMED')), 0)::int AS sold_quantity,
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

        const ticketsToInsert = [];
        for (let index = 0; index < Number(item.quantity); index += 1) {
          const code = ticketCode();
          ticketsToInsert.push([
            orderItem.id,
            ticketType.event_id,
            ticketType.event_session_id,
            ticketType.id,
            null,
            code,
            code,
            buyer.name,
            buyer.email || null,
            ticketType.event_refund_policy ? JSON.stringify(ticketType.event_refund_policy) : null,
          ]);
        }

        if (ticketsToInsert.length > 0) {
          const placeholders = ticketsToInsert.map((_, idx) => {
            const o = idx * 10;
            return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}::varchar(100), $${o + 7}::text, $${o + 8}, $${o + 9}, $${o + 10}::jsonb, 'VALID')`;
          }).join(', ');
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
              refund_policy_snapshot,
              status
            )
            VALUES ${placeholders}
            `,
            ticketsToInsert.flat(),
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
          paid_at,
          provider_transaction_id,
          raw_payload
        )
        VALUES ($1, $2, 'ORGANIZER', NULL, 'TICKET_ORDER', $1, 'MANUAL', $3, $4, 'VND', $5, 'PAID', now(), $6, $7::jsonb)
        RETURNING *
        `,
        [
          order.id,
          firstTicket.organizer_id,
          providerOrderCode(),
          subtotal,
          `Direct ${order.order_code}`.slice(0, 25),
          `${paymentMethod}-${order.order_code}`,
          JSON.stringify({
            bookingSource: 'staff_direct',
            paymentMethod,
            staffId,
            staffName: staff.full_name,
            internalNote: internalNote || null,
          }),
        ],
      );
      const paymentOrder = paymentOrderResult.rows[0];

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
            provider_transaction_id = $2,
            raw_payload = $3::jsonb,
            status = 'PAID',
            paid_at = now(),
            updated_at = now()
        WHERE id = $1
        `,
        [
          paymentOrder.id,
          `${paymentMethod}-${order.order_code}`,
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
          e.refund_policy AS event_refund_policy,
          t.id AS existing_ticket_id
        FROM order_items oi
        JOIN ticket_types tt ON tt.id = oi.ticket_type_id
        JOIN event_sessions es ON es.id = tt.event_session_id
        JOIN events e ON e.id = es.event_id
        LEFT JOIN tickets t ON t.order_item_id = oi.id
        WHERE oi.order_id = $1
        ORDER BY oi.id
        `,
        [orderId],
      );

      const ticketsToInsert = [];
      for (const item of itemResult.rows) {
        if (item.existing_ticket_id) continue;

        const quantity = item.session_seat_id ? 1 : Number(item.quantity);
        for (let index = 0; index < quantity; index += 1) {
          const code = ticketCode();
          ticketsToInsert.push([
            item.id,
            item.event_id,
            item.event_session_id,
            item.ticket_type_id,
            item.session_seat_id,
            code,
            code,
            order.buyer_name,
            order.buyer_email,
            item.event_refund_policy ? JSON.stringify(item.event_refund_policy) : null,
          ]);
        }
      }

      if (ticketsToInsert.length > 0) {
        const placeholders = ticketsToInsert.map((_, idx) => {
          const o = idx * 10;
          return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}::varchar(100), $${o + 7}::text, $${o + 8}, $${o + 9}, $${o + 10}::jsonb, 'VALID')`;
        }).join(', ');
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
            refund_policy_snapshot,
            status
          )
          VALUES ${placeholders}
          `,
          ticketsToInsert.flat(),
        );
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

      // Check event and order cancellation status (Section 6.10, BR-HE-07, BR-CE-13)
      const eventQuery = await client.query(
        `
        SELECT e.id, e.title, e.status, e.organizer_id, org.user_id AS organizer_user_id
        FROM orders ord
        JOIN order_items oi ON oi.order_id = ord.id
        JOIN ticket_types tt ON tt.id = oi.ticket_type_id
        JOIN event_sessions es ON es.id = tt.event_session_id
        JOIN events e ON e.id = es.event_id
        LEFT JOIN organizers org ON org.id = e.organizer_id
        WHERE ord.id = $1
        LIMIT 1
        `,
        [order.id],
      );
      const eventInfo = eventQuery.rows[0];
      const isEventCancelled = (eventInfo && eventInfo.status === 'CANCELLED') || order.status_reason === 'EVENT_CANCELLED';

      // Parse PayOS counterAccount data if present (Section 7.15, 7.26)
      const dataPayload = rawPayload?.data || rawPayload || {};
      const payerBankId = dataPayload.counterAccountBankId || dataPayload.counter_account_bank_id || null;
      const rawAccNum = dataPayload.counterAccountNumber || dataPayload.counter_account_number || null;
      const payerAccountName = dataPayload.counterAccountName || dataPayload.counter_account_name || null;
      let encryptedAccNum = null;
      if (rawAccNum) {
        try {
          encryptedAccNum = fieldCrypto.encrypt(rawAccNum, paymentOrder.organizer_id || 'platform', 'payer_account_number');
        } catch (e) {
          encryptedAccNum = null;
        }
      }

      if (isEventCancelled) {
        // Section 6.10: Late Callback for Cancelled Event
        await client.query(
          `
          UPDATE payment_orders
          SET status = 'PAID',
              provider_transaction_id = $2,
              raw_payload = $3::jsonb,
              payer_bank_id = COALESCE($4, payer_bank_id),
              payer_account_number = COALESCE($5, payer_account_number),
              payer_account_name = COALESCE($6, payer_account_name),
              paid_at = now(),
              updated_at = now()
          WHERE id = $1
          `,
          [
            paymentOrder.id,
            transactionId || String(providerOrderCode),
            JSON.stringify(rawPayload || {}),
            payerBankId,
            encryptedAccNum,
            payerAccountName,
          ],
        );

        await client.query(
          `
          UPDATE orders
          SET status = 'PAID',
              status_reason = 'PAID_AFTER_EVENT_CANCELLED',
              updated_at = now()
          WHERE id = $1
          `,
          [order.id],
        );

        // Auto-create refund request (Section 6.10, rule 44)
        const hasCounterAccount = Boolean(payerBankId && rawAccNum && payerAccountName);
        const destinationSource = hasCounterAccount ? 'PAYER_ACCOUNT' : 'CUSTOMER_INPUT';
        const readyAt = hasCounterAccount ? new Date() : null;
        const refundCode = `RF_${order.order_code || order.id.slice(0, 8)}`;

        await client.query(
          `
          INSERT INTO refund_requests (
            order_id, event_id, customer_id, organizer_id,
            refund_amount, reason, status, execution_mode,
            refund_destination_source, ready_at, due_at,
            refund_code, bank_name, bank_account_number, bank_account_name,
            requested_at, created_at, updated_at
          )
          SELECT
            $1, $2, $3, $4,
            $5, 'EVENT_CANCELLED', 'APPROVED', 'ORGANIZER_MANUAL',
            $6, $7, now() + interval '7 days',
            $8, $9, $10, $11,
            now(), now(), now()
          WHERE NOT EXISTS (
            SELECT 1 FROM refund_requests WHERE order_id = $1
          )
          `,
          [
            order.id,
            eventInfo?.id || order.event_id,
            order.user_id,
            eventInfo?.organizer_user_id || null,
            paymentOrder.amount,
            destinationSource,
            readyAt,
            refundCode,
            payerBankId,
            encryptedAccNum,
            payerAccountName,
          ],
        );

        await client.query('COMMIT');
        return {
          alreadyPaid: false,
          lateCancelledEvent: true,
          order: { ...order, status: 'PAID', status_reason: 'PAID_AFTER_EVENT_CANCELLED' },
          tickets: [],
        };
      }

      if (order.status !== 'PENDING') {
        throw new AppError('Không thể xác nhận đơn hàng.', 400, ErrorCodes.INVALID_INPUT);
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
        throw new AppError('Thời gian giữ đơn hàng đã hết.', 400, ErrorCodes.ORDER_TICKET_UNAVAILABLE);
      }

      await client.query(
        `
        UPDATE payment_orders
        SET status = 'PAID',
            provider_transaction_id = $2,
            raw_payload = $3::jsonb,
            payer_bank_id = COALESCE($4, payer_bank_id),
            payer_account_number = COALESCE($5, payer_account_number),
            payer_account_name = COALESCE($6, payer_account_name),
            paid_at = now(),
            updated_at = now()
        WHERE id = $1
        `,
        [
          paymentOrder.id,
          transactionId || String(providerOrderCode),
          JSON.stringify(rawPayload || {}),
          payerBankId,
          encryptedAccNum,
          payerAccountName,
        ],
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
          e.refund_policy AS event_refund_policy,
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

      const ticketsToInsert = [];
      for (const item of itemResult.rows) {
        if (item.existing_ticket_id) continue;

        const quantity = item.session_seat_id ? 1 : Number(item.quantity);
        const attendeeInfo = Array.isArray(item.attendee_info) ? item.attendee_info : [];
        for (let index = 0; index < quantity; index += 1) {
          const attendee = item.require_attendee_info ? attendeeInfo[index] : null;
          const code = ticketCode();
          ticketsToInsert.push([
            item.id,
            item.event_id,
            item.event_session_id,
            item.ticket_type_id,
            item.session_seat_id,
            code,
            code,
            attendee?.name || null,
            attendee?.email || null,
            item.event_refund_policy ? JSON.stringify(item.event_refund_policy) : null,
          ]);
        }
      }

      let issuedTickets = [];
      if (ticketsToInsert.length > 0) {
        const placeholders = ticketsToInsert.map((_, idx) => {
          const o = idx * 10;
          return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7}, $${o + 8}, $${o + 9}, $${o + 10}::jsonb, 'VALID')`;
        }).join(', ');
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
            refund_policy_snapshot,
            status
          )
          VALUES ${placeholders}
          RETURNING id, ticket_code, status, created_at
          `,
          ticketsToInsert.flat(),
        );
        issuedTickets = ticketResult.rows;
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
        po.paid_at, COALESCE(po.provider_transaction_id, po.provider_order_code::text) AS transaction_code
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
      LEFT JOIN payment_orders po ON po.order_id = o.id AND po.status = 'PAID'
      WHERE o.id = $1 AND o.status IN ('PAID', 'CONFIRMED') ORDER BY po.paid_at DESC NULLS LAST LIMIT 1`,
      [orderId],
    );
    const order = rows[0];
    if (!order) return null;
    const ticketResult = await db.query(
      `SELECT t.id, t.ticket_code, t.qr_code, t.attendee_name, t.attendee_email, t.event_id, t.event_session_id,
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

  /**
   * Lightweight query used by AI behavior tracking to get user_id and event_id
   * for a confirmed order. Called fire-and-forget after payment confirmation.
   *
   * @param {string} orderId
   * @returns {{ user_id, event_id, total_amount }|null}
   */
  async findOrderWithEventInfo(orderId) {
    const { rows } = await db.query(
      `SELECT
         o.user_id,
         o.total_amount,
         es.event_id
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       JOIN ticket_types tt ON tt.id = oi.ticket_type_id
       JOIN event_sessions es ON es.id = tt.event_session_id
       WHERE o.id = $1
       LIMIT 1`,
      [orderId],
    );
    return rows[0] || null;
  }

  async findOrderByIdempotencyKey(idempotencyKey) {
    if (!idempotencyKey) return null;
    const { rows } = await db.query(
      `
      SELECT
        o.*,
        pc.code AS promo_code,
        po.id AS payment_order_id,
        po.provider_order_code,
        po.status AS payment_status,
        po.amount AS payment_amount,
        po.checkout_url,
        po.qr_code,
        COALESCE(
          (
            SELECT json_agg(json_build_object(
              'id', oi.id,
              'ticket_type_id', oi.ticket_type_id,
              'ticket_type_name', tt.name,
              'quantity', oi.quantity,
              'unit_price', oi.unit_price,
              'final_price', oi.final_price,
              'session_seat_id', oi.session_seat_id
            ))
            FROM order_items oi
            JOIN ticket_types tt ON tt.id = oi.ticket_type_id
            WHERE oi.order_id = o.id
          ),
          '[]'::json
        ) AS items,
        (
          SELECT json_build_object('id', e.id, 'title', e.title, 'slug', e.slug)
          FROM order_items oi2
          JOIN ticket_types tt2 ON tt2.id = oi2.ticket_type_id
          JOIN event_sessions es2 ON es2.id = tt2.event_session_id
          JOIN events e ON e.id = es2.event_id
          WHERE oi2.order_id = o.id
          LIMIT 1
        ) AS event_info
      FROM orders o
      LEFT JOIN promo_codes pc ON pc.id = o.promo_code_id
      LEFT JOIN payment_orders po ON po.order_id = o.id
      WHERE o.idempotency_key = $1
      ORDER BY po.created_at DESC NULLS LAST
      LIMIT 1
      `,
      [idempotencyKey],
    );
    return rows[0] || null;
  }

  /**
   * Confirms a zero-amount checkout in a SINGLE atomic transaction.
   * Lock order:
   * events (advisory lock) -> ticket_types (FOR UPDATE) -> promo_codes (FOR UPDATE)
   * -> orders -> tickets -> session_seats (FOR UPDATE)
   */
  async confirmZeroAmountCheckout({
    userId,
    eventId,
    buyer,
    attendees = [],
    promoCode = null,
    items,
    idempotencyKey = null,
    requireEventTermsAcceptance = false,
    eventTermsAccepted = false,
  }) {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');
      await this.ensureRequireAttendeeInfoColumn(client);
      await this.ensureAttendeeInfoColumn(client);

      // 1. Transaction-scoped Advisory Lock on (event_id, user_id)
      if (userId) {
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          `event_free_user_${eventId}_${userId}`,
        ]);
      }

      // 2. Lock ticket_types FOR UPDATE
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
          e.sales_status,
          e.display_state,
          e.sales_blocks,
          e.seating_rules,
          e.additional_terms,
          e.require_attendee_info,
          e.refund_policy
        FROM ticket_types tt
        JOIN event_sessions es ON es.id = tt.event_session_id
        JOIN events e ON e.id = es.event_id
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

      if (!firstTicket || firstTicket.event_id !== eventId || firstTicket.deleted_at) {
        throw new AppError('Sự kiện hiện không khả dụng để đặt vé.', 400, ErrorCodes.EVENT_NOT_AVAILABLE);
      }

      if (firstTicket.event_status === 'CANCELLED' || firstTicket.event_status === 'ENDED') {
        throw new AppError('Sự kiện đã kết thúc hoặc đã bị hủy.', 400, ErrorCodes.EVENT_NOT_AVAILABLE);
      }

      if (firstTicket.display_state === 'SUSPENDED_BY_ADMIN') {
        throw new AppError('Sự kiện đang bị đình chỉ bởi Quản trị viên.', 403, ErrorCodes.SUSPENDED_BY_ADMIN);
      }

      const activeBlocks = Array.isArray(firstTicket.sales_blocks)
        ? firstTicket.sales_blocks.filter((b) => b && !b.released_at)
        : [];
      if (firstTicket.sales_status === 'PAUSED' || activeBlocks.length > 0) {
        throw new AppError('Sự kiện đang tạm dừng bán vé.', 400, ErrorCodes.SALES_PAUSED);
      }

      if (
        firstTicket.sales_status !== 'ON_SALE' ||
        firstTicket.event_status !== 'PUBLISHED' ||
        firstTicket.visibility !== 'PUBLIC' ||
        firstTicket.approval_status !== 'APPROVED'
      ) {
        throw new AppError('Sự kiện hiện không khả dụng để đặt vé.', 400, ErrorCodes.SALES_PAUSED);
      }

      if (requireEventTermsAcceptance && String(firstTicket.additional_terms || '').trim() && !eventTermsAccepted) {
        throw new AppError('Bạn cần đồng ý với điều khoản của sự kiện trước khi thanh toán.', 400, ErrorCodes.INVALID_INPUT);
      }

      if (firstTicket.event_end_time && new Date(firstTicket.event_end_time).getTime() < Date.now()) {
        throw new AppError('Sự kiện đã kết thúc, không thể lấy vé.', 400, ErrorCodes.ORDER_TICKET_SALE_CLOSED);
      }

      // Check Free Tickets Quota (max 2 per user per event, seating_rules override)
      const requestedFreeCount = items
        .filter((item) => Number(ticketTypeMap.get(item.ticket_type_id)?.price || 0) === 0)
        .reduce((sum, item) => sum + Number(item.quantity || 0), 0);

      const seatingRules =
        typeof firstTicket.seating_rules === 'string'
          ? JSON.parse(firstTicket.seating_rules)
          : firstTicket.seating_rules || {};

      if (requestedFreeCount > 0) {
        if (!userId) {
          throw new AppError('Vé miễn phí yêu cầu đăng nhập tài khoản.', 401, ErrorCodes.AUTH_REQUIRED);
        }
        const maxFreePerUser = Number(seatingRules?.max_free_tickets_per_user ?? 2);
        const { rows: freeCountRows } = await client.query(
          `
          SELECT count(t.id)::int AS count
          FROM tickets t
          JOIN order_items oi ON oi.id = t.order_item_id
          JOIN orders o ON o.id = oi.order_id
          WHERE t.event_id = $1
            AND o.user_id = $2
            AND t.ticket_source = 'FREE'
            AND t.status IN ('VALID', 'USED')
          `,
          [eventId, userId],
        );
        const existingFreeCount = Number(freeCountRows[0]?.count || 0);
        if (existingFreeCount + requestedFreeCount > maxFreePerUser) {
          const remaining = Math.max(0, maxFreePerUser - existingFreeCount);
          throw new AppError(
            `Bạn chỉ được nhận tối đa ${maxFreePerUser} vé miễn phí cho sự kiện này (bạn còn ${remaining} lượt khả dụng).`,
            400,
            ErrorCodes.ORDER_INVALID_ITEMS,
          );
        }
      }

      // Subtotal calculation
      let subtotal = 0;
      for (const item of items) {
        const ticketType = ticketTypeMap.get(item.ticket_type_id);
        const unitPrice = Number(ticketType.price || 0);
        if (unitPrice < 0) {
          throw new AppError('Giá vé không hợp lệ.', 400, ErrorCodes.INVALID_INPUT);
        }
        subtotal += unitPrice * Number(item.quantity);
      }

      // 3. Lock promo_codes FOR UPDATE (if promoCode applied)
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
              OR $1 = ANY(event_ids)
              OR (
                event_id IS NULL
                AND COALESCE(cardinality(event_ids), 0) = 0
              )
            )
            AND organizer_id = $3
            AND UPPER(code) = UPPER($2)
            AND is_active = true
            AND (start_time IS NULL OR start_time <= now())
            AND (end_time IS NULL OR end_time >= now())
            AND (usage_limit IS NULL OR used_count < usage_limit)
          LIMIT 1
          FOR UPDATE
          `,
          [eventId, promoCode, firstTicket.organizer_id],
        );
        promo = promoResult.rows[0];

        if (!promo || subtotal < Number(promo.min_order_value || 0)) {
          throw new AppError('Mã khuyến mãi không hợp lệ cho đơn hàng này.', 400, ErrorCodes.INVALID_INPUT);
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
      if (totalAmount !== 0) {
        throw new AppError('Đơn hàng có số tiền phải thanh toán lớn hơn 0.', 400, ErrorCodes.INVALID_INPUT);
      }

      // 4. Validate inventory & seats
      const attendeeQueues = new Map();
      const attendeeKey = (ticketTypeId) => String(ticketTypeId);
      for (const attendee of attendees) {
        const key = attendeeKey(attendee.ticket_type_id);
        if (!attendeeQueues.has(key)) attendeeQueues.set(key, []);
        attendeeQueues.get(key).push(attendee);
      }

      for (const item of items) {
        const ticketType = ticketTypeMap.get(item.ticket_type_id);
        const selectedSeatIds = item.session_seat_ids || [];

        if (['UPCOMING', 'ONGOING'].includes(ticketType.session_status) === false) {
          throw new AppError('Suất diễn hiện không khả dụng để đặt vé.', 400, ErrorCodes.ORDER_INVALID_ITEMS);
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
              s.row_label,
              s.seat_number,
              EXISTS (
                SELECT 1
                FROM order_items oi_sold
                JOIN orders o_sold ON o_sold.id = oi_sold.order_id
                LEFT JOIN tickets t_sold ON t_sold.order_item_id = oi_sold.id
                WHERE COALESCE(t_sold.session_seat_id, oi_sold.session_seat_id) = ss.id
                  AND o_sold.status IN ('PAID', 'CONFIRMED')
                  AND (t_sold.id IS NULL OR t_sold.status <> 'CANCELLED')
              ) AS has_confirmed_ticket
            FROM session_seats ss
            JOIN seats s ON s.id = ss.seat_id
            WHERE ss.id = ANY($1::uuid[])
              AND ss.event_session_id = $2
            FOR UPDATE OF ss
            `,
            [selectedSeatIds, ticketType.event_session_id],
          );

          if (seatsResult.rows.length !== selectedSeatIds.length) {
            throw new AppError('Một hoặc nhiều ghế đã chọn không hợp lệ.', 400, ErrorCodes.ORDER_INVALID_ITEMS);
          }

          for (const seat of seatsResult.rows) {
            if (seat.has_confirmed_ticket || seat.status === 'SOLD') {
              throw new AppError(
                `Ghế ${seat.row_label || ''}${seat.seat_number || ''} đã được mua. Vui lòng chọn ghế khác.`,
                400,
                ErrorCodes.ORDER_SEAT_HELD,
              );
            }
            if (seat.status === 'HELD' && seat.held_until && new Date(seat.held_until).getTime() > Date.now()) {
              if (userId && seat.held_by !== userId) {
                throw new AppError(
                  `Ghế ${seat.row_label || ''}${seat.seat_number || ''} đang được giữ bởi người khác.`,
                  400,
                  ErrorCodes.ORDER_SEAT_HELD,
                );
              }
            }
          }
        } else {
          // Unseated inventory check
          const availabilityResult = await client.query(
            `
            SELECT
              COALESCE(SUM(oi.quantity) FILTER (WHERE o.status IN ('PAID', 'CONFIRMED')), 0)::int AS sold_quantity,
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
          const { sold_quantity, active_hold_quantity } = availabilityResult.rows[0];
          if (sold_quantity + active_hold_quantity + item.quantity > Number(ticketType.quantity)) {
            throw new AppError(
              `Loại vé "${ticketType.name}" đã hết số lượng khả dụng.`,
              400,
              ErrorCodes.ORDER_OUT_OF_STOCK,
            );
          }
        }
      }

      // 5. Insert order (status = 'CONFIRMED', payment_method = 'FREE', expired_at = NULL)
      const auditTrail = [
        {
          action: 'ZERO_AMOUNT_CHECKOUT',
          timestamp: new Date().toISOString(),
          details: { subtotal, discountAmount, totalAmount: 0 },
        },
      ];

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
          payment_method,
          promo_code_id,
          subtotal,
          discount_amount,
          platform_fee,
          total_amount,
          expired_at,
          idempotency_key,
          audit_trail
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'CONFIRMED', 'FREE', $7, $8, $9, 0, 0, NULL, $10, $11::jsonb)
        RETURNING *
        `,
        [
          userId || null,
          firstTicket.organizer_id,
          buyer.name,
          buyer.email,
          buyer.phone || null,
          orderCode(),
          promo?.id || null,
          subtotal,
          discountAmount,
          idempotencyKey || null,
          JSON.stringify(auditTrail),
        ],
      );

      const order = orderResult.rows[0];
      const orderItems = [];

      // 6. Discount allocation per ticket
      const ticketSlots = [];
      for (const item of items) {
        const ticketType = ticketTypeMap.get(item.ticket_type_id);
        const selectedSeatIds = item.session_seat_ids || [];
        const qty = Number(item.quantity);
        const origPrice = Number(ticketType.price || 0);

        const attendeeInfo = [];
        if (firstTicket.require_attendee_info) {
          const queue = attendeeQueues.get(attendeeKey(item.ticket_type_id));
          if (!queue || queue.length < qty) {
            throw new AppError('Thông tin người tham dự không khớp với số lượng vé.', 400, ErrorCodes.INVALID_INPUT);
          }
          attendeeInfo.push(...queue.splice(0, qty));
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
            qty,
            origPrice,
            origPrice * qty,
            JSON.stringify(attendeeInfo),
          ],
        );
        const createdOrderItem = { ...itemResult.rows[0], ticket_type_name: ticketType.name };
        orderItems.push(createdOrderItem);

        for (let i = 0; i < qty; i++) {
          ticketSlots.push({
            order_item_id: createdOrderItem.id,
            ticket_type_id: item.ticket_type_id,
            session_id: ticketType.session_id,
            session_seat_id: selectedSeatIds[i] || null,
            original_price: origPrice,
            attendee: attendeeInfo[i] || null,
            index: ticketSlots.length,
          });
        }
      }

      // Proportional discount distribution: floor + remainder 1đ by price DESC, id ASC
      const totalDiscount = Math.round(Number(discountAmount || 0));
      const orderSubtotal = Math.max(1, Math.round(Number(subtotal || 0)));
      let allocatedSum = 0;

      ticketSlots.forEach((slot) => {
        if (slot.original_price === 0) {
          slot.discount_allocated = 0;
          slot.payable_price = 0;
          slot.ticket_source = 'FREE';
        } else {
          const alloc = Math.min(slot.original_price, Math.floor((totalDiscount * slot.original_price) / orderSubtotal));
          slot.discount_allocated = alloc;
          allocatedSum += alloc;
        }
      });

      let remainder = totalDiscount - allocatedSum;
      const discountableSlots = [...ticketSlots]
        .filter((s) => s.original_price > 0 && s.discount_allocated < s.original_price)
        .sort((a, b) => b.original_price - a.original_price || a.index - b.index);

      for (let i = 0; i < discountableSlots.length && remainder > 0; i++) {
        discountableSlots[i].discount_allocated += 1;
        remainder -= 1;
      }

      ticketSlots.forEach((slot) => {
        if (slot.original_price > 0) {
          slot.payable_price = Math.max(0, slot.original_price - slot.discount_allocated);
          slot.ticket_source = slot.payable_price === 0 ? 'FULLY_DISCOUNTED' : 'STANDARD';
        }
      });

      // 7. Insert tickets
      const ticketsToInsert = ticketSlots.map((slot) => {
        const code = ticketCode();
        return [
          slot.order_item_id,
          eventId,
          slot.session_id,
          slot.ticket_type_id,
          slot.session_seat_id,
          code,
          code,
          slot.attendee?.name || buyer.name,
          slot.attendee?.email || buyer.email,
          firstTicket.refund_policy ? JSON.stringify(firstTicket.refund_policy) : null,
          'VALID',
          slot.ticket_source,
          slot.original_price,
          slot.discount_allocated,
          slot.payable_price,
        ];
      });

      const placeholders = ticketsToInsert
        .map((_, idx) => {
          const o = idx * 15;
          return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7}, $${o + 8}, $${o + 9}, $${o + 10}::jsonb, $${o + 11}, $${o + 12}, $${o + 13}, $${o + 14}, $${o + 15})`;
        })
        .join(', ');

      const ticketsResult = await client.query(
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
          refund_policy_snapshot,
          status,
          ticket_source,
          original_price,
          discount_allocated,
          payable_price
        )
        VALUES ${placeholders}
        RETURNING id, ticket_code, status, ticket_source, original_price, discount_allocated, payable_price, created_at
        `,
        ticketsToInsert.flat(),
      );

      const issuedTickets = ticketsResult.rows;

      // 8. Update seats to 'SOLD'
      const allSelectedSeatIds = items.flatMap((item) => item.session_seat_ids || []).filter(Boolean);
      if (allSelectedSeatIds.length > 0) {
        await client.query(
          `
          UPDATE session_seats
          SET status = 'SOLD', order_id = $1, held_by = NULL, held_until = NULL
          WHERE id = ANY($2::uuid[])
          `,
          [order.id, allSelectedSeatIds],
        );
      }

      // 9. Increment promo code used_count
      if (promo) {
        await client.query(
          `
          UPDATE promo_codes
          SET used_count = used_count + 1
          WHERE id = $1
          `,
          [promo.id],
        );
      }

      await client.query('COMMIT');
      return { order, orderItems, issuedTickets, event: firstTicket };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (error.code === '23505' && idempotencyKey) {
        const existing = await this.findOrderByIdempotencyKey(idempotencyKey);
        if (existing) {
          validateIdempotencyPayload(existing, { userId, eventId, promoCode, items });
          return formatExistingOrderResponse(existing);
        }
      }
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = new OrdersRepository();
module.exports.validateIdempotencyPayload = validateIdempotencyPayload;
module.exports.formatExistingOrderResponse = formatExistingOrderResponse;
