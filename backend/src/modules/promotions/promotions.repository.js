const db = require('../../infrastructure/database/db.client');
const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');

class PromotionsRepository {
  async findAllByOrganizer(organizerId, filters = {}) {
    const params = [organizerId];
    let query = `
      SELECT 
        pc.*, 
        e.title as event_name,
        (SELECT COUNT(*) FROM promo_code_usages pcu WHERE pcu.promo_code_id = pc.id) as usage_count
      FROM promo_codes pc
      LEFT JOIN events e ON pc.event_id = e.id
      WHERE pc.organizer_id = $1
    `;

    if (filters.keyword) {
      params.push(`%${filters.keyword}%`);
      query += ` AND (pc.code ILIKE $${params.length} OR e.title ILIKE $${params.length})`;
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
    return rows;
  }

  async findById(id) {
    const query = `
      SELECT 
        pc.*, 
        e.title as event_name,
        (SELECT COUNT(*) FROM promo_code_usages pcu WHERE pcu.promo_code_id = pc.id) as usage_count
      FROM promo_codes pc
      LEFT JOIN events e ON pc.event_id = e.id
      WHERE pc.id = $1
    `;
    const { rows } = await db.query(query, [id]);
    return rows[0];
  }

  async create(data) {
    const {
      organizer_id,
      event_id,
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

    const query = `
      INSERT INTO promo_codes (
        organizer_id, event_id, code, discount_type, discount_value, 
        min_order_value, max_discount, usage_limit, start_time, end_time, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;
    try {
      const { rows } = await db.query(query, [
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
      return rows[0];
    } catch (error) {
      if (error.code === '23505') {
        throw new AppError('Promo code already exists', 400, ErrorCodes.INVALID_INPUT);
      }
      throw error;
    }
  }

  async update(id, data) {
    const fields = [];
    const params = [id];

    Object.keys(data).forEach((key) => {
      if (data[key] !== undefined) {
        fields.push(`${key} = $${params.length + 1}`);
        params.push(data[key]);
      }
    });

    if (fields.length === 0) return this.findById(id);

    const query = `
      UPDATE promo_codes 
      SET ${fields.join(', ')}
      WHERE id = $1
      RETURNING *
    `;
    const { rows } = await db.query(query, params);
    return rows[0];
  }

  async softDelete(id) {
    const query = `UPDATE promo_codes SET is_active = false WHERE id = $1 RETURNING *`;
    const { rows } = await db.query(query, [id]);
    return rows[0];
  }

  async delete(id) {
    const query = `DELETE FROM promo_codes WHERE id = $1`;
    await db.query(query, [id]);
    return true;
  }
}

module.exports = new PromotionsRepository();
