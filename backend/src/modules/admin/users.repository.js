const db = require('../../infrastructure/database/db.client');

class UserRepository {
  async getStats() {
    const query = `
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'ACTIVE') as active,
        COUNT(*) FILTER (WHERE status = 'LOCKED') as locked,
        (
          SELECT COUNT(DISTINCT ur.user_id) 
          FROM user_roles ur 
          JOIN roles r ON ur.role_id = r.id 
          WHERE r.name = 'ORGANIZER'
        ) as organizers,
        (
          SELECT COUNT(DISTINCT ur.user_id) 
          FROM user_roles ur 
          JOIN roles r ON ur.role_id = r.id 
          WHERE r.name = 'STAFF'
        ) as staff
      FROM users 
      WHERE deleted_at IS NULL
    `;
    const { rows } = await db.query(query);
    return {
      total: parseInt(rows[0].total),
      active: parseInt(rows[0].active),
      locked: parseInt(rows[0].locked),
      organizers: parseInt(rows[0].organizers),
      staff: parseInt(rows[0].staff),
    };
  }

  async findAll({ search, role, status, limit = 10, offset = 0, sortBy = 'created_at', sortOrder = 'DESC' }) {
    let query = `
      SELECT u.*, array_agg(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL) as roles
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE u.deleted_at IS NULL
    `;
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`;
    }

    if (role) {
      params.push(role);
      query += ` AND u.id IN (
        SELECT user_id FROM user_roles ur2
        JOIN roles r2 ON ur2.role_id = r2.id
        WHERE r2.name = $${params.length}
      )`;
    }

    if (status) {
      params.push(status);
      query += ` AND u.status = $${params.length}`;
    }

    query += ` GROUP BY u.id`;

    // Add sorting
    const allowedSortBy = ['created_at', 'full_name', 'email', 'status'];
    const actualSortBy = allowedSortBy.includes(sortBy) ? sortBy : 'created_at';
    const actualSortOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    query += ` ORDER BY u.${actualSortBy} ${actualSortOrder}`;

    // Add pagination
    params.push(limit);
    query += ` LIMIT $${params.length}`;
    params.push(offset);
    query += ` OFFSET $${params.length}`;

    const { rows } = await db.query(query, params);

    // Get total count for pagination
    let countQuery = `SELECT COUNT(*) FROM users u WHERE u.deleted_at IS NULL`;
    const countParams = [];
    if (search) {
      countParams.push(`%${search}%`);
      countQuery += ` AND (u.full_name ILIKE $1 OR u.email ILIKE $1)`;
    }
    if (role) {
      countParams.push(role);
      countQuery += ` AND u.id IN (
        SELECT user_id FROM user_roles ur2
        JOIN roles r2 ON ur2.role_id = r2.id
        WHERE r2.name = $${countParams.length}
      )`;
    }
    if (status) {
      countParams.push(status);
      countQuery += ` AND u.status = $${countParams.length}`;
    }

    const { rows: countRows } = await db.query(countQuery, countParams);
    const stats = await this.getStats();

    return {
      users: rows,
      total: parseInt(countRows[0].count),
      stats
    };
  }

  async findById(id) {
    const query = `
      SELECT u.*, array_agg(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL) as roles,
      (SELECT COUNT(*) FROM events WHERE organizer_id = u.id) as events_created,
      (SELECT COUNT(*) FROM orders WHERE user_id = u.id AND status = 'PAID') as tickets_bought,
      (SELECT SUM(total_amount) FROM orders WHERE user_id = u.id AND status = 'PAID') as total_spent,
      admin.full_name as locked_by_name
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      LEFT JOIN users admin ON u.locked_by = admin.id
      WHERE u.id = $1 AND u.deleted_at IS NULL
      GROUP BY u.id, admin.full_name
    `;
    const { rows } = await db.query(query, [id]);
    return rows[0];
  }

  async updateStatus(id, { status, lock_reason, locked_at, locked_until, locked_by }) {
    const query = `
      UPDATE users
      SET status = $2,
          lock_reason = $3,
          locked_at = $4,
          locked_until = $5,
          locked_by = $6,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const { rows } = await db.query(query, [id, status, lock_reason, locked_at, locked_until, locked_by]);
    return rows[0];
  }

  async unlock(id) {
    const query = `
      UPDATE users
      SET status = 'ACTIVE',
          lock_reason = NULL,
          locked_at = NULL,
          locked_until = NULL,
          locked_by = NULL,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const { rows } = await db.query(query, [id]);
    return rows[0];
  }
}

module.exports = new UserRepository();
