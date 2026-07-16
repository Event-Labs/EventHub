const db = require('../../infrastructure/database/db.client');
const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');

const HOLD_MINUTES = Number(process.env.TICKET_HOLD_MINUTES || 15);

const PUBLIC_EVENT_WHERE = `
  e.status = 'PUBLISHED'
  AND e.visibility = 'PUBLIC'
  AND e.approval_status = 'APPROVED'
  AND e.deleted_at IS NULL
  AND (e.start_publish_at IS NULL OR e.start_publish_at <= now())
  AND (e.end_publish_at IS NULL OR e.end_publish_at >= now())
`;

const EVENT_CARD_SELECT = `
  e.id,
  e.title,
  e.slug,
  e.short_description,
  e.thumbnail_url,
  e.banner_url,
  COALESCE(e.start_time, time_summary.start_time) AS start_time,
  COALESCE(e.end_time, time_summary.end_time) AS end_time,
  e.created_at,
  c.id AS category_id,
  c.name AS category_name,
  c.slug AS category_slug,
  organizer.id AS organizer_id,
  COALESCE(organizer.organization_name, organizer_user.full_name) AS organizer_name,
  venue_summary.venue_name,
  venue_summary.city,
  venue_summary.district,
  venue_summary.address_line,
  price_summary.min_price,
  price_summary.max_price,
  CASE WHEN my_fav.event_id IS NULL THEN false ELSE true END AS is_favorited
`;

const EVENT_CARD_JOINS = `
  LEFT JOIN event_categories c ON c.id = e.category_id
  LEFT JOIN organizers organizer ON organizer.id = e.organizer_id
  LEFT JOIN users organizer_user ON organizer_user.id = organizer.user_id
  LEFT JOIN LATERAL (
    SELECT MIN(es_time.start_time) AS start_time, MAX(es_time.end_time) AS end_time
    FROM event_sessions es_time
    WHERE es_time.event_id = e.id
  ) time_summary ON true
  LEFT JOIN LATERAL (
    SELECT v.name AS venue_name, v.city, v.district, v.address_line
    FROM event_sessions es
    JOIN venues v ON v.id = es.venue_id
    WHERE es.event_id = e.id AND v.deleted_at IS NULL
    ORDER BY es.start_time ASC
    LIMIT 1
  ) venue_summary ON true
  LEFT JOIN LATERAL (
    SELECT MIN(tt.price) AS min_price, MAX(tt.price) AS max_price
    FROM event_sessions es
    JOIN ticket_types tt ON tt.event_session_id = es.id
    WHERE es.event_id = e.id
  ) price_summary ON true
  LEFT JOIN favorite_events my_fav ON my_fav.event_id = e.id AND my_fav.user_id = $1
`;

