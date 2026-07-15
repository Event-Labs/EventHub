const db = require('../../infrastructure/database/db.client');

function slugify(title) {
  const base = String(title || 'event')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200);
  return `${base || 'event'}-${Date.now().toString(36)}`;
}

const ORGANIZER_REQUEST_SELECT = `
  r.id,
  r.user_id,
  r.request_type,
  r.organization_name,
  r.organization_description,
  r.business_email,
  r.business_email_verified,
  r.business_email_verified_at,
  r.business_phone,
  r.organization_avatar_url,
  r.tax_code,
  r.legal_document_url,
  r.business_license_url,
  r.legal_representative_name,
  r.legal_representative_position,
  r.legal_representative_id_url,
  r.authorization_letter_url,
  r.individual_full_name,
  r.individual_identity_number,
  r.individual_id_front_url,
  r.individual_id_back_url,
  r.individual_selfie_url,
  r.individual_tax_code,
  r.terms_accepted,
  r.terms_accepted_at,
  r.status,
  r.review_note,
  r.reviewed_by,
  r.created_at,
  r.reviewed_at,
  r.updated_at
`;

class OrganizerEventsRepository {
  async ensureRequireAttendeeInfoColumn(client = db) {
    await client.query('ALTER TABLE events ADD COLUMN IF NOT EXISTS require_attendee_info BOOLEAN NOT NULL DEFAULT FALSE');
  }

  async findOrganizerByUserId(userId) {
    const { rows } = await db.query(
      `
      SELECT *
      FROM organizers
      WHERE user_id = $1
        AND status = 'ACTIVE'
      LIMIT 1
      `,
      [userId],
    );
    return rows[0];
  }

  async findProfileRequests(userId, organizer) {
    const { rows } = await db.query(
      `
      SELECT ${ORGANIZER_REQUEST_SELECT}
      FROM organizer_requests r
      WHERE r.user_id = $1
        OR (
          $2::text IS NOT NULL
          AND r.request_type = 'ORGANIZATION'
          AND lower(r.business_email) = lower($2::text)
        )
      ORDER BY r.created_at ASC
      `,
      [userId, organizer?.business_email || null],
    );
    return rows;
  }

  async updateOrganizerProfileByUserId(userId, updates) {
    const allowedFields = ['description', 'website_url', 'social_url'];
    const { rows: columnRows } = await db.query(
      `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'organizers'
        AND column_name = ANY($1::text[])
      `,
      [allowedFields],
    );
    const existingColumns = new Set(columnRows.map((row) => row.column_name));
    const setClauses = [];
    const values = [userId];

    allowedFields.forEach((field) => {
      if (existingColumns.has(field) && updates[field] !== undefined) {
        values.push(updates[field]);
        setClauses.push(`${field} = $${values.length}`);
      }
    });

    if (!setClauses.length) {
      return this.findOrganizerByUserId(userId);
    }

    setClauses.push('updated_at = NOW()');

    const { rows } = await db.query(
      `
      UPDATE organizers
      SET ${setClauses.join(', ')}
      WHERE user_id = $1
        AND status = 'ACTIVE'
      RETURNING *
      `,
      values,
    );
    return rows[0];
  }

  async findVenueById(venueId, organizerId) {
    const { rows } = await db.query(
      `
      SELECT id, name, organizer_id
      FROM venues
      WHERE id = $1
        AND deleted_at IS NULL
        AND (organizer_id = $2 OR organizer_id IS NULL)
      LIMIT 1
      `,
      [venueId, organizerId],
    );
    return rows[0];
  }

  async findVenuesByOrganizer(organizerId) {
    const { rows } = await db.query(
      `
      SELECT
        v.id,
        v.name,
        v.country,
        v.city,
        v.district,
        v.ward,
        v.address_line,
        v.latitude,
        v.longitude,
        v.description,
        (
          SELECT COUNT(*)::int
          FROM seats s
          JOIN seat_maps sm ON sm.id = s.seat_map_id
          WHERE sm.venue_id = v.id AND COALESCE(s.is_disabled, false) = false
        ) AS seat_count
      FROM venues v
      WHERE (v.organizer_id = $1 OR v.organizer_id IS NULL)
        AND v.deleted_at IS NULL
      ORDER BY v.name ASC
      `,
      [organizerId],
    );
    return rows;
  }

