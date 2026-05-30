const db = require('../../infrastructure/database/db.client');

const SUBSCRIPTION_SELECT = `
  s.id,
  s.name,
  s.description,
  s.price,
  s.duration_days,
  s.event_limit,
  s.staff_limit,
  s.analytics_enabled,
  s.priority_support,
  s.features,
  s.is_active,
  s.created_at,
  s.updated_at,
  s.deleted_at,
  COUNT(os.id)::int AS subscriber_count
`;

class SubscriptionsRepository {
  async findAll() {
    const { rows } = await db.query(`
      SELECT ${SUBSCRIPTION_SELECT}
      FROM subscriptions s
      LEFT JOIN organizer_subscriptions os
        ON os.subscription_id = s.id
        AND os.status = 'ACTIVE'
      WHERE s.deleted_at IS NULL
      GROUP BY s.id
      ORDER BY s.price ASC, s.name ASC
    `);
    return rows;
  }

  async findById(id) {
    const { rows } = await db.query(`
      SELECT ${SUBSCRIPTION_SELECT}
      FROM subscriptions s
      LEFT JOIN organizer_subscriptions os
        ON os.subscription_id = s.id
        AND os.status = 'ACTIVE'
      WHERE s.id = $1 AND s.deleted_at IS NULL
      GROUP BY s.id
      LIMIT 1
    `, [id]);
    return rows[0];
  }

  async create(payload) {
    const { rows } = await db.query(`
      INSERT INTO subscriptions (
        name,
        description,
        price,
        duration_days,
        event_limit,
        staff_limit,
        analytics_enabled,
        priority_support,
        features,
        is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
      RETURNING id
    `, [
      payload.name,
      payload.description || null,
      payload.price,
      payload.duration_days,
      payload.event_limit,
      payload.staff_limit,
      payload.analytics_enabled,
      payload.priority_support,
      JSON.stringify(payload.features || []),
      payload.is_active,
    ]);

    return this.findById(rows[0].id);
  }

  async update(id, updates) {
    const sets = [];
    const values = [];

    const addSet = (column, value, cast = '') => {
      values.push(value);
      sets.push(`${column} = $${values.length}${cast}`);
    };

    if (updates.name !== undefined) addSet('name', updates.name);
    if (updates.description !== undefined) addSet('description', updates.description || null);
    if (updates.price !== undefined) addSet('price', updates.price);
    if (updates.duration_days !== undefined) addSet('duration_days', updates.duration_days);
    if (updates.event_limit !== undefined) addSet('event_limit', updates.event_limit);
    if (updates.staff_limit !== undefined) addSet('staff_limit', updates.staff_limit);
    if (updates.analytics_enabled !== undefined) addSet('analytics_enabled', updates.analytics_enabled);
    if (updates.priority_support !== undefined) addSet('priority_support', updates.priority_support);
    if (updates.features !== undefined) addSet('features', JSON.stringify(updates.features), '::jsonb');
    if (updates.is_active !== undefined) addSet('is_active', updates.is_active);

    values.push(id);
    await db.query(`
      UPDATE subscriptions
      SET ${sets.join(', ')}, updated_at = now()
      WHERE id = $${values.length} AND deleted_at IS NULL
    `, values);

    return this.findById(id);
  }

  async softDelete(id) {
    const { rowCount } = await db.query(`
      UPDATE subscriptions
      SET is_active = false, deleted_at = now(), updated_at = now()
      WHERE id = $1 AND deleted_at IS NULL
    `, [id]);
    return rowCount > 0;
  }
}

module.exports = new SubscriptionsRepository();
