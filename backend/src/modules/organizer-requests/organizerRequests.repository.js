const db = require('../../infrastructure/database/db.client');

const REQUEST_SELECT = `
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

  async findPendingIndividualByUserId(userId) {
    const { rows } = await db.query(
      `
      SELECT id
      FROM organizer_requests
      WHERE user_id = $1 AND request_type = 'INDIVIDUAL' AND status = 'PENDING'
      LIMIT 1
      `,
      [userId],
    );
    return rows[0];
  }

  async findBusinessEmailConflict(email) {
    const { rows } = await db.query(
      `
      SELECT 'user' AS source, id
      FROM users
      WHERE lower(email) = lower($1) AND deleted_at IS NULL
      UNION ALL
      SELECT 'request' AS source, id
      FROM organizer_requests
      WHERE lower(business_email) = lower($1) AND status = 'PENDING'
      LIMIT 1
      `,
      [email],
    );
    return rows[0];
  }

  async findAllByUserId(userId) {
    const { rows } = await db.query(
      `
      SELECT ${REQUEST_SELECT}
      FROM organizer_requests r
      JOIN users u ON u.id = r.user_id AND u.deleted_at IS NULL
      LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by
      WHERE r.user_id = $1
      ORDER BY r.created_at ASC
      `,
      [userId],
    );
    return rows;
  }

  async create({
    userId,
    requestType,
    organizationName,
    organizationDescription,
    businessEmail,
    businessPhone,
    organizationAvatarUrl,
    taxCode,
  }) {
    const { rows } = await db.query(
      `
      INSERT INTO organizer_requests (
        user_id,
        request_type,
        organization_name,
        organization_description,
        business_email,
        business_email_verified,
        business_phone,
        organization_avatar_url,
        tax_code
      )
      VALUES ($1, $2, $3, $4, $5, false, $6, $7, $8)
      RETURNING id
      `,
      [
        userId,
        requestType || 'INDIVIDUAL',
        organizationName,
        organizationDescription || null,
        businessEmail || null,
        businessPhone || null,
        organizationAvatarUrl || null,
        taxCode || null,
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

  async markBusinessEmailVerified(requestId) {
    const { rows } = await db.query(
      `
      UPDATE organizer_requests
      SET
        business_email_verified = true,
        business_email_verified_at = COALESCE(business_email_verified_at, now()),
        updated_at = now()
      WHERE id = $1
      RETURNING id
      `,
      [requestId],
    );
    return rows[0];
  }

  async reviewRequest({ requestId, status, reviewNote, reviewedBy, organizationPasswordHash }) {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      const lockResult = await client.query(
        `
        SELECT
          id,
          user_id,
          request_type,
          organization_name,
          organization_description,
          business_email,
          business_email_verified,
          business_phone,
          organization_avatar_url,
          tax_code,
          status
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
        let organizerUserId = request.user_id;

        if (request.request_type === 'ORGANIZATION') {
          if (!request.business_email_verified) {
            await client.query('ROLLBACK');
            return { emailNotVerified: true };
          }

          const existingUserResult = await client.query(
            `
            SELECT id
            FROM users
            WHERE lower(email) = lower($1) AND deleted_at IS NULL
            LIMIT 1
            `,
            [request.business_email],
          );

          if (existingUserResult.rows[0]) {
            await client.query('ROLLBACK');
            return { businessEmailTaken: true };
          }

          const userResult = await client.query(
            `
            INSERT INTO users (
              email,
              password_hash,
              full_name,
              phone,
              email_verified,
              avatar_url
            )
            VALUES ($1, $2, $3, $4, true, $5)
            RETURNING id
            `,
            [
              request.business_email,
              organizationPasswordHash,
              request.organization_name,
              request.business_phone || null,
              request.organization_avatar_url || null,
            ],
          );
          organizerUserId = userResult.rows[0].id;
        }

        await client.query(
          `
          INSERT INTO user_roles (user_id, role_id)
          SELECT $1, id FROM roles WHERE name = 'ORGANIZER'
          ON CONFLICT (user_id, role_id) DO NOTHING
          `,
          [organizerUserId],
        );

        await client.query(
          `
          INSERT INTO organizers (
            user_id,
            request_type,
            organization_name,
            description,
            business_email,
            business_phone,
            organization_avatar_url,
            tax_code,
            status
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE')
          ON CONFLICT (user_id) DO UPDATE
          SET
            request_type = EXCLUDED.request_type,
            organization_name = EXCLUDED.organization_name,
            description = EXCLUDED.description,
            business_email = EXCLUDED.business_email,
            business_phone = EXCLUDED.business_phone,
            organization_avatar_url = EXCLUDED.organization_avatar_url,
            tax_code = EXCLUDED.tax_code,
            status = 'ACTIVE',
            updated_at = now()
          `,
          [
            organizerUserId,
            request.request_type || 'INDIVIDUAL',
            request.organization_name,
            request.organization_description || null,
            request.business_email || null,
            request.business_phone || null,
            request.organization_avatar_url || null,
            request.tax_code || null,
          ],
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