  async findEventsByOrganizer(organizerId) {
    const { rows } = await db.query(
      `
      SELECT
        e.id,
        e.title,
        e.slug,
        e.short_description,
        e.thumbnail_url,
        e.banner_url,
        e.format,
        e.tags,
        e.visibility,
        e.status,
        e.approval_status,
        e.start_time,
        e.end_time,
        e.category_id,
        c.name AS category_name,
        e.created_at,
        e.updated_at
      FROM events e
      LEFT JOIN event_categories c ON c.id = e.category_id
      WHERE e.organizer_id = $1 AND e.deleted_at IS NULL
      ORDER BY e.updated_at DESC
      `,
      [organizerId],
    );
    return rows;
  }

  async findEventById(eventId, organizerId) {
    const { rows } = await db.query(
      `
      SELECT
        e.*,
        c.name AS category_name,
        c.slug AS category_slug,
        COALESCE(sessions.sessions, '[]'::json) AS sessions,
        COALESCE(ticket_types.ticket_types, '[]'::json) AS ticket_types
      FROM events e
      LEFT JOIN event_categories c ON c.id = e.category_id
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object(
          'id', es.id,
          'session_name', es.session_name,
          'start_time', es.start_time,
          'end_time', es.end_time,
          'venue_id', es.venue_id,
          'seat_map_id', es.seat_map_id,
          'checkin_start_time', es.checkin_start_time,
          'status', es.status,
          'venue', json_build_object(
            'id', v.id,
            'name', v.name,
            'city', v.city,
            'district', v.district,
            'address_line', v.address_line
          )
        ) ORDER BY es.start_time ASC) AS sessions
        FROM event_sessions es
        LEFT JOIN venues v ON v.id = es.venue_id
        WHERE es.event_id = e.id
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
          'is_seated', tt.is_seated,
          'zone_id', (
            SELECT s.zone_id
            FROM ticket_type_seats tts
            JOIN seats s ON s.id = tts.seat_id
            WHERE tts.ticket_type_id = tt.id
            LIMIT 1
          )
        ) ORDER BY tt.price ASC) AS ticket_types
        FROM event_sessions es_tt
        JOIN ticket_types tt ON tt.event_session_id = es_tt.id
        WHERE es_tt.event_id = e.id
      ) ticket_types ON true
      WHERE e.id = $1 AND e.organizer_id = $2 AND e.deleted_at IS NULL
      LIMIT 1
      `,
      [eventId, organizerId],
    );
    return rows[0];
  }

  async createEvent(organizerId, data) {
    await this.ensureRequireAttendeeInfoColumn();
    const now = new Date();
    const startTime = data.start_time || new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const endTime = data.end_time || new Date(startTime.getTime() + 3 * 60 * 60 * 1000);
    const slug = data.slug || slugify(data.title);
    const categoryId = data.category_id || null;

    const { rows } = await db.query(
      `
      INSERT INTO events (
        organizer_id,
        category_id,
        title,
        slug,
        short_description,
        description,
        banner_url,
        thumbnail_url,
        start_time,
        end_time,
        status,
        visibility,
        format,
        tags,
        seating_rules,
        refund_policy,
        additional_terms,
        require_attendee_info
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'DRAFT', $11, $12, $13, $14, $15, $16, $17)
      RETURNING *
      `,
      [
        organizerId,
        categoryId,
        data.title,
        slug,
        data.short_description || null,
        data.description || null,
        data.banner_url || null,
        data.thumbnail_url || null,
        startTime,
        endTime,
        data.visibility || 'PUBLIC',
        data.format || 'OFFLINE',
        data.tags || [],
        data.seating_rules || {},
        data.refund_policy || {},
        data.additional_terms || null,
        Boolean(data.require_attendee_info),
      ],
    );
    return rows[0];
  }

  async updateEvent(eventId, organizerId, data) {
    await this.ensureRequireAttendeeInfoColumn();
    const fields = [];
    const values = [];
    let idx = 1;

    const allowed = [
      'category_id',
      'title',
      'short_description',
      'description',
      'banner_url',
      'thumbnail_url',
      'start_time',
      'end_time',
      'visibility',
      'format',
      'tags',
      'seating_rules',
      'refund_policy',
      'additional_terms',
      'require_attendee_info',
    ];

    allowed.forEach((key) => {
      if (data[key] !== undefined) {
        fields.push(`${key} = $${idx}`);
        if (key === 'category_id') {
          values.push(data[key] || null);
        } else {
          values.push(data[key]);
        }
        idx += 1;
      }
    });

    if (!fields.length) {
      return this.findEventById(eventId, organizerId);
    }

    values.push(eventId, organizerId);
    const { rows } = await db.query(
      `
      UPDATE events
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${idx} AND organizer_id = $${idx + 1} AND deleted_at IS NULL
      RETURNING *
      `,
      values,
    );
    return rows[0];
  }

