const db = require('../../infrastructure/database/db.client');

const CATEGORY_SELECT = `
  c.id,
  c.name,
  c.slug,
  c.description,
  COALESCE(c.is_active, true) AS is_active,
  c.created_at,
  c.updated_at,
  c.deleted_at,
  COUNT(e.id)::int AS event_count
`;

class EventCategoriesRepository {
  async findAll() {
    const { rows } = await db.query(`
      SELECT ${CATEGORY_SELECT}
      FROM event_categories c
      LEFT JOIN events e ON e.category_id = c.id AND e.deleted_at IS NULL
      WHERE c.deleted_at IS NULL
      GROUP BY c.id
      ORDER BY c.name ASC
    `);
    return rows;
  }

  async findById(id) {
    const { rows } = await db.query(`
      SELECT ${CATEGORY_SELECT}
      FROM event_categories c
      LEFT JOIN events e ON e.category_id = c.id AND e.deleted_at IS NULL
      WHERE c.id = $1 AND c.deleted_at IS NULL
      GROUP BY c.id
      LIMIT 1
    `, [id]);
    return rows[0];
  }

  async slugExists(slug, excludeId = null) {
    const params = [slug];
    let excludeClause = '';

    if (excludeId) {
      params.push(excludeId);
      excludeClause = `AND id <> $${params.length}`;
    }

    const { rows } = await db.query(
      `SELECT 1 FROM event_categories WHERE slug = $1 ${excludeClause} LIMIT 1`,
      params,
    );
    return Boolean(rows[0]);
  }

  async create({ name, slug, description, isActive }) {
    const { rows } = await db.query(`
      INSERT INTO event_categories (name, slug, description, is_active)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `, [name, slug, description || null, isActive]);
    return this.findById(rows[0].id);
  }

  async update(id, updates) {
    const sets = [];
    const values = [];

    const addSet = (column, value) => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };

    if (updates.name !== undefined) addSet('name', updates.name);
    if (updates.slug !== undefined) addSet('slug', updates.slug);
    if (updates.description !== undefined) addSet('description', updates.description || null);
    if (updates.is_active !== undefined) addSet('is_active', updates.is_active);

    values.push(id);
    await db.query(`
      UPDATE event_categories
      SET ${sets.join(', ')}, updated_at = now()
      WHERE id = $${values.length} AND deleted_at IS NULL
    `, values);

    return this.findById(id);
  }

  async softDelete(id) {
    const { rowCount } = await db.query(`
      UPDATE event_categories
      SET is_active = false, deleted_at = now(), updated_at = now()
      WHERE id = $1 AND deleted_at IS NULL
    `, [id]);
    return rowCount > 0;
  }
}

module.exports = new EventCategoriesRepository();
