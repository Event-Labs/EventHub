const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const authRepository = require('../auth/auth.repository');
const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const { sendEmail } = require('../../infrastructure/email/email.service');
const { client: redisClient } = require('../../infrastructure/redis/redis.client');
const organizerEventsRepository = require('../organizer/organizerEvents.repository');
const organizerRequestsRepository = require('./organizerRequests.repository');

const BUSINESS_EMAIL_VERIFY_PREFIX = 'organizer_business_email_verify:';

function normalizePhone(phone) {
  if (!phone) return phone;
  if (phone.startsWith('+84')) {
    return `0${phone.slice(3)}`;
  }
  return phone;
}

function mapRequest(row) {
  if (!row) return null;

  return {
    id: row.id,
    user_id: row.user_id,
    request_type: row.request_type,
    organization_name: row.organization_name,
    organization_description: row.organization_description,
    business_email: row.business_email,
    business_email_verified: row.business_email_verified,
    business_email_verified_at: row.business_email_verified_at,
    business_phone: row.business_phone,
    organization_avatar_url: row.organization_avatar_url,
    tax_code: row.tax_code,
    legal_document_url: row.legal_document_url,
    business_license_url: row.business_license_url,
    legal_representative_name: row.legal_representative_name,
    legal_representative_position: row.legal_representative_position,
    legal_representative_id_url: row.legal_representative_id_url,
    authorization_letter_url: row.authorization_letter_url,
    individual_full_name: row.individual_full_name,
    individual_identity_number: row.individual_identity_number,
    individual_id_front_url: row.individual_id_front_url,
    individual_id_back_url: row.individual_id_back_url,
    individual_selfie_url: row.individual_selfie_url,
    individual_tax_code: row.individual_tax_code,
    terms_accepted: row.terms_accepted,
    terms_accepted_at: row.terms_accepted_at,
    request_action: row.request_action || 'APPLICATION',
    change_summary: row.change_summary,
    status: row.status,
    review_note: row.review_note,
    reviewed_by: row.reviewed_by,
    created_at: row.created_at,
    reviewed_at: row.reviewed_at,
    updated_at: row.updated_at,
    applicant: {
      full_name: row.applicant_full_name,
      email: row.applicant_email,
      phone: row.applicant_phone,
    },
    reviewer: row.reviewer_full_name
      ? { full_name: row.reviewer_full_name }
      : null,
  };
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generatePassword() {
  return crypto.randomBytes(9).toString('base64url');
}

function buildRequestInput(payload) {
  return {
    requestType: payload.request_type,
    organizationName: payload.organization_name,
    organizationDescription: payload.organization_description,
    businessEmail: payload.business_email?.trim() ? payload.business_email.trim().toLowerCase() : null,
    businessPhone: normalizePhone(payload.business_phone),
    organizationAvatarUrl: payload.organization_avatar_url?.trim() || null,
    taxCode: payload.tax_code?.trim() || null,
    legalDocumentUrl: payload.legal_document_url?.trim() || null,
    businessLicenseUrl: payload.business_license_url?.trim() || null,
    legalRepresentativeName: payload.legal_representative_name?.trim() || null,
    legalRepresentativePosition: payload.legal_representative_position?.trim() || null,
    legalRepresentativeIdUrl: payload.legal_representative_id_url?.trim() || null,
    authorizationLetterUrl: payload.authorization_letter_url?.trim() || null,
    individualFullName: payload.individual_full_name?.trim() || null,
    individualIdentityNumber: payload.individual_identity_number?.trim() || null,
    individualIdFrontUrl: payload.individual_id_front_url?.trim() || null,
    individualIdBackUrl: payload.individual_id_back_url?.trim() || null,
    individualSelfieUrl: payload.individual_selfie_url?.trim() || null,
    individualTaxCode: payload.individual_tax_code?.trim() || null,
    termsAccepted: payload.terms_accepted,
  };
}

function firstNonEmpty(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '');
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function cleanOptional(value, maxLength = 2000) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, maxLength) : null;
}

const PROFILE_UPDATE_FIELDS = {
  INDIVIDUAL: [
    ['individual_full_name', 'Họ tên pháp lý'],
    ['individual_identity_number', 'Số CCCD/Hộ chiếu'],
    ['individual_tax_code', 'Mã số thuế cá nhân'],
    ['individual_id_front_url', 'Ảnh CCCD mặt trước'],
    ['individual_id_back_url', 'Ảnh CCCD mặt sau'],
    ['individual_selfie_url', 'Ảnh chân dung/tự chụp'],
  ],
  ORGANIZATION: [
    ['legal_representative_name', 'Người đại diện pháp luật'],
    ['legal_representative_position', 'Chức vụ người đại diện'],
    ['tax_code', 'Mã số thuế'],
    ['legal_document_url', 'Giấy ĐKDN/ERC'],
    ['business_license_url', 'Giấy phép kinh doanh đặc thù'],
    ['legal_representative_id_url', 'Giấy tờ tùy thân người đại diện'],
    ['authorization_letter_url', 'Giấy ủy quyền'],
  ],
};