  async submitEvent(eventId, organizerId) {
    const { rows } = await db.query(
      `
      UPDATE events
      SET status = 'PENDING_REVIEW', updated_at = NOW()
      WHERE id = $1 AND organizer_id = $2 AND deleted_at IS NULL
        AND status IN ('DRAFT', 'HIDDEN')
      RETURNING *
      `,
      [eventId, organizerId],
    );
    return rows[0];
  }

  async publishEvent(eventId, organizerId) {
    // Chỉ cho phép publish khi đã được Admin duyệt (status = COMPLETED, approval_status = APPROVED)
    const { rows } = await db.query(
      `
      UPDATE events
      SET status         = 'PUBLISHED',
          start_publish_at = COALESCE(start_publish_at, NOW()),
          updated_at     = NOW()
      WHERE id = $1
        AND organizer_id = $2
        AND deleted_at IS NULL
        AND status = 'COMPLETED'
        AND approval_status = 'APPROVED'
      RETURNING *
      `,
      [eventId, organizerId],
    );
    return rows[0];
  }

  /**
   * Đếm số đơn hàng đã thanh toán (PAID) của event.
   * Dùng để kiểm tra trước khi cho phép hủy.
   */
  async countPaidOrders(eventId) {
    const { rows } = await db.query(
      `
      SELECT COUNT(DISTINCT o.id)::int AS total
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN ticket_types tt ON tt.id = oi.ticket_type_id
      JOIN event_sessions es ON es.id = tt.event_session_id
      WHERE es.event_id = $1
        AND o.status = 'PAID'
      `,
      [eventId],
    );
    return rows[0]?.total ?? 0;
  }

  /**
   * Hủy event — chỉ cho phép khi status = PUBLISHED hoặc COMPLETED (đã duyệt nhưng chưa public).
   * Không được hủy nếu đã có đơn PAID.
   */
  async cancelEvent(eventId, organizerId) {
    const { rows } = await db.query(
      `
      UPDATE events
      SET status     = 'CANCELLED',
          updated_at = NOW()
      WHERE id = $1
        AND organizer_id = $2
        AND deleted_at IS NULL
        AND status IN ('PUBLISHED', 'COMPLETED')
      RETURNING id, title, status, approval_status, organizer_id
      `,
      [eventId, organizerId],
    );
    return rows[0] ?? null;
  }

  async createSession(eventId, data) {
    const { rows } = await db.query(
      `
      INSERT INTO event_sessions (
        event_id,
        venue_id,
        seat_map_id,
        session_name,
        start_time,
        end_time,
        checkin_start_time
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
      `,
      [
        eventId,
        data.venue_id,
        data.seat_map_id || null,
        data.session_name || null,
        data.start_time,
        data.end_time,
        data.checkin_start_time || null,
      ],
    );
    return rows[0];
  }

  async updateSession(sessionId, eventId, data) {
    const fields = [];
    const values = [];
    let idx = 1;

    ['venue_id', 'seat_map_id', 'session_name', 'start_time', 'end_time', 'checkin_start_time'].forEach((key) => {
      if (data[key] !== undefined) {
        fields.push(`${key} = $${idx}`);
        values.push(data[key]);
        idx += 1;
      }
    });

    if (!fields.length) return null;

    values.push(sessionId, eventId);
    const { rows } = await db.query(
      `
      UPDATE event_sessions
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${idx} AND event_id = $${idx + 1}
      RETURNING *
      `,
      values,
    );
    return rows[0];
  }

  async deleteSession(sessionId, eventId) {
    const { rowCount } = await db.query(
      'DELETE FROM event_sessions WHERE id = $1 AND event_id = $2',
      [sessionId, eventId],
    );
    return rowCount > 0;
  }

  async findSession(eventId, sessionId) {
    const { rows } = await db.query(
      'SELECT * FROM event_sessions WHERE id = $1 AND event_id = $2',
      [sessionId, eventId],
    );
    return rows[0];
  }

