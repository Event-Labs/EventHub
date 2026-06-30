const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const authRepository = require('../auth/auth.repository');
const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const { sendEmail } = require('../../infrastructure/email/email.service');
const { client: redisClient } = require('../../infrastructure/redis/redis.client');
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
      requestType: payload.request_type,
      organizationName: payload.organization_name,
      organizationDescription: payload.organization_description,
      businessEmail: payload.business_email?.trim() ? payload.business_email.trim().toLowerCase() : null,
      businessPhone: normalizePhone(payload.business_phone),
      organizationAvatarUrl: payload.organization_avatar_url?.trim() || null,
      taxCode: payload.tax_code?.trim() || null,
    });

    const request = mapRequest(row);

    if (request.request_type === 'ORGANIZATION') {
      await this.sendBusinessEmailVerification(request);
    }

    return request;
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
      if (request.request_type === 'ORGANIZATION') {
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
