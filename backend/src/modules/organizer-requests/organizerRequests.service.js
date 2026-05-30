const authRepository = require('../auth/auth.repository');
const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const organizerRequestsRepository = require('./organizerRequests.repository');

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
    organization_name: row.organization_name,
    organization_description: row.organization_description,
    business_email: row.business_email,
    business_phone: row.business_phone,
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

    const pending = await organizerRequestsRepository.findPendingByUserId(userId);
    if (pending) {
      throw new AppError(
        'You already have a pending organizer request',
        400,
        ErrorCodes.ORGANIZER_REQUEST_PENDING_EXISTS,
      );
    }
  }

  async submitRequest(userId, payload) {
    await this.assertCanSubmit(userId);

    const row = await organizerRequestsRepository.create({
      userId,
      organizationName: payload.organization_name,
      organizationDescription: payload.organization_description,
      businessEmail: payload.business_email.toLowerCase(),
      businessPhone: normalizePhone(payload.business_phone),
    });

    return mapRequest(row);
  }

  async getMyRequest(userId) {
    const row = await organizerRequestsRepository.findLatestByUserId(userId);
    return mapRequest(row);
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
    const result = await organizerRequestsRepository.reviewRequest({
      requestId,
      status: payload.status,
      reviewNote: payload.review_note?.trim() || null,
      reviewedBy: adminId,
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

    return this.getRequestById(requestId);
  }
}

module.exports = new OrganizerRequestsService();
