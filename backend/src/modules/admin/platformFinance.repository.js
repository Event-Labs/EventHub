const db = require('../../infrastructure/database/db.client');

const FEE_SELECT = `
  pfc.id,
  pfc.name,
  pfc.fee_type,
  COALESCE(pfc.percentage_value, 0) AS percentage_value,
  COALESCE(pfc.fixed_amount, 0) AS fixed_amount,
  pfc.event_category_id,
  ec.name AS event_category_name,
  COALESCE(pfc.is_active, true) AS is_active,
  pfc.effective_from,
  pfc.effective_to,
  pfc.created_by,
  pfc.created_at,
  pfc.updated_at
`;

const POLICY_SELECT = `
  ppc.id,
  ppc.policy_type,
  ppc.title,
  ppc.description,
  ppc.config,
  COALESCE(ppc.is_active, true) AS is_active,
  ppc.effective_from,
  ppc.effective_to,
  ppc.created_by,
  ppc.updated_by,
  ppc.created_at,
  ppc.updated_at,
  COUNT(ppd.id)::int AS document_count
`;

const DOCUMENT_SELECT = `
  id,
  policy_config_id,
  title,
  description,
  file_url,
  file_name,
  file_size,
  mime_type,
  version,
  COALESCE(is_public, true) AS is_public,
  uploaded_by,
  created_at,
  updated_at,
  deleted_at
`;

class PlatformFinanceRepository {
  async findFees() {
    const { rows } = await db.query(`
      SELECT ${FEE_SELECT}
      FROM platform_fee_configs pfc
      LEFT JOIN event_categories ec ON ec.id = pfc.event_category_id
      ORDER BY pfc.is_active DESC, pfc.effective_from DESC NULLS LAST, pfc.created_at DESC
    `);
    return rows;
  }

  async findFeeById(id) {
    const { rows } = await db.query(
      `
      SELECT ${FEE_SELECT}
      FROM platform_fee_configs pfc
      LEFT JOIN event_categories ec ON ec.id = pfc.event_category_id
      WHERE pfc.id = $1
      LIMIT 1
      `,
      [id],
    );
    return rows[0];
  }

  async findActiveFeeForCategory(categoryId = null) {
    const { rows } = await db.query(
      `
      SELECT ${FEE_SELECT}
      FROM platform_fee_configs pfc
      LEFT JOIN event_categories ec ON ec.id = pfc.event_category_id
      WHERE pfc.is_active = true
        AND (pfc.effective_from IS NULL OR pfc.effective_from <= now())
        AND (pfc.effective_to IS NULL OR pfc.effective_to >= now())
        AND (pfc.event_category_id = $1 OR pfc.event_category_id IS NULL)
      ORDER BY
        CASE WHEN pfc.event_category_id = $1 THEN 0 ELSE 1 END,
        pfc.effective_from DESC NULLS LAST,
        pfc.created_at DESC
      LIMIT 1
      `,
      [categoryId],
    );
    return rows[0];
  }

  async createFee(payload, userId) {
    const { rows } = await db.query(
      `
      INSERT INTO platform_fee_configs (
        name,
        fee_type,
        percentage_value,
        fixed_amount,
        event_category_id,
        is_active,
        effective_from,
        effective_to,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, now()), $8, $9)
      RETURNING id
      `,
      [
        payload.name,
        payload.fee_type,
        payload.percentage_value || 0,
        payload.fixed_amount || 0,
        payload.event_category_id || null,
        payload.is_active,
        payload.effective_from || null,
        payload.effective_to || null,
        userId,
      ],
    );
    return this.findFeeById(rows[0].id);
  }

  async updateFee(id, updates) {
    const sets = [];
    const values = [];
    const addSet = (column, value) => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };

    if (updates.name !== undefined) addSet('name', updates.name);
    if (updates.fee_type !== undefined) addSet('fee_type', updates.fee_type);
    if (updates.percentage_value !== undefined) addSet('percentage_value', updates.percentage_value);
    if (updates.fixed_amount !== undefined) addSet('fixed_amount', updates.fixed_amount);
    if (updates.event_category_id !== undefined) addSet('event_category_id', updates.event_category_id || null);
    if (updates.is_active !== undefined) addSet('is_active', updates.is_active);
    if (updates.effective_from !== undefined) addSet('effective_from', updates.effective_from || null);
    if (updates.effective_to !== undefined) addSet('effective_to', updates.effective_to || null);

    values.push(id);
    await db.query(
      `
      UPDATE platform_fee_configs
      SET ${sets.join(', ')}, updated_at = now()
      WHERE id = $${values.length}
      `,
      values,
    );
    return this.findFeeById(id);
  }

  async deleteFee(id) {
    const { rowCount } = await db.query('DELETE FROM platform_fee_configs WHERE id = $1', [id]);
    return rowCount > 0;
  }

  async findPolicies(policyType = null) {
    const params = [];
    const where = [];
    if (policyType) {
      params.push(policyType);
      where.push(`ppc.policy_type = $${params.length}`);
    }

    const { rows } = await db.query(
      `
      SELECT ${POLICY_SELECT}
      FROM platform_policy_configs ppc
      LEFT JOIN platform_policy_documents ppd ON ppd.policy_config_id = ppc.id
        AND ppd.deleted_at IS NULL
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      GROUP BY ppc.id
      ORDER BY ppc.is_active DESC, ppc.policy_type ASC, ppc.effective_from DESC NULLS LAST
      `,
      params,
    );
    return rows;
  }

  async findPolicyById(id) {
    const { rows } = await db.query(
      `
      SELECT ${POLICY_SELECT}
      FROM platform_policy_configs ppc
      LEFT JOIN platform_policy_documents ppd ON ppd.policy_config_id = ppc.id
        AND ppd.deleted_at IS NULL
      WHERE ppc.id = $1
      GROUP BY ppc.id
      LIMIT 1
      `,
      [id],
    );
    return rows[0];
  }

  async findActivePolicies(policyType = null) {
    const params = [];
    const where = [
      'ppc.is_active = true',
      '(ppc.effective_from IS NULL OR ppc.effective_from <= now())',
      '(ppc.effective_to IS NULL OR ppc.effective_to >= now())',
    ];
    if (policyType) {
      params.push(policyType);
      where.push(`ppc.policy_type = $${params.length}`);
    }

    const { rows } = await db.query(
      `
      SELECT ${POLICY_SELECT}
      FROM platform_policy_configs ppc
      LEFT JOIN platform_policy_documents ppd ON ppd.policy_config_id = ppc.id
        AND ppd.deleted_at IS NULL
        AND ppd.is_public = true
      WHERE ${where.join(' AND ')}
      GROUP BY ppc.id
      ORDER BY ppc.policy_type ASC, ppc.effective_from DESC NULLS LAST, ppc.created_at DESC
      `,
      params,
    );
    return rows;
  }

  async createPolicy(payload, userId) {
    const { rows } = await db.query(
      `
      INSERT INTO platform_policy_configs (
        policy_type,
        title,
        description,
        config,
        is_active,
        effective_from,
        effective_to,
        created_by,
        updated_by
      )
      VALUES ($1, $2, $3, $4, $5, COALESCE($6, now()), $7, $8, $8)
      RETURNING id
      `,
      [
        payload.policy_type,
        payload.title,
        payload.description || null,
        JSON.stringify(payload.config || {}),
        payload.is_active,
        payload.effective_from || null,
        payload.effective_to || null,
        userId,
      ],
    );
    return this.findPolicyById(rows[0].id);
  }

  async updatePolicy(id, updates, userId) {
    const sets = [];
    const values = [];
    const addSet = (column, value) => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };

    if (updates.policy_type !== undefined) addSet('policy_type', updates.policy_type);
    if (updates.title !== undefined) addSet('title', updates.title);
    if (updates.description !== undefined) addSet('description', updates.description || null);
    if (updates.config !== undefined) addSet('config', JSON.stringify(updates.config || {}));
    if (updates.is_active !== undefined) addSet('is_active', updates.is_active);
    if (updates.effective_from !== undefined) addSet('effective_from', updates.effective_from || null);
    if (updates.effective_to !== undefined) addSet('effective_to', updates.effective_to || null);
    addSet('updated_by', userId);

    values.push(id);
    await db.query(
      `
      UPDATE platform_policy_configs
      SET ${sets.join(', ')}, updated_at = now()
      WHERE id = $${values.length}
      `,
      values,
    );
    return this.findPolicyById(id);
  }

  async deletePolicy(id) {
    const { rowCount } = await db.query('DELETE FROM platform_policy_configs WHERE id = $1', [id]);
    return rowCount > 0;
  }

  async findDocuments(policyConfigId) {
    const { rows } = await db.query(
      `
      SELECT ${DOCUMENT_SELECT}
      FROM platform_policy_documents
      WHERE policy_config_id = $1 AND deleted_at IS NULL
      ORDER BY created_at DESC
      `,
      [policyConfigId],
    );
    return rows;
  }

  async findPublicDocuments(policyConfigId) {
    const { rows } = await db.query(
      `
      SELECT ${DOCUMENT_SELECT}
      FROM platform_policy_documents
      WHERE policy_config_id = $1 AND deleted_at IS NULL AND is_public = true
      ORDER BY created_at DESC
      `,
      [policyConfigId],
    );
    return rows;
  }

  async findDocumentById(id) {
    const { rows } = await db.query(
      `
      SELECT ${DOCUMENT_SELECT}
      FROM platform_policy_documents
      WHERE id = $1 AND deleted_at IS NULL
      LIMIT 1
      `,
      [id],
    );
    return rows[0];
  }

  async createDocument(policyConfigId, payload, userId) {
    const { rows } = await db.query(
      `
      INSERT INTO platform_policy_documents (
        policy_config_id,
        title,
        description,
        file_url,
        file_name,
        file_size,
        mime_type,
        version,
        is_public,
        uploaded_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
      `,
      [
        policyConfigId,
        payload.title,
        payload.description || null,
        payload.file_url,
        payload.file_name || null,
        payload.file_size || null,
        payload.mime_type || 'application/pdf',
        payload.version || '1.0',
        payload.is_public,
        userId,
      ],
    );
    return this.findDocumentById(rows[0].id);
  }

  async updateDocument(id, updates) {
    const sets = [];
    const values = [];
    const addSet = (column, value) => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };

    if (updates.title !== undefined) addSet('title', updates.title);
    if (updates.description !== undefined) addSet('description', updates.description || null);
    if (updates.file_url !== undefined) addSet('file_url', updates.file_url);
    if (updates.file_name !== undefined) addSet('file_name', updates.file_name || null);
    if (updates.file_size !== undefined) addSet('file_size', updates.file_size || null);
    if (updates.mime_type !== undefined) addSet('mime_type', updates.mime_type || 'application/pdf');
    if (updates.version !== undefined) addSet('version', updates.version || '1.0');
    if (updates.is_public !== undefined) addSet('is_public', updates.is_public);

    values.push(id);
    await db.query(
      `
      UPDATE platform_policy_documents
      SET ${sets.join(', ')}, updated_at = now()
      WHERE id = $${values.length} AND deleted_at IS NULL
      `,
      values,
    );
    return this.findDocumentById(id);
  }

  async deleteDocument(id) {
    const { rowCount } = await db.query(
      `
      UPDATE platform_policy_documents
      SET deleted_at = now(), updated_at = now()
      WHERE id = $1 AND deleted_at IS NULL
      `,
      [id],
    );
    return rowCount > 0;
  }
}

module.exports = new PlatformFinanceRepository();