  async syncEventTimesFromSessions(eventId) {
    await db.query(
      `
      UPDATE events e
      SET
        start_time = sub.min_start,
        end_time = sub.max_end,
        updated_at = NOW()
      FROM (
        SELECT MIN(start_time) AS min_start, MAX(end_time) AS max_end
        FROM event_sessions
        WHERE event_id = $1
      ) sub
      WHERE e.id = $1 AND sub.min_start IS NOT NULL
      `,
      [eventId],
    );
  }

  async createTicketType(sessionId, data) {
    const { rows } = await db.query(
      `
      INSERT INTO ticket_types (
        event_session_id,
        name,
        description,
        price,
        quantity,
        max_per_order,
        sale_start,
        sale_end,
        is_seated
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
      `,
      [
        sessionId,
        data.name,
        data.description || null,
        data.price,
        data.quantity,
        data.max_per_order || 10,
        data.sale_start || null,
        data.sale_end || null,
        data.is_seated !== undefined ? data.is_seated : true,
      ],
    );
    return rows[0];
  }

  async updateTicketType(ticketTypeId, sessionId, data) {
    const fields = [];
    const values = [];
    let idx = 1;

    ['name', 'description', 'price', 'quantity', 'max_per_order', 'sale_start', 'sale_end', 'is_seated'].forEach((key) => {
      if (data[key] !== undefined) {
        fields.push(`${key} = $${idx}`);
        values.push(data[key]);
        idx += 1;
      }
    });

    if (!fields.length) return null;

    values.push(ticketTypeId, sessionId);
    const { rows } = await db.query(
      `
      UPDATE ticket_types
      SET ${fields.join(', ')}
      WHERE id = $${idx} AND event_session_id = $${idx + 1}
      RETURNING *
      `,
      values,
    );
    return rows[0];
  }

  async deleteTicketType(ticketTypeId, sessionId) {
    const { rowCount } = await db.query(
      'DELETE FROM ticket_types WHERE id = $1 AND event_session_id = $2',
      [ticketTypeId, sessionId],
    );
    return rowCount > 0;
  }

  async findTicketType(sessionId, ticketTypeId) {
    const { rows } = await db.query(
      'SELECT * FROM ticket_types WHERE id = $1 AND event_session_id = $2',
      [ticketTypeId, sessionId],
    );
    return rows[0];
  }

  async assignZonesToTicketTypes(sessionId, assignments) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      await client.query(
        `
        DELETE FROM ticket_type_seats
        WHERE ticket_type_id IN (
          SELECT id FROM ticket_types WHERE event_session_id = $1
        )
        `,
        [sessionId],
      );

      await client.query(
        `
        DELETE FROM session_seats ss
        WHERE ss.event_session_id = $1
          AND ss.seat_id NOT IN (
            SELECT s.id
            FROM event_sessions es
            JOIN seats s ON s.seat_map_id = es.seat_map_id
            WHERE es.id = $1
          )
        `,
        [sessionId],
      );

      await client.query(
        `
        INSERT INTO session_seats (event_session_id, seat_id, status)
        SELECT $1, s.id, 'AVAILABLE'
        FROM event_sessions es
        JOIN seats s ON s.seat_map_id = es.seat_map_id
        WHERE es.id = $1
          AND COALESCE(s.is_disabled, false) = false
          AND NOT EXISTS (
            SELECT 1 FROM session_seats ss
            WHERE ss.event_session_id = $1 AND ss.seat_id = s.id
          )
        `,
        [sessionId],
      );

      for (const { zone_id: zoneId, ticket_type_id: ticketTypeId } of assignments) {
        await client.query(
          `
          INSERT INTO ticket_type_seats (ticket_type_id, seat_id)
          SELECT $1, s.id
          FROM seats s
          WHERE s.zone_id = $2
            AND s.seat_map_id = (
              SELECT seat_map_id FROM event_sessions WHERE id = $3
            )
            AND COALESCE(s.is_disabled, false) = false
            AND NOT EXISTS (
              SELECT 1 FROM ticket_type_seats tts
              WHERE tts.ticket_type_id = $1 AND tts.seat_id = s.id
            )
          `,
          [ticketTypeId, zoneId, sessionId],
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = new OrganizerEventsRepository();
