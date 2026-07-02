const db = require('../../infrastructure/database/db.client');
const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');

class PromotionsRepository {
  constructor() {
    this.schemaReady = false;
  }

  async ensureSupportSchema(client = db) {
    if (this.schemaReady) return;
    await client.query('ALTER TABLE promo_codes ALTER COLUMN event_id DROP NOT NULL');
    await client.query(`
      CREATE TABLE IF NOT EXISTS promo_code_events (
        promo_code_id UUID NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
        event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT now(),
        PRIMARY KEY (promo_code_id, event_id)
      )
    `);
    if (client === db) {
      this.schemaReady = true;
    }
  }

  _selectFields(linkedEventAlias = 'linked_event') {
    return `
      pc.*,
      COALESCE(cardinality(pce.event_ids), 0) AS event_count,
      COALESCE(pce.event_ids, ARRAY[]::uuid[]) AS event_ids,
      CASE
        WHEN pc.event_id IS NULL AND COALESCE(cardinality(pce.event_ids), 0) = 0 THEN true
        ELSE false
      END AS "applyToAllEvents",
      CASE
        WHEN pc.event_id IS NULL AND COALESCE(cardinality(pce.event_ids), 0) = 0 THEN NULL
        WHEN pce.event_names IS NOT NULL THEN pce.event_names
        ELSE ${linkedEventAlias}.title
      END AS event_name,
      (SELECT COUNT(*) FROM promo_code_usages pcu WHERE pcu.promo_code_id = pc.id) AS usage_count
    `;
  }

  _eventJoins(linkedEventAlias = 'linked_event') {
    return `
      LEFT JOIN events ${linkedEventAlias} ON pc.event_id = ${linkedEventAlias}.id
      LEFT JOIN LATERAL (
        SELECT
          array_agg(pce.event_id ORDER BY ev.title ASC) AS event_ids,
          string_agg(ev.title, ', ' ORDER BY ev.title ASC) AS event_names
        FROM promo_code_events pce
        JOIN events ev ON ev.id = pce.event_id
        WHERE pce.promo_code_id = pc.id
      ) pce ON true
    `;
  }

  _mapRow(row) {
    if (!row) return row;
    const eventIds = Array.isArray(row.event_ids)
      ? row.event_ids
      : row.event_id
        ? [row.event_id]
        : [];
    return {
      ...row,
      eventIds,
      applyToAllEvents: Boolean(row.applyToAllEvents),
      maxDiscountAmount: row.max_discount,
      maximumDiscountAmount: row.max_discount,
    };
  }

  async findAllByOrganizer(organizerId, filters = {}) {
    await this.ensureSupportSchema();
    const params = [organizerId];
    let query = `
      SELECT
        ${this._selectFields()}
      FROM promo_codes pc
      ${this._eventJoins()}
      WHERE pc.organizer_id = $1
    `;

    if (filters.keyword) {
      params.push(`%${filters.keyword}%`);
      query += ` AND (pc.code ILIKE $${params.length} OR linked_event.title ILIKE $${params.length} OR pce.event_names ILIKE $${params.length})`;
    }

    if (filters.status && filters.status !== 'All Statuses') {
      const now = new Date();
      params.push(now);
      const nowIdx = `$${params.length}`;
      
      switch (filters.status) {
        case 'Active':
          query += ` AND pc.is_active = true AND pc.start_time <= ${nowIdx} AND pc.end_time >= ${nowIdx} AND (pc.usage_limit IS NULL OR pc.used_count < pc.usage_limit)`;
          break;
        case 'Scheduled':
          query += ` AND pc.is_active = true AND pc.start_time > ${nowIdx}`;
          break;
        case 'Expired':
          query += ` AND pc.is_active = true AND (pc.end_time < ${nowIdx} OR (pc.usage_limit IS NOT NULL AND pc.used_count >= pc.usage_limit))`;
          break;
        case 'Inactive':
          query += ` AND pc.is_active = false`;
          break;
      }
    }

    query += ' ORDER BY pc.start_time DESC';

    const { rows } = await db.query(query, params);
    return rows.map((row) => this._mapRow(row));
  }

  async findById(id) {
    await this.ensureSupportSchema();
    const query = `
      SELECT
        ${this._selectFields()}
      FROM promo_codes pc
      ${this._eventJoins()}
      WHERE pc.id = $1
    `;
    const { rows } = await db.query(query, [id]);
    return this._mapRow(rows[0]);
  }