function buildListQuery(filters) {
  const params = [filters.userId || null];
  const where = [PUBLIC_EVENT_WHERE];
  const addParam = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (filters.keyword) {
    const keywordParam = addParam(`%${filters.keyword}%`);
    where.push(`(
      e.title ILIKE ${keywordParam}
      OR e.short_description ILIKE ${keywordParam}
      OR e.description ILIKE ${keywordParam}
      OR c.name ILIKE ${keywordParam}
      OR organizer.organization_name ILIKE ${keywordParam}
      OR organizer_user.full_name ILIKE ${keywordParam}
      OR EXISTS (
        SELECT 1 FROM event_sessions es_kw
        JOIN venues v_kw ON v_kw.id = es_kw.venue_id
        WHERE es_kw.event_id = e.id
          AND v_kw.deleted_at IS NULL
          AND (
            v_kw.city ILIKE ${keywordParam}
            OR v_kw.district ILIKE ${keywordParam}
            OR v_kw.address_line ILIKE ${keywordParam}
            OR v_kw.name ILIKE ${keywordParam}
          )
      )
    )`);
  }

  if (filters.categoryId) where.push(`e.category_id = ${addParam(filters.categoryId)}`);
  if (filters.categorySlug) where.push(`c.slug = ${addParam(filters.categorySlug)}`);

  if (filters.location) {
    const locationParam = addParam(`%${filters.location}%`);
    where.push(`EXISTS (
      SELECT 1 FROM event_sessions es_loc
      JOIN venues v_loc ON v_loc.id = es_loc.venue_id
      WHERE es_loc.event_id = e.id
        AND v_loc.deleted_at IS NULL
        AND (
          v_loc.city ILIKE ${locationParam}
          OR v_loc.district ILIKE ${locationParam}
          OR v_loc.address_line ILIKE ${locationParam}
          OR v_loc.name ILIKE ${locationParam}
        )
    )`);
  }

  if (filters.startDate) where.push(`COALESCE(e.start_time, time_summary.start_time) >= ${addParam(filters.startDate)}`);
  if (filters.endDate) where.push(`COALESCE(e.start_time, time_summary.start_time) <= ${addParam(filters.endDate)}`);

  if (filters.minPrice !== undefined) {
    where.push(`EXISTS (
      SELECT 1 FROM event_sessions es_price_min
      JOIN ticket_types tt_price_min ON tt_price_min.event_session_id = es_price_min.id
      WHERE es_price_min.event_id = e.id AND tt_price_min.price >= ${addParam(filters.minPrice)}
    )`);
  }

  if (filters.maxPrice !== undefined) {
    where.push(`EXISTS (
      SELECT 1 FROM event_sessions es_price_max
      JOIN ticket_types tt_price_max ON tt_price_max.event_session_id = es_price_max.id
      WHERE es_price_max.event_id = e.id AND tt_price_max.price <= ${addParam(filters.maxPrice)}
    )`);
  }

  const sortMap = {
    start_time: 'COALESCE(e.start_time, time_summary.start_time)',
    created_at: 'e.created_at',
    updated_at: 'e.updated_at',
    price: 'price_summary.min_price',
  };
  const sortColumn = sortMap[filters.sortBy] || sortMap.start_time;
  const sortDirection = filters.sortOrder === 'desc' ? 'DESC' : 'ASC';
  const countParams = [...params];
  const limitParam = addParam(filters.limit);
  const offsetParam = addParam(filters.offset);
  const fromClause = `FROM events e ${EVENT_CARD_JOINS} WHERE ${where.join('\nAND ')}`;

  return {
    list: `
      SELECT ${EVENT_CARD_SELECT}
      ${fromClause}
      ORDER BY ${sortColumn} ${sortDirection} NULLS LAST, e.id ASC
      LIMIT ${limitParam} OFFSET ${offsetParam}
    `,
    count: `SELECT COUNT(DISTINCT e.id)::int AS total ${fromClause}`,
    params,
    countParams,
  };
}

class EventsRepository {
  async ensureRequireAttendeeInfoColumn(client = db) {
    await client.query('ALTER TABLE events ADD COLUMN IF NOT EXISTS require_attendee_info BOOLEAN NOT NULL DEFAULT FALSE');
  }

  async findPublicCategories() {
    const query = `
      SELECT
        c.id,
        c.name,
        c.slug,
        c.description,
        COUNT(e.id)::int AS event_count
      FROM event_categories c
      LEFT JOIN events e ON e.category_id = c.id AND ${PUBLIC_EVENT_WHERE}
      WHERE COALESCE(c.is_active, true) = true
        AND c.deleted_at IS NULL
      GROUP BY c.id, c.name, c.slug, c.description
      ORDER BY event_count DESC, c.name ASC
    `;
    const { rows } = await db.query(query);
    return rows;
  }

  async findPublicEvents(filters) {
    const { list, count, params, countParams } = buildListQuery(filters);
    const [listResult, countResult] = await Promise.all([
      db.query(list, params),
      db.query(count, countParams),
    ]);
    return { rows: listResult.rows, total: countResult.rows[0]?.total || 0 };
  }