class OrganizerRequestsService {
  async assertCanSubmit(userId) {
    const roles = await authRepository.findUserRoles(userId);
    if (roles.includes('ORGANIZER')) {
      throw new AppError(
        'You are already an organizer',
        400,
        ErrorCodes.ORGANIZER_REQUEST_ALREADY_ORGANIZER,
      );
    }

    const pendingIndividual = await organizerRequestsRepository.findPendingIndividualByUserId(userId);
    if (pendingIndividual) {
      throw new AppError(
        'You already have a pending individual organizer request',
        400,
        ErrorCodes.ORGANIZER_REQUEST_PENDING_EXISTS,
      );
    }
  }

  async submitRequest(userId, payload) {
    await this.assertCanSubmit(userId);

    if (payload.request_type === 'ORGANIZATION') {
      const conflict = await organizerRequestsRepository.findBusinessEmailConflict(
        payload.business_email,
      );
      if (conflict) {
        throw new AppError(
          'Organization email is already used by another account or pending request',
          400,
          ErrorCodes.RESOURCE_ALREADY_EXISTS,
        );
      }
    }

    const row = await organizerRequestsRepository.create({
      userId,
      ...buildRequestInput(payload),
    });

    const request = mapRequest(row);

    if (request.request_type === 'ORGANIZATION') {
      await this.sendBusinessEmailVerification(request);
    }

    return request;
  }

  async updateMyRequest(userId, requestId, payload) {
    const current = await this.getRequestById(requestId);
    if (current.user_id !== userId) {
      throw new AppError(
        'Organizer request not found',
        404,
        ErrorCodes.ORGANIZER_REQUEST_NOT_FOUND,
      );
    }

    if (current.status === 'APPROVED') {
      throw new AppError(
        'Approved organizer requests cannot be edited',
        400,
        ErrorCodes.INVALID_INPUT,
      );
    }

    const input = buildRequestInput(payload);
    let businessEmailVerified = false;
    const nextBusinessEmail = input.businessEmail;

    if (payload.request_type === 'ORGANIZATION') {
      const conflict = await organizerRequestsRepository.findBusinessEmailConflict(
        nextBusinessEmail,
        requestId,
      );
      if (conflict) {
        throw new AppError(
          'Organization email is already used by another account or pending request',
          400,
          ErrorCodes.RESOURCE_ALREADY_EXISTS,
        );
      }

      businessEmailVerified =
        current.request_type === 'ORGANIZATION' &&
        current.business_email?.toLowerCase() === nextBusinessEmail &&
        current.business_email_verified;
    }

    const row = await organizerRequestsRepository.updateByIdForUser({
      requestId,
      userId,
      ...input,
      businessEmailVerified,
    });

    if (!row) {
      throw new AppError(
        'Organizer request not found or cannot be edited',
        404,
        ErrorCodes.ORGANIZER_REQUEST_NOT_FOUND,
      );
    }

    const request = mapRequest(row);

    if (request.request_type === 'ORGANIZATION' && !request.business_email_verified) {
      await this.sendBusinessEmailVerification(request);
    }

    return request;
  }