  async findAvailableForPublicEvent(eventId) {
    await this.ensureSupportSchema();
    const query = `
      SELECT
        ${this._selectFields('linked_event')}
      FROM events e
      JOIN promo_codes pc ON pc.organizer_id = e.organizer_id
      ${this._eventJoins('linked_event')}
      WHERE e.id = $1
        AND e.status = 'PUBLISHED'
        AND e.visibility = 'PUBLIC'
        AND e.approval_status = 'APPROVED'
        AND e.deleted_at IS NULL
        AND pc.is_active = true
        AND (
          EXISTS (
            SELECT 1
            FROM promo_code_events pce_match
            WHERE pce_match.promo_code_id = pc.id
              AND pce_match.event_id = e.id
          )
          OR pc.event_id = e.id
          OR (
            pc.event_id IS NULL
            AND NOT EXISTS (
              SELECT 1
              FROM promo_code_events pce_any
              WHERE pce_any.promo_code_id = pc.id
            )
          )
        )
        AND (pc.start_time IS NULL OR pc.start_time <= now())
        AND (pc.end_time IS NULL OR pc.end_time >= now())
        AND (pc.usage_limit IS NULL OR pc.used_count < pc.usage_limit)
      ORDER BY pc.discount_value DESC, pc.end_time ASC
    `;
    const { rows } = await db.query(query, [eventId]);
    return rows.map((row) => this._mapRow(row));
  }

  async create(data) {
    await this.ensureSupportSchema();
    const {
      organizer_id,
      event_id,
      eventIds = [],
      code,
      discount_type,
      discount_value,
      min_order_value,
      max_discount,
      usage_limit,
      start_time,
      end_time,
      is_active,
    } = data;

    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      await this.ensureSupportSchema(client);

      const { rows } = await client.query(`
        INSERT INTO promo_codes (
          organizer_id, event_id, code, discount_type, discount_value,
          min_order_value, max_discount, usage_limit, start_time, end_time, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `, [
        organizer_id,
        event_id,
        code,
        discount_type,
        discount_value,
        min_order_value || 0,
        max_discount,
        usage_limit,
        start_time,
        end_time,
        is_active !== undefined ? is_active : true,
      ]);

      if (eventIds.length > 0) {
        await client.query(
          `
          INSERT INTO promo_code_events (promo_code_id, event_id)
          SELECT $1, unnest($2::uuid[])
          ON CONFLICT DO NOTHING
          `,
          [rows[0].id, eventIds],
        );
      }

      await client.query('COMMIT');
      return this.findById(rows[0].id);
    } catch (error) {
      await client.query('ROLLBACK');
      if (error.code === '23505') {
        throw new AppError('Promo code already exists', 400, ErrorCodes.INVALID_INPUT);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async update(id, data) {
    await this.ensureSupportSchema();
    const allowedColumns = [
      'event_id',
      'code',
      'discount_type',
      'discount_value',
      'min_order_value',
      'max_discount',
      'usage_limit',
      'start_time',
      'end_time',
      'is_active',
    ];
    const fields = [];
    const params = [id];
    const hasEventIds = Object.prototype.hasOwnProperty.call(data, 'eventIds');
    const eventIds = data.eventIds || [];

    allowedColumns.forEach((key) => {
      if (data[key] !== undefined) {
        fields.push(`${key} = $${params.length + 1}`);
        params.push(data[key]);
      }
    });

    if (fields.length === 0 && !hasEventIds) return this.findById(id);

    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      await this.ensureSupportSchema(client);

      if (fields.length > 0) {
        const query = `
          UPDATE promo_codes
          SET ${fields.join(', ')}
          WHERE id = $1
          RETURNING *
        `;
        await client.query(query, params);
      }

      if (hasEventIds) {
        await client.query('DELETE FROM promo_code_events WHERE promo_code_id = $1', [id]);
        if (eventIds.length > 0) {
          await client.query(
            `
            INSERT INTO promo_code_events (promo_code_id, event_id)
            SELECT $1, unnest($2::uuid[])
            ON CONFLICT DO NOTHING
            `,
            [id, eventIds],
          );
        }
      }

      await client.query('COMMIT');
      return this.findById(id);
    } catch (error) {
      await client.query('ROLLBACK');
      if (error.code === '23505') {
        throw new AppError('Promo code already exists', 400, ErrorCodes.INVALID_INPUT);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async softDelete(id) {
    await this.ensureSupportSchema();
    const query = `UPDATE promo_codes SET is_active = false WHERE id = $1 RETURNING *`;
    const { rows } = await db.query(query, [id]);
    return this._mapRow(rows[0]);
  }

  async delete(id) {
    await this.ensureSupportSchema();
    const query = `DELETE FROM promo_codes WHERE id = $1`;
    await db.query(query, [id]);
    return true;
  }

  async findEventsByIds(eventIds, organizerId) {
    if (!eventIds.length) return [];
    const { rows } = await db.query(
      `
      SELECT id, title, organizer_id
      FROM events
      WHERE id = ANY($1::uuid[])
        AND organizer_id = $2
        AND deleted_at IS NULL
      `,
      [eventIds, organizerId],
    );
    return rows;
  }
}

module.exports = new PromotionsRepository();
