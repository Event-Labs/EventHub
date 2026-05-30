const db = require('../../infrastructure/database/db.client');

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
  e.start_time,
  e.end_time,
  e.created_at,
  c.id AS category_id,
  c.name AS category_name,
  c.slug AS category_slug,
  organizer.id AS organizer_id,
  organizer.full_name AS organizer_name,
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
  LEFT JOIN users organizer ON organizer.id = e.organizer_id
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
      OR organizer.full_name ILIKE ${keywordParam}
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

  if (filters.startDate) where.push(`e.start_time >= ${addParam(filters.startDate)}`);
  if (filters.endDate) where.push(`e.start_time <= ${addParam(filters.endDate)}`);

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
    start_time: 'e.start_time',
    created_at: 'e.created_at',
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
    const query = `
      SELECT
        ${EVENT_CARD_SELECT},
        e.description,
        json_build_object(
          'id', organizer.id,
          'full_name', organizer.full_name,
          'avatar_url', organizer.avatar_url
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
            'description', v.description
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
          'max_per_order', tt.max_per_order,
          'sale_start', tt.sale_start,
          'sale_end', tt.sale_end,
          'is_seated', tt.is_seated
        ) ORDER BY tt.price ASC) AS ticket_types
        FROM event_sessions es_tt
        JOIN ticket_types tt ON tt.event_session_id = es_tt.id
        WHERE es_tt.event_id = e.id
      ) ticket_types ON true
      WHERE ${PUBLIC_EVENT_WHERE}
        AND (e.id::text = $2 OR e.slug = $2)
      LIMIT 1
    `;
    const { rows } = await db.query(query, [userId, identifier]);
    return rows[0];
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
}

module.exports = new EventsRepository();
