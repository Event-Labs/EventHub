const promotionsRepository = require('./promotions.repository');
const eventsRepository = require('../events/events.repository');
const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const subscriptionGuard = require('../organizer-subscriptions/subscriptionGuard.service');

class PromotionsService {
  async _getOrganizerId(userId) {
    const organizer = await eventsRepository.findOrganizerByUserId(userId);
    if (organizer) return organizer.id;

    throw new AppError('Chưa tìm thấy hồ sơ nhà tổ chức. Vui lòng hoàn tất thông tin nhà tổ chức.', 403, ErrorCodes.FORBIDDEN);
  }

  async getAllPromos(userId, query) {
    const organizerId = await this._getOrganizerId(userId);
    const promos = await promotionsRepository.findAllByOrganizer(organizerId, query);
    return promos.map(this._calculateStatusAndUsage);
  }

  async getPromoById(id, userId) {
    const organizerId = await this._getOrganizerId(userId);
    const promo = await promotionsRepository.findById(id);
    if (!promo) {
      throw new AppError('Không tìm thấy mã khuyến mãi.', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    
    if (promo.organizer_id !== organizerId) {
      throw new AppError('Bạn không có quyền xem mã khuyến mãi này.', 403, ErrorCodes.FORBIDDEN);
    }
    return this._calculateStatusAndUsage(promo);
  }

  async getAvailablePromosForPublicEvent(eventId) {
    const promos = await promotionsRepository.findAvailableForPublicEvent(eventId);
    return promos.map(this._calculateStatusAndUsage);
  }

  _getEventIds(data) {
    if (Array.isArray(data.eventIds)) return data.eventIds;
    if (Array.isArray(data.event_ids)) return data.event_ids;
    if (data.event_id) return [data.event_id];
    return [];
  }

  async _assertOrganizerEvents(eventIds, organizerId) {
    const uniqueEventIds = [...new Set(eventIds.filter(Boolean))];
    if (!uniqueEventIds.length) return [];

    const events = await promotionsRepository.findEventsByIds(uniqueEventIds, organizerId);
    if (events.length !== uniqueEventIds.length) {
      throw new AppError('Tất cả các sự kiện được chọn phải thuộc quyền sở hữu của nhà tổ chức.', 400, ErrorCodes.INVALID_INPUT);
    }
    return uniqueEventIds;
  }

  async _normalizePromoData(data, organizerId, existingPromo = null) {
    const isCreate = !existingPromo;
    const normalized = {
      ...data,
    };

    if (normalized.maxDiscountAmount !== undefined) {
      normalized.max_discount = normalized.maxDiscountAmount;
    }
    if (normalized.maximumDiscountAmount !== undefined) {
      normalized.max_discount = normalized.maximumDiscountAmount;
    }

    const discountType = normalized.discount_type || existingPromo?.discount_type;
    if (discountType === 'FIXED') {
      normalized.max_discount = null;
    }

    const hasApplyToAllEvents = Object.prototype.hasOwnProperty.call(normalized, 'applyToAllEvents');
    const explicitEventIds = this._getEventIds(normalized);
    const hasEventPayload =
      hasApplyToAllEvents ||
      Object.prototype.hasOwnProperty.call(normalized, 'eventIds') ||
      Object.prototype.hasOwnProperty.call(normalized, 'event_ids') ||
      Object.prototype.hasOwnProperty.call(normalized, 'event_id');

    if (hasEventPayload || isCreate) {
      const applyToAllEvents =
        normalized.applyToAllEvents === true ||
        (normalized.event_id === null && explicitEventIds.length === 0);

      if (applyToAllEvents) {
        normalized.event_id = null;
        normalized.eventIds = [];
      } else {
        const eventIds = await this._assertOrganizerEvents(explicitEventIds, organizerId);
        if (!eventIds.length) {
          throw new AppError('Vui lòng chọn ít nhất một sự kiện cho chương trình khuyến mãi.', 400, ErrorCodes.INVALID_INPUT);
        }
        normalized.eventIds = eventIds;
        normalized.event_id = eventIds[0];
      }
    }

    delete normalized.applyToAllEvents;
    delete normalized.event_ids;
    delete normalized.maxDiscountAmount;
    delete normalized.maximumDiscountAmount;

    return normalized;
  }

  _assertValidTimeRange(data, existingPromo = null) {
    const startTime = data.start_time || existingPromo?.start_time;
    const endTime = data.end_time || existingPromo?.end_time;

    if (startTime && endTime && new Date(startTime) >= new Date(endTime)) {
      throw new AppError('Thời gian bắt đầu phải diễn ra trước thời gian kết thúc.', 400, ErrorCodes.INVALID_INPUT);
    }
  }

  async createPromo(data, userId) {
    const organizerId = await this._getOrganizerId(userId);
    this._assertValidTimeRange(data);
    const normalizedData = await this._normalizePromoData(data, organizerId);
    await subscriptionGuard.assertPromoCreationAllowed(organizerId, normalizedData.eventIds || []);
    
    const promoData = {
      ...normalizedData,
      organizer_id: organizerId
    };
    
    return promotionsRepository.create(promoData);
  }

  async updatePromo(id, data, userId) {
    const organizerId = await this._getOrganizerId(userId);
    const promo = await promotionsRepository.findById(id);
    if (!promo) {
      throw new AppError('Không tìm thấy mã khuyến mãi.', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    if (promo.organizer_id !== organizerId) {
      throw new AppError('Bạn không có quyền chỉnh sửa mã khuyến mãi này.', 403, ErrorCodes.FORBIDDEN);
    }

    this._assertValidTimeRange(data, promo);
    const normalizedData = await this._normalizePromoData(data, organizerId, promo);

    return promotionsRepository.update(id, normalizedData);
  }

  async deactivatePromo(id, userId) {
    const organizerId = await this._getOrganizerId(userId);
    const promo = await promotionsRepository.findById(id);
    if (!promo) {
      throw new AppError('Không tìm thấy mã khuyến mãi.', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    if (promo.organizer_id !== organizerId) {
      throw new AppError('Bạn không có quyền dừng mã khuyến mãi này.', 403, ErrorCodes.FORBIDDEN);
    }

    const usageCount = Number(promo.usage_count || promo.used_count || 0);
    if (usageCount > 0) {
      throw new AppError(
        'Mã khuyến mãi đã được sử dụng và không thể xóa.',
        409,
        ErrorCodes.PROMO_CODE_IN_USE,
      );
    }

    return promotionsRepository.softDelete(id);
  }

  _calculateStatusAndUsage(promo) {
    const now = new Date();
    const startTime = new Date(promo.start_time);
    const endTime = new Date(promo.end_time);
    const usedCount = parseInt(promo.used_count || 0);
    const usageLimit = (promo.usage_limit !== null && promo.usage_limit !== undefined) ? parseInt(promo.usage_limit) : null;

    let status = 'Active';
    if (!promo.is_active) {
      status = 'Inactive';
    } else if (now < startTime) {
      status = 'Scheduled';
    } else if (now > endTime || (usageLimit !== null && usedCount >= usageLimit)) {
      status = 'Expired';
    }

    const usagePercentage = usageLimit ? Math.min(100, Math.round((usedCount / usageLimit) * 100)) : null;

    return {
      ...promo,
      status,
      usage_percentage: usagePercentage,
      remaining_usage: usageLimit !== null ? Math.max(0, usageLimit - usedCount) : null
    };
  }
}

module.exports = new PromotionsService();