  async findPublicEventByIdentifier(identifier, userId = null) {
    await this.ensureRequireAttendeeInfoColumn();
    const query = `
      SELECT
        ${EVENT_CARD_SELECT},
        e.description,
        e.seating_rules,
        e.require_attendee_info,
        json_build_object(
          'id', organizer.id,
          'full_name', COALESCE(organizer.organization_name, organizer_user.full_name),
          'organization_name', organizer.organization_name,
          'avatar_url', organizer_user.avatar_url
        ) AS organizer,
        COALESCE(sessions.sessions, '[]'::json) AS sessions,
        COALESCE(ticket_types.ticket_types, '[]'::json) AS ticket_types
      FROM events e
      ${EVENT_CARD_JOINS}
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object(
          'id', es.id,
          'session_name', es.session_name,
          'start_time', es.start_time,
          'end_time', es.end_time,
          'checkin_start_time', es.checkin_start_time,
          'status', es.status,
          'venue', json_build_object(
            'id', v.id,
            'name', v.name,
            'country', v.country,
            'city', v.city,
            'district', v.district,
            'ward', v.ward,
            'address_line', v.address_line,
            'description', v.description,
            'latitude', v.latitude,
            'longitude', v.longitude
          )
        ) ORDER BY es.start_time ASC) AS sessions
        FROM event_sessions es
        JOIN venues v ON v.id = es.venue_id
        WHERE es.event_id = e.id AND v.deleted_at IS NULL
      ) sessions ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object(
          'id', tt.id,
          'event_session_id', tt.event_session_id,
          'name', tt.name,
          'description', tt.description,
          'price', tt.price,
          'quantity', tt.quantity,
          'sold_quantity', COALESCE(ticket_usage.sold_quantity, 0),
          'active_hold_quantity', COALESCE(ticket_usage.active_hold_quantity, 0),
          'available_quantity', GREATEST(tt.quantity - COALESCE(ticket_usage.sold_quantity, 0) - COALESCE(ticket_usage.active_hold_quantity, 0), 0),
          'max_per_order', tt.max_per_order,
          'sale_start', tt.sale_start,
          'sale_end', tt.sale_end,
          'is_seated', tt.is_seated
        ) ORDER BY tt.price ASC) AS ticket_types
        FROM event_sessions es_tt
        JOIN ticket_types tt ON tt.event_session_id = es_tt.id
        LEFT JOIN LATERAL (
          SELECT
            COALESCE(SUM(oi.quantity) FILTER (WHERE o.status = 'PAID'), 0)::int AS sold_quantity,
            COALESCE((
              SELECT SUM(th.quantity)::int
              FROM ticket_holds th
              WHERE th.ticket_type_id = tt.id
                AND th.status = 'ACTIVE'
                AND th.expires_at > now()
            ), 0)::int AS active_hold_quantity
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
          WHERE oi.ticket_type_id = tt.id
        ) ticket_usage ON true
        WHERE es_tt.event_id = e.id
      ) ticket_types ON true
      WHERE ${PUBLIC_EVENT_WHERE}
        AND (e.id::text = $2 OR e.slug = $2)
      LIMIT 1
    `;
    const { rows } = await db.query(query, [userId, identifier]);
    return rows[0];
  }