  async submitProfileUpdateRequest(userId, payload) {
    const organizer = await organizerEventsRepository.findOrganizerByUserId(userId);
    if (!organizer) {
      throw new AppError('Organizer profile not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    const pendingUpdate = await organizerRequestsRepository.findPendingProfileUpdateByUserId(userId);
    if (pendingUpdate) {
      throw new AppError(
        'You already have a pending organizer profile update request',
        400,
        ErrorCodes.ORGANIZER_REQUEST_PENDING_EXISTS,
      );
    }

    const requestHistory = await organizerEventsRepository.findProfileRequests(userId, organizer);
    const sourceRequest =
      [...requestHistory].reverse().find((request) => request.status === 'APPROVED') ||
      requestHistory[requestHistory.length - 1] ||
      {};
    const requestType = firstNonEmpty(payload.request_type, organizer.request_type, sourceRequest.request_type, 'INDIVIDUAL');
    const fields = PROFILE_UPDATE_FIELDS[requestType] || PROFILE_UPDATE_FIELDS.INDIVIDUAL;
    const nextValues = {};
    const changedLabels = [];

    fields.forEach(([field, label]) => {
      const current = firstNonEmpty(organizer[field], sourceRequest[field], '');
      const incoming = cleanOptional(payload[field], field.endsWith('_url') ? 2000 : 255);
      const next = incoming === undefined ? current || null : incoming;
      nextValues[field] = next;
      if (String(current || '').trim() !== String(next || '').trim()) {
        changedLabels.push(label);
      }
    });

    if (!changedLabels.length) {
      throw new AppError('No organizer verification fields changed', 400, ErrorCodes.INVALID_INPUT);
    }

    const row = await organizerRequestsRepository.create({
      userId,
      requestType,
      organizationName: firstNonEmpty(organizer.organization_name, sourceRequest.organization_name),
      organizationDescription: firstNonEmpty(organizer.description, sourceRequest.organization_description),
      businessEmail: firstNonEmpty(organizer.business_email, sourceRequest.business_email),
      businessEmailVerified: Boolean(firstDefined(sourceRequest.business_email_verified, true)),
      businessPhone: firstNonEmpty(organizer.business_phone, sourceRequest.business_phone),
      organizationAvatarUrl: firstNonEmpty(organizer.organization_avatar_url, sourceRequest.organization_avatar_url),
      taxCode: requestType === 'ORGANIZATION'
        ? nextValues.tax_code
        : firstNonEmpty(organizer.tax_code, sourceRequest.tax_code),
      legalDocumentUrl: nextValues.legal_document_url ?? firstNonEmpty(organizer.legal_document_url, sourceRequest.legal_document_url),
      businessLicenseUrl: nextValues.business_license_url ?? firstNonEmpty(organizer.business_license_url, sourceRequest.business_license_url),
      legalRepresentativeName: nextValues.legal_representative_name ?? firstNonEmpty(organizer.legal_representative_name, sourceRequest.legal_representative_name),
      legalRepresentativePosition: nextValues.legal_representative_position ?? firstNonEmpty(organizer.legal_representative_position, sourceRequest.legal_representative_position),
      legalRepresentativeIdUrl: nextValues.legal_representative_id_url ?? firstNonEmpty(organizer.legal_representative_id_url, sourceRequest.legal_representative_id_url),
      authorizationLetterUrl: nextValues.authorization_letter_url ?? firstNonEmpty(organizer.authorization_letter_url, sourceRequest.authorization_letter_url),
      individualFullName: nextValues.individual_full_name ?? firstNonEmpty(organizer.individual_full_name, sourceRequest.individual_full_name),
      individualIdentityNumber: nextValues.individual_identity_number ?? firstNonEmpty(organizer.individual_identity_number, sourceRequest.individual_identity_number),
      individualIdFrontUrl: nextValues.individual_id_front_url ?? firstNonEmpty(organizer.individual_id_front_url, sourceRequest.individual_id_front_url),
      individualIdBackUrl: nextValues.individual_id_back_url ?? firstNonEmpty(organizer.individual_id_back_url, sourceRequest.individual_id_back_url),
      individualSelfieUrl: nextValues.individual_selfie_url ?? firstNonEmpty(organizer.individual_selfie_url, sourceRequest.individual_selfie_url),
      individualTaxCode: nextValues.individual_tax_code ?? firstNonEmpty(organizer.individual_tax_code, sourceRequest.individual_tax_code),
      termsAccepted: Boolean(firstDefined(organizer.terms_accepted, sourceRequest.terms_accepted, true)),
      requestAction: 'PROFILE_UPDATE',
      changeSummary: changedLabels.join(', '),
    });

    return mapRequest(row);
  }

  async sendBusinessEmailVerification(request) {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const ttlSeconds = parseInt(process.env.EMAIL_VERIFY_EXPIRES_IN || '86400', 10);
    const verifyUrl = `${process.env.CLIENT_URL}/organizer-request/verify-email?token=${rawToken}`;

    await redisClient.setEx(
      `${BUSINESS_EMAIL_VERIFY_PREFIX}${tokenHash}`,
      ttlSeconds,
      JSON.stringify({ request_id: request.id }),
    );

    await sendEmail({
      email: request.business_email,
      subject: 'Xác nhận email tổ chức EventHub',
      message: `Vui lòng xác nhận email tổ chức bằng cách truy cập: ${verifyUrl}`,
      html: `
        <p>Xin chào ${request.organization_name},</p>
        <p>Vui lòng xác nhận email tổ chức để yêu cầu đăng ký Organizer có thể được admin xét duyệt.</p>
        <p><a href="${verifyUrl}">Xác nhận email tổ chức</a></p>
        <p>Liên kết này sẽ hết hạn sau ${Math.floor(ttlSeconds / 3600)} giờ.</p>
      `,
    });
  }

  async verifyBusinessEmail(token) {
    const tokenHash = hashToken(token);
    const key = `${BUSINESS_EMAIL_VERIFY_PREFIX}${tokenHash}`;
    const raw = await redisClient.get(key);

    if (!raw) {
      throw new AppError(
        'Invalid or expired verification token',
        400,
        ErrorCodes.AUTH_INVALID_TOKEN,
      );
    }

    const { request_id: requestId } = JSON.parse(raw);
    const updated = await organizerRequestsRepository.markBusinessEmailVerified(requestId);
    if (!updated) {
      throw new AppError(
        'Organizer request not found',
        404,
        ErrorCodes.ORGANIZER_REQUEST_NOT_FOUND,
      );
    }

    await redisClient.del(key);
  }

  async getMyRequest(userId) {
    const row = await organizerRequestsRepository.findLatestByUserId(userId);
    return mapRequest(row);
  }

  async getMyRequests(userId) {
    const rows = await organizerRequestsRepository.findAllByUserId(userId);
    return rows.map(mapRequest);
  }

  async listRequests(filters) {
    const rows = await organizerRequestsRepository.findAll(filters);
    return rows.map(mapRequest);
  }

  async getRequestById(id) {
    const row = await organizerRequestsRepository.findById(id);
    if (!row) {
      throw new AppError(
        'Organizer request not found',
        404,
        ErrorCodes.ORGANIZER_REQUEST_NOT_FOUND,
      );
    }
    return mapRequest(row);
  }

  async reviewRequest(requestId, adminId, payload) {
    let organizationPassword = null;
    let organizationPasswordHash = null;

    if (payload.status === 'APPROVED') {
      const request = await this.getRequestById(requestId);
      if (request.request_type === 'ORGANIZATION' && request.request_action !== 'PROFILE_UPDATE') {
        if (!request.business_email_verified) {
          throw new AppError(
            'Organization email must be verified before approval',
            400,
            ErrorCodes.INVALID_INPUT,
          );
        }

        organizationPassword = generatePassword();
        const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10));
        organizationPasswordHash = await bcrypt.hash(organizationPassword, salt);
      }
    }

    const result = await organizerRequestsRepository.reviewRequest({
      requestId,
      status: payload.status,
      reviewNote: payload.review_note?.trim() || null,
      reviewedBy: adminId,
      organizationPasswordHash,
    });

    if (result.notFound) {
      throw new AppError(
        'Organizer request not found',
        404,
        ErrorCodes.ORGANIZER_REQUEST_NOT_FOUND,
      );
    }

    if (result.alreadyReviewed) {
      throw new AppError(
        'This organizer request has already been reviewed',
        400,
        ErrorCodes.ORGANIZER_REQUEST_ALREADY_REVIEWED,
      );
    }

    if (result.emailNotVerified) {
      throw new AppError(
        'Organization email must be verified before approval',
        400,
        ErrorCodes.INVALID_INPUT,
      );
    }

    if (result.businessEmailTaken) {
      throw new AppError(
        'Organization email is already used by another account',
        400,
        ErrorCodes.RESOURCE_ALREADY_EXISTS,
      );
    }

    const reviewedRequest = await this.getRequestById(requestId);

    if (
      payload.status === 'APPROVED' &&
      reviewedRequest.request_type === 'ORGANIZATION' &&
      organizationPassword
    ) {
      await sendEmail({
        email: reviewedRequest.business_email,
        subject: 'Tài khoản Organizer EventHub đã được cấp',
        message:
          `Yêu cầu Organizer của bạn đã được duyệt.\n` +
          `Email đăng nhập: ${reviewedRequest.business_email}\n` +
          `Mật khẩu tạm thời: ${organizationPassword}\n` +
          `Vui lòng đăng nhập và đổi mật khẩu sớm nhất có thể.`,
        html: `
          <p>Xin chào ${reviewedRequest.organization_name},</p>
          <p>Yêu cầu Organizer của bạn đã được duyệt.</p>
          <p><strong>Email đăng nhập:</strong> ${reviewedRequest.business_email}</p>
          <p><strong>Mật khẩu tạm thời:</strong> ${organizationPassword}</p>
          <p>Vui lòng đăng nhập vào EventHub và đổi mật khẩu sớm nhất có thể.</p>
        `,
      });
    }

    return reviewedRequest;
  }
}

module.exports = new OrganizerRequestsService();
