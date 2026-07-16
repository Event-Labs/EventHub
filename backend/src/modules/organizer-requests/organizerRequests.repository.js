const db = require('../../infrastructure/database/db.client');

const REQUEST_SELECT = `
  r.id,
  r.user_id,
  r.request_type::text AS request_type,
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
  r.request_action,
  r.change_summary,
  r.status::text AS status,
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

  async findPendingProfileUpdateByUserId(userId) {
    const { rows } = await db.query(
      `
      SELECT id
      FROM organizer_requests
      WHERE user_id = $1
        AND status = 'PENDING'
        AND request_action = 'PROFILE_UPDATE'
      LIMIT 1
      `,
      [userId],
    );
    return rows[0];
  }

  async findBusinessEmailConflict(email, excludeRequestId = null) {
    const { rows } = await db.query(
      `
      SELECT 'user' AS source, id
      FROM users
      WHERE lower(email) = lower($1) AND deleted_at IS NULL
      UNION ALL
      SELECT 'request' AS source, id
      FROM organizer_requests
      WHERE lower(business_email) = lower($1)
        AND status = 'PENDING'
        AND ($2::uuid IS NULL OR id <> $2::uuid)
      LIMIT 1
      `,
      [email, excludeRequestId],
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
    businessEmailVerified = false,
    businessPhone,
    organizationAvatarUrl,
    taxCode,
    legalDocumentUrl,
    businessLicenseUrl,
    legalRepresentativeName,
    legalRepresentativePosition,
    legalRepresentativeIdUrl,
    authorizationLetterUrl,
    individualFullName,
    individualIdentityNumber,
    individualIdFrontUrl,
    individualIdBackUrl,
    individualSelfieUrl,
    individualTaxCode,
    termsAccepted,
    requestAction = 'APPLICATION',
    changeSummary = null,
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
        business_email_verified_at,
        business_phone,
        organization_avatar_url,
        tax_code,
        legal_document_url,
        business_license_url,
        legal_representative_name,
        legal_representative_position,
        legal_representative_id_url,
        authorization_letter_url,
        individual_full_name,
        individual_identity_number,
        individual_id_front_url,
        individual_id_back_url,
        individual_selfie_url,
        individual_tax_code,
        terms_accepted,
        terms_accepted_at,
        request_action,
        change_summary
      )
      VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $6 THEN now() ELSE NULL END, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, CASE WHEN $22 THEN now() ELSE NULL END, $23, $24)
      RETURNING id
      `,
      [
        userId,
        requestType || 'INDIVIDUAL',
        organizationName,
        organizationDescription || null,
        businessEmail || null,
        Boolean(businessEmailVerified),
        businessPhone || null,
        organizationAvatarUrl || null,
        taxCode || null,
        legalDocumentUrl || null,
        businessLicenseUrl || null,
        legalRepresentativeName || null,
        legalRepresentativePosition || null,
        legalRepresentativeIdUrl || null,
        authorizationLetterUrl || null,
        individualFullName || null,
        individualIdentityNumber || null,
        individualIdFrontUrl || null,
        individualIdBackUrl || null,
        individualSelfieUrl || null,
        individualTaxCode || null,
        Boolean(termsAccepted),
        requestAction || 'APPLICATION',
        changeSummary || null,
      ],
    );
    return this.findById(rows[0].id);
  }

  async updateByIdForUser({
    requestId,
    userId,
    requestType,
    organizationName,
    organizationDescription,
    businessEmail,
    businessEmailVerified,
    businessPhone,
    organizationAvatarUrl,
    taxCode,
    legalDocumentUrl,
    businessLicenseUrl,
    legalRepresentativeName,
    legalRepresentativePosition,
    legalRepresentativeIdUrl,
    authorizationLetterUrl,
    individualFullName,
    individualIdentityNumber,
    individualIdFrontUrl,
    individualIdBackUrl,
    individualSelfieUrl,
    individualTaxCode,
    termsAccepted,
  }) {
    const { rows } = await db.query(
      `
      UPDATE organizer_requests
      SET
        request_type = $3,
        organization_name = $4,
        organization_description = $5,
        business_email = $6,
        business_email_verified = $7,
        business_email_verified_at = CASE WHEN $7 THEN COALESCE(business_email_verified_at, now()) ELSE NULL END,
        business_phone = $8,
        organization_avatar_url = $9,
        tax_code = $10,
        legal_document_url = $11,
        business_license_url = $12,
        legal_representative_name = $13,
        legal_representative_position = $14,
        legal_representative_id_url = $15,
        authorization_letter_url = $16,
        individual_full_name = $17,
        individual_identity_number = $18,
        individual_id_front_url = $19,
        individual_id_back_url = $20,
        individual_selfie_url = $21,
        individual_tax_code = $22,
        terms_accepted = $23,
        terms_accepted_at = CASE WHEN $23 THEN COALESCE(terms_accepted_at, now()) ELSE NULL END,
        status = 'PENDING',
        review_note = NULL,
        reviewed_by = NULL,
        reviewed_at = NULL,
        updated_at = now()
      WHERE id = $1
        AND user_id = $2
        AND status <> 'APPROVED'
      RETURNING id
      `,
      [
        requestId,
        userId,
        requestType || 'INDIVIDUAL',
        organizationName,
        organizationDescription || null,
        businessEmail || null,
        Boolean(businessEmailVerified),
        businessPhone || null,
        organizationAvatarUrl || null,
        taxCode || null,
        legalDocumentUrl || null,
        businessLicenseUrl || null,
        legalRepresentativeName || null,
        legalRepresentativePosition || null,
        legalRepresentativeIdUrl || null,
        authorizationLetterUrl || null,
        individualFullName || null,
        individualIdentityNumber || null,
        individualIdFrontUrl || null,
        individualIdBackUrl || null,
        individualSelfieUrl || null,
        individualTaxCode || null,
        Boolean(termsAccepted),
      ],
    );

    return rows[0] ? this.findById(rows[0].id) : null;
  }

  async findAll({ status, request_type: requestType } = {}) {
    const params = [];
    const whereClauses = [];

    if (status) {
      params.push(status);
      whereClauses.push(`r.status = $${params.length}`);
    }

    if (requestType) {
      params.push(requestType);
      whereClauses.push(`r.request_type = $${params.length}`);
    }

    const whereClause = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const { rows } = await db.query(
      `
      SELECT ${REQUEST_SELECT}
      FROM organizer_requests r
      JOIN users u ON u.id = r.user_id AND u.deleted_at IS NULL
      LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by
      ${whereClause}
      ORDER BY
        CASE r.status WHEN 'PENDING' THEN 0 WHEN 'APPROVED' THEN 1 ELSE 2 END,
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
          legal_document_url,
          business_license_url,
          legal_representative_name,
          legal_representative_position,
          legal_representative_id_url,
          authorization_letter_url,
          individual_full_name,
          individual_identity_number,
          individual_id_front_url,
          individual_id_back_url,
          individual_selfie_url,
          individual_tax_code,
          terms_accepted,
          terms_accepted_at,
          request_action,
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
        const isProfileUpdate = request.request_action === 'PROFILE_UPDATE';
        let organizerUserId = request.user_id;

        if (request.request_type === 'ORGANIZATION' && !isProfileUpdate) {
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
            legal_document_url,
            business_license_url,
            legal_representative_name,
            legal_representative_position,
            legal_representative_id_url,
            authorization_letter_url,
            individual_full_name,
            individual_identity_number,
            individual_id_front_url,
            individual_id_back_url,
            individual_selfie_url,
            individual_tax_code,
            terms_accepted,
            terms_accepted_at,
            status
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, 'ACTIVE')
          ON CONFLICT (user_id) DO UPDATE
          SET
            request_type = EXCLUDED.request_type,
            organization_name = EXCLUDED.organization_name,
            description = EXCLUDED.description,
            business_email = EXCLUDED.business_email,
            business_phone = EXCLUDED.business_phone,
            organization_avatar_url = EXCLUDED.organization_avatar_url,
            tax_code = EXCLUDED.tax_code,
            legal_document_url = EXCLUDED.legal_document_url,
            business_license_url = EXCLUDED.business_license_url,
            legal_representative_name = EXCLUDED.legal_representative_name,
            legal_representative_position = EXCLUDED.legal_representative_position,
            legal_representative_id_url = EXCLUDED.legal_representative_id_url,
            authorization_letter_url = EXCLUDED.authorization_letter_url,
            individual_full_name = EXCLUDED.individual_full_name,
            individual_identity_number = EXCLUDED.individual_identity_number,
            individual_id_front_url = EXCLUDED.individual_id_front_url,
            individual_id_back_url = EXCLUDED.individual_id_back_url,
            individual_selfie_url = EXCLUDED.individual_selfie_url,
            individual_tax_code = EXCLUDED.individual_tax_code,
            terms_accepted = EXCLUDED.terms_accepted,
            terms_accepted_at = EXCLUDED.terms_accepted_at,
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
            request.legal_document_url || null,
            request.business_license_url || null,
            request.legal_representative_name || null,
            request.legal_representative_position || null,
            request.legal_representative_id_url || null,
            request.authorization_letter_url || null,
            request.individual_full_name || null,
            request.individual_identity_number || null,
            request.individual_id_front_url || null,
            request.individual_id_back_url || null,
            request.individual_selfie_url || null,
            request.individual_tax_code || null,
            Boolean(request.terms_accepted),
            request.terms_accepted_at || null,
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