  async findSessionSeats(sessionId, ticketTypeId = null) {
    const params = [sessionId];
    const ticketTypeJoin = ticketTypeId
      ? `
        LEFT JOIN ticket_type_seats tts
          ON tts.seat_id = s.id
         AND tts.ticket_type_id = $2
      `
      : '';
    const ticketTypeWhere = ticketTypeId
      ? `
        AND (
          NOT EXISTS (SELECT 1 FROM ticket_type_seats WHERE ticket_type_id = $2)
          OR tts.ticket_type_id IS NOT NULL
        )
      `
      : '';

    if (ticketTypeId) params.push(ticketTypeId);

    const { rows } = await db.query(
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
        s.id AS seat_id,
        s.row_label,
        s.seat_number,
        s.x_position,
        s.y_position,
        s.is_disabled,
        st.name AS seat_type_name,
        st.color AS seat_type_color,
        sz.id AS zone_id,
        sz.name AS zone_name,
        sz.color AS zone_color,
        COALESCE(seat_ticket_types.ticket_type_ids, '[]'::jsonb) AS ticket_type_ids,
        sm.rows_count,
        sm.cols_count,
        sm.canvas_width,
        sm.canvas_height,
        sm.stage_position,
        sm.custom_stage_x,
        sm.custom_stage_y,
        sm.custom_stage_width,
        sm.custom_stage_height,
        sm.config AS seat_map_config
      FROM session_seats ss
      JOIN seats s ON s.id = ss.seat_id
      JOIN seat_maps sm ON sm.id = s.seat_map_id
      LEFT JOIN seat_types st ON st.id = s.seat_type_id
      LEFT JOIN seat_zones sz ON sz.id = s.zone_id
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(DISTINCT tts_all.ticket_type_id) AS ticket_type_ids
        FROM ticket_type_seats tts_all
        JOIN ticket_types tt_all ON tt_all.id = tts_all.ticket_type_id
        WHERE tts_all.seat_id = s.id
          AND tt_all.event_session_id = ss.event_session_id
      ) seat_ticket_types ON true
      ${ticketTypeJoin}
      WHERE ss.event_session_id = $1
        ${ticketTypeWhere}
      ORDER BY s.row_label ASC, s.seat_number ASC
      `,
      params,
    );
    return rows;
  }

  async checkTicketAvailability(eventId, items) {
    const params = [
      eventId,
      JSON.stringify(
        items.map((item) => ({
          ticket_type_id: item.ticket_type_id,
          quantity: Number(item.quantity),
          session_seat_ids: item.session_seat_ids || [],
        })),
      ),
    ];

    const { rows } = await db.query(
      `
      WITH requested AS (
        SELECT
          (item->>'ticket_type_id')::uuid AS ticket_type_id,
          (item->>'quantity')::int AS quantity,
          COALESCE(
            ARRAY(
              SELECT seat_value::uuid
              FROM jsonb_array_elements_text(COALESCE(item->'session_seat_ids', '[]'::jsonb)) AS selected_seat_value(seat_value)
            ),
            ARRAY[]::uuid[]
          ) AS session_seat_ids
        FROM jsonb_array_elements($2::jsonb) AS item
      ),
      ticket_info AS (
        SELECT
          r.ticket_type_id,
          r.quantity AS requested_quantity,
          COALESCE(r.session_seat_ids, ARRAY[]::uuid[]) AS session_seat_ids,
          tt.name,
          tt.quantity AS total_quantity,
          tt.max_per_order,
          tt.sale_start,
          tt.sale_end,
          tt.is_seated,
          tt.event_session_id,
          es.status AS session_status,
          es.start_time AS session_start_time,
          es.end_time AS session_end_time,
          $1::uuid AS requested_event_id,
          e.id AS event_id,
          COALESCE((SELECT MIN(es_all.start_time) FROM event_sessions es_all WHERE es_all.event_id = e.id), e.start_time) AS event_start_time,
          COALESCE((SELECT MAX(es_all.end_time) FROM event_sessions es_all WHERE es_all.event_id = e.id), e.end_time) AS event_end_time,
          e.status AS event_status,
          e.visibility,
          e.approval_status,
          e.deleted_at,
          e.seating_rules
        FROM requested r
        LEFT JOIN ticket_types tt ON tt.id = r.ticket_type_id
        LEFT JOIN event_sessions es ON es.id = tt.event_session_id
        LEFT JOIN events e ON e.id = es.event_id
      ),
      unseated_usage AS (
        SELECT
          ti.ticket_type_id,
          COALESCE(SUM(oi.quantity) FILTER (WHERE o.status = 'PAID'), 0)::int AS sold_quantity,
          COALESCE((
            SELECT SUM(th.quantity)::int
            FROM ticket_holds th
            WHERE th.ticket_type_id = ti.ticket_type_id
              AND th.status = 'ACTIVE'
              AND th.expires_at > now()
          ), 0) AS active_hold_quantity
        FROM ticket_info ti
        LEFT JOIN order_items oi ON oi.ticket_type_id = ti.ticket_type_id
        LEFT JOIN orders o ON o.id = oi.order_id
        GROUP BY ti.ticket_type_id
      ),
      selected_seats AS (
        SELECT
          ti.ticket_type_id,
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
          ss.held_by,
          s.is_disabled,
          s.row_label,
          s.seat_number,
          s.x_position,
          s.y_position,
          EXISTS (SELECT 1 FROM ticket_type_seats tts_any WHERE tts_any.ticket_type_id = ti.ticket_type_id) AS requires_mapping,
          EXISTS (
            SELECT 1
            FROM ticket_type_seats tts
            WHERE tts.ticket_type_id = ti.ticket_type_id
              AND tts.seat_id = s.id
          ) AS has_mapping
        FROM ticket_info ti
        LEFT JOIN LATERAL unnest(ti.session_seat_ids) AS selected_seat(session_seat_id) ON true
        LEFT JOIN session_seats ss
          ON ss.id = selected_seat.session_seat_id
         AND ss.event_session_id = ti.event_session_id
        LEFT JOIN seats s ON s.id = ss.seat_id
        WHERE ti.is_seated = true OR cardinality(ti.session_seat_ids) > 0
      )
      SELECT
        ti.*,
        (ti.total_quantity - COALESCE(uu.sold_quantity, 0) - COALESCE(uu.active_hold_quantity, 0))::int AS available_quantity,
        COALESCE(
          json_agg(
            json_build_object(
              'session_seat_id', selected_seats.session_seat_id,
              'label', concat(COALESCE(selected_seats.row_label, ''), COALESCE(selected_seats.seat_number, '')),
              'status', selected_seats.status,
              'held_until', selected_seats.held_until,
              'held_by', selected_seats.held_by,
              'is_disabled', selected_seats.is_disabled,
              'row_label', selected_seats.row_label,
              'seat_number', selected_seats.seat_number,
              'x_position', selected_seats.x_position,
              'y_position', selected_seats.y_position,
              'requires_mapping', selected_seats.requires_mapping,
              'has_mapping', selected_seats.has_mapping
            )
          ) FILTER (WHERE selected_seats.session_seat_id IS NOT NULL),
          '[]'::json
        ) AS selected_seats
      FROM ticket_info ti
      LEFT JOIN unseated_usage uu ON uu.ticket_type_id = ti.ticket_type_id
      LEFT JOIN selected_seats ON selected_seats.ticket_type_id = ti.ticket_type_id
      GROUP BY
        ti.ticket_type_id,
        ti.requested_quantity,
        ti.session_seat_ids,
        ti.name,
        ti.total_quantity,
        ti.max_per_order,
        ti.sale_start,
        ti.sale_end,
        ti.is_seated,
        ti.event_session_id,
        ti.session_status,
        ti.session_start_time,
        ti.session_end_time,
        ti.requested_event_id,
        ti.event_id,
        ti.event_start_time,
        ti.event_end_time,
        ti.event_status,
        ti.visibility,
        ti.approval_status,
        ti.deleted_at,
        ti.seating_rules,
        uu.sold_quantity,
        uu.active_hold_quantity
      `,
      params,
    );

    return rows;
  }


  async findEligibleSeatsForTicketType(ticketTypeId) {
    const { rows } = await db.query(
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
        s.is_disabled,
        EXISTS (
          SELECT 1 FROM ticket_type_seats tts_any WHERE tts_any.ticket_type_id = $1
        ) AS requires_mapping,
        tts.ticket_type_id AS mapped_ticket_type_id
      FROM ticket_types tt
      JOIN event_sessions es ON es.id = tt.event_session_id
      JOIN session_seats ss ON ss.event_session_id = es.id
      JOIN seats s ON s.id = ss.seat_id
      LEFT JOIN ticket_type_seats tts ON tts.seat_id = s.id AND tts.ticket_type_id = tt.id
      WHERE tt.id = $1
        AND (
          NOT EXISTS (SELECT 1 FROM ticket_type_seats WHERE ticket_type_id = tt.id)
          OR tts.ticket_type_id IS NOT NULL
        )
      ORDER BY s.row_label ASC, s.seat_number ASC
      `,
      [ticketTypeId],
    );
    return rows;
  }
  async expireStandaloneSeatHolds(client = db) {
    await client.query(
      `
      WITH expired AS (
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
      FROM expired e
      WHERE ss.id = e.session_seat_id
        AND ss.status = 'HELD'
        AND ss.order_id IS NULL
        AND ss.held_until <= now()
      `,
    );
  }

  async countPaidTicketsForEvent({ userId, eventId, email = null, phone = null }) {
    const params = [eventId, userId, email, phone];
    const { rows } = await db.query(
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
          OR ($3::text IS NOT NULL AND lower(o.buyer_email) = lower($3::text))
          OR ($4::text IS NOT NULL AND o.buyer_phone = $4::text)
        )
      `,
      params,
    );
    return Number(rows[0]?.quantity || 0);
  }

  async holdSeats(userId, payload) {
    const client = await db.getClient();
    const requestedSeatIds = payload.items.flatMap((item) => item.session_seat_ids || []);

    try {
      await client.query('BEGIN');
      await this.expireStandaloneSeatHolds(client);

      await client.query(
        `
        UPDATE ticket_holds th
        SET status = 'CANCELLED', updated_at = now()
        FROM ticket_types tt
        JOIN event_sessions es ON es.id = tt.event_session_id
        WHERE th.ticket_type_id = tt.id
          AND es.event_id = $1
          AND th.user_id = $2
          AND th.order_id IS NULL
          AND th.status = 'ACTIVE'
          AND (array_length($3::uuid[], 1) IS NULL OR th.session_seat_id <> ALL($3::uuid[]))
        `,
        [payload.event_id, userId, requestedSeatIds],
      );

      await client.query(
        `
        UPDATE session_seats ss
        SET status = 'AVAILABLE', held_by = NULL, held_until = NULL, order_id = NULL
        FROM event_sessions es
        WHERE ss.event_session_id = es.id
          AND es.event_id = $1
          AND ss.held_by = $2
          AND ss.order_id IS NULL
          AND ss.status = 'HELD'
          AND (array_length($3::uuid[], 1) IS NULL OR ss.id <> ALL($3::uuid[]))
        `,
        [payload.event_id, userId, requestedSeatIds],
      );

      if (requestedSeatIds.length === 0) {
        await client.query('COMMIT');
        return { hold_expires_at: null, hold_minutes: HOLD_MINUTES, seats: [] };
      }

      const expiresAtResult = await client.query(
        `SELECT now() + ($1::text || ' minutes')::interval AS expired_at`,
        [HOLD_MINUTES],
      );
      const expiresAt = expiresAtResult.rows[0].expired_at;
      const ticketTypeIds = [...new Set(payload.items.map((item) => item.ticket_type_id))];
      const ticketTypesResult = await client.query(
        `
        SELECT
          tt.id, tt.event_session_id, tt.name, tt.max_per_order, tt.sale_start, tt.sale_end, tt.is_seated,
          es.status AS session_status, es.end_time AS session_end_time,
          e.id AS event_id, e.end_time AS event_end_time, e.status AS event_status, e.visibility,
          e.approval_status, e.deleted_at
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
      const now = Date.now();
      const heldSeats = [];

      for (const item of payload.items) {
        const ticketType = ticketTypeMap.get(item.ticket_type_id);
        const selectedSeatIds = item.session_seat_ids || [];

        if (
          !ticketType ||
          ticketType.event_id !== payload.event_id ||
          ticketType.deleted_at ||
          ticketType.event_status !== 'PUBLISHED' ||
          ticketType.visibility !== 'PUBLIC' ||
          ticketType.approval_status !== 'APPROVED' ||
          ticketType.session_status !== 'UPCOMING'
        ) {
          throw new AppError('S\u1ef1 ki\u1ec7n hi\u1ec7n kh\u00f4ng kh\u1ea3 d\u1ee5ng \u0111\u1ec3 \u0111\u1eb7t v\u00e9.', 400, ErrorCodes.ORDER_INVALID_ITEMS);
        }

        const eventEnd = ticketType.event_end_time ? new Date(ticketType.event_end_time).getTime() : null;
        const sessionEnd = ticketType.session_end_time ? new Date(ticketType.session_end_time).getTime() : null;
        const saleStart = ticketType.sale_start ? new Date(ticketType.sale_start).getTime() : null;
        const saleEnd = ticketType.sale_end ? new Date(ticketType.sale_end).getTime() : null;
        if ((eventEnd && eventEnd < now) || (sessionEnd && sessionEnd < now)) {
          throw new AppError('S\u1ef1 ki\u1ec7n ho\u1eb7c su\u1ea5t di\u1ec5n \u0111\u00e3 k\u1ebft th\u00fac, kh\u00f4ng th\u1ec3 b\u00e1n v\u00e9.', 400, ErrorCodes.ORDER_TICKET_SALE_CLOSED);
        }
        if ((saleStart && saleStart > now) || (saleEnd && saleEnd < now)) {
          throw new AppError(`V\u00e9 "${ticketType.name}" hi\u1ec7n ch\u01b0a m\u1edf b\u00e1n ho\u1eb7c \u0111\u00e3 ng\u1eebng b\u00e1n.`, 400, ErrorCodes.ORDER_TICKET_SALE_CLOSED);
        }
        if (selectedSeatIds.length !== Number(item.quantity)) {
          throw new AppError('Số ghế đã chọn không khớp với số lượng vé.', 400, ErrorCodes.ORDER_INVALID_ITEMS);
        }
        if (Number(item.quantity) > Math.min(Number(ticketType.max_per_order || 4), 4)) {
          throw new AppError('Bạn chỉ được phép mua tối đa 4 vé trên một đơn hàng.', 400, ErrorCodes.ORDER_INVALID_ITEMS);
        }

        const hasSeatMapping = await client.query(
          'SELECT EXISTS (SELECT 1 FROM ticket_type_seats WHERE ticket_type_id = $1) AS has_mapping',
          [item.ticket_type_id],
        );
        const requiresMapping = Boolean(hasSeatMapping.rows[0]?.has_mapping);

        const seatsResult = await client.query(
          `
          SELECT
            ss.id, ss.status, ss.held_by, ss.held_until, ss.order_id,
            s.is_disabled, s.row_label, s.seat_number,
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
          LEFT JOIN ticket_type_seats tts ON tts.seat_id = s.id AND tts.ticket_type_id = $2
          WHERE ss.id = ANY($1::uuid[])
            AND ss.event_session_id = $3
          FOR UPDATE OF ss
          `,
          [selectedSeatIds, item.ticket_type_id, ticketType.event_session_id],
        );

        if (seatsResult.rows.length !== selectedSeatIds.length) {
          throw new AppError('M\u1ed9t ho\u1eb7c nhi\u1ec1u gh\u1ebf \u0111\u00e3 ch\u1ecdn kh\u00f4ng h\u1ee3p l\u1ec7.', 400, ErrorCodes.ORDER_INVALID_ITEMS);
        }

        for (const seat of seatsResult.rows) {
          const heldByOther =
            seat.status === 'HELD' &&
            seat.held_until &&
            new Date(seat.held_until).getTime() > now &&
            String(seat.held_by) !== String(userId);

          if (
            seat.is_disabled ||
            seat.has_paid_ticket ||
            seat.status === 'SOLD' ||
            heldByOther ||
            (requiresMapping && !seat.mapped_ticket_type_id)
          ) {
            throw new AppError('Rất tiếc, ghế bạn chọn vừa có người đặt. Vui lòng chọn ghế khác.', 409, ErrorCodes.ORDER_TICKET_UNAVAILABLE);
          }

          await client.query(
            `
            UPDATE session_seats
            SET status = 'HELD', held_by = $2, held_until = $3, order_id = NULL
            WHERE id = $1
            `,
            [seat.id, userId, expiresAt],
          );

          await client.query(
            `
            UPDATE ticket_holds
            SET status = 'CANCELLED', updated_at = now()
            WHERE user_id = $1
              AND ticket_type_id = $2
              AND session_seat_id = $3
              AND order_id IS NULL
              AND status = 'ACTIVE'
            `,
            [userId, item.ticket_type_id, seat.id],
          );

          await client.query(
            `
            INSERT INTO ticket_holds (user_id, ticket_type_id, session_seat_id, quantity, order_id, expires_at, status)
            VALUES ($1, $2, $3, 1, NULL, $4, 'ACTIVE')
            `,
            [userId, item.ticket_type_id, seat.id, expiresAt],
          );

          heldSeats.push({
            session_seat_id: seat.id,
            label: `${seat.row_label || ''}${seat.seat_number || ''}`,
            ticket_type_id: item.ticket_type_id,
          });
        }
      }

      await client.query('COMMIT');
      return { hold_expires_at: expiresAt, hold_minutes: HOLD_MINUTES, seats: heldSeats };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async releaseSeatHolds(userId, payload) {
    const client = await db.getClient();
    const seatIds = payload.session_seat_ids || [];
    try {
      await client.query('BEGIN');
      await this.expireStandaloneSeatHolds(client);
      await client.query(
        `
        UPDATE ticket_holds th
        SET status = 'CANCELLED', updated_at = now()
        FROM ticket_types tt
        JOIN event_sessions es ON es.id = tt.event_session_id
        WHERE th.ticket_type_id = tt.id
          AND es.event_id = $1
          AND th.user_id = $2
          AND th.order_id IS NULL
          AND th.status = 'ACTIVE'
          AND (array_length($3::uuid[], 1) IS NULL OR th.session_seat_id = ANY($3::uuid[]))
        `,
        [payload.event_id, userId, seatIds],
      );
      const releasedResult = await client.query(
        `
        UPDATE session_seats ss
        SET status = 'AVAILABLE', held_by = NULL, held_until = NULL, order_id = NULL
        FROM event_sessions es
        WHERE ss.event_session_id = es.id
          AND es.event_id = $1
          AND ss.held_by = $2
          AND ss.order_id IS NULL
          AND ss.status = 'HELD'
          AND (array_length($3::uuid[], 1) IS NULL OR ss.id = ANY($3::uuid[]))
        RETURNING ss.id
        `,
        [payload.event_id, userId, seatIds],
      );
      await client.query('COMMIT');
      return { released_count: releasedResult.rowCount };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async findFavoriteEvents(userId) {
    const query = `
      SELECT ${EVENT_CARD_SELECT}, fe.created_at AS favorited_at
      FROM favorite_events fe
      JOIN events e ON e.id = fe.event_id
      ${EVENT_CARD_JOINS}
      WHERE fe.user_id = $1 AND ${PUBLIC_EVENT_WHERE}
      ORDER BY fe.created_at DESC
    `;
    const { rows } = await db.query(query, [userId]);
    return rows;
  }

  async findFavorite(userId, eventId) {
    const { rows } = await db.query(
      'SELECT user_id, event_id FROM favorite_events WHERE user_id = $1 AND event_id = $2',
      [userId, eventId],
    );
    return rows[0];
  }

  async createFavorite(userId, eventId) {
    const { rows } = await db.query(
      `INSERT INTO favorite_events (user_id, event_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, event_id) DO NOTHING
       RETURNING user_id, event_id, created_at`,
      [userId, eventId],
    );
    return rows[0];
  }

  async deleteFavorite(userId, eventId) {
    const { rowCount } = await db.query(
      'DELETE FROM favorite_events WHERE user_id = $1 AND event_id = $2',
      [userId, eventId],
    );
    return rowCount > 0;
  }

  async findByOrganizer(userId) {
    try {
      if (!userId) {
        console.error('findByOrganizer: userId is undefined');
        return [];
      }

      // 1. Get user roles to see if they are admin/staff
      const roleQuery = `
        SELECT r.name
        FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = $1
      `;
      const { rows: roles } = await db.query(roleQuery, [userId]);
      const isAdmin = roles.some(r => r.name === 'ADMIN' || r.name === 'STAFF');

      // 2. Find the organizer record for this user
      const organizer = await this.findOrganizerByUserId(userId);

      let query;
      let params;

      if (isAdmin) {
        // Admins can see all events for management
        query = `
          SELECT e.id, e.title, e.slug, e.status, e.start_time, e.end_time
          FROM events e
          WHERE e.deleted_at IS NULL
          ORDER BY e.created_at DESC
        `;
        params = [];
      } else if (organizer) {
        // Organizers see their own events.
        query = `
          SELECT e.id, e.title, e.slug, e.status, e.start_time, e.end_time
          FROM events e
          LEFT JOIN organizers o ON o.id = e.organizer_id
          WHERE (e.organizer_id = $1 OR o.user_id = $2)
            AND e.deleted_at IS NULL
          ORDER BY e.created_at DESC
        `;
        params = [organizer.id, userId];
      } else {
        // Last resort: just try to match user_id directly
        query = `
          SELECT e.id, e.title, e.slug, e.status, e.start_time, e.end_time
          FROM events e
          WHERE e.organizer_id::text = $1
            AND e.deleted_at IS NULL
          ORDER BY e.created_at DESC
        `;
        params = [userId];
      }

      const { rows } = await db.query(query, params);
      return rows;
    } catch (error) {
      console.error('Error in findByOrganizer:', error);
      throw error;
    }
  }

  async findOrganizerByUserId(userId) {
    const { rows } = await db.query(
      `
      SELECT id, user_id, organization_name, status
      FROM organizers
      WHERE user_id = $1
      LIMIT 1
      `,
      [userId],
    );
    return rows[0];
  }
}

module.exports = new EventsRepository();
