const db = require('../../infrastructure/database/db.client');

const REQUEST_SELECT = `
  r.id,
  r.user_id,
  r.organization_name,
  r.organization_description,
  r.business_email,
  r.business_phone,
  r.status,
  r.review_note,
  r.reviewed_by,
  r.created_at,
  r.reviewed_at,
  r.updated_at,
  u.full_name AS applicant_full_name,
  u.email AS applicant_email,
  u.phone AS applicant_phone,
  reviewer.full_name AS reviewer_full_name
`;

class OrganizerRequestsRepository {
  async findById(id) {
    const { rows } = await db.query(
      `
      SELECT ${REQUEST_SELECT}
      FROM organizer_requests r
      JOIN users u ON u.id = r.user_id AND u.deleted_at IS NULL
      LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by
      WHERE r.id = $1
      LIMIT 1
      `,
      [id],
    );
    return rows[0];
  }

  async findLatestByUserId(userId) {
    const { rows } = await db.query(
      `
      SELECT ${REQUEST_SELECT}
      FROM organizer_requests r
      JOIN users u ON u.id = r.user_id AND u.deleted_at IS NULL
      LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by
      WHERE r.user_id = $1
      ORDER BY r.created_at DESC
      LIMIT 1
      `,
      [userId],
    );
    return rows[0];
  }

  async findPendingByUserId(userId) {
    const { rows } = await db.query(
      `
      SELECT id
      FROM organizer_requests
      WHERE user_id = $1 AND status = 'PENDING'
      LIMIT 1
      `,
      [userId],
    );
    return rows[0];
  }

  async create({ userId, organizationName, organizationDescription, businessEmail, businessPhone }) {
    const { rows } = await db.query(
      `
      INSERT INTO organizer_requests (
        user_id,
        organization_name,
        organization_description,
        business_email,
        business_phone
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
      `,
      [
        userId,
        organizationName,
        organizationDescription || null,
        businessEmail || null,
        businessPhone || null,
      ],
    );
    return this.findById(rows[0].id);
  }

  async findAll({ status }) {
    const params = [];
    let statusClause = '';

    if (status) {
      params.push(status);
      statusClause = `WHERE r.status = $${params.length}`;
    }

    const { rows } = await db.query(
      `
      SELECT ${REQUEST_SELECT}
      FROM organizer_requests r
      JOIN users u ON u.id = r.user_id AND u.deleted_at IS NULL
      LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by
      ${statusClause}
      ORDER BY
        CASE r.status WHEN 'PENDING' THEN 0 ELSE 1 END,
        r.created_at DESC
      `,
      params,
    );
    return rows;
  }

  async reviewRequest({ requestId, status, reviewNote, reviewedBy }) {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      const lockResult = await client.query(
        `
        SELECT id, user_id, status
        FROM organizer_requests
        WHERE id = $1
        FOR UPDATE
        `,
        [requestId],
      );

      const request = lockResult.rows[0];
      if (!request) {
        await client.query('ROLLBACK');
        return { notFound: true };
      }

      if (request.status !== 'PENDING') {
        await client.query('ROLLBACK');
        return { alreadyReviewed: true };
      }

      await client.query(
        `
        UPDATE organizer_requests
        SET
          status = $2,
          review_note = $3,
          reviewed_by = $4,
          reviewed_at = now(),
          updated_at = now()
        WHERE id = $1
        `,
        [requestId, status, reviewNote || null, reviewedBy],
      );

      if (status === 'APPROVED') {
        await client.query(
          `
          INSERT INTO user_roles (user_id, role_id)
          SELECT $1, id FROM roles WHERE name = 'ORGANIZER'
          ON CONFLICT (user_id, role_id) DO NOTHING
          `,
          [request.user_id],
        );
      }

      await client.query('COMMIT');
      return { userId: request.user_id };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = new OrganizerRequestsRepository();
