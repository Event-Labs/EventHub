const promotionsRepository = require('./promotions.repository');
const eventsRepository = require('../events/events.repository');
const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const subscriptionGuard = require('../organizer-subscriptions/subscriptionGuard.service');

class PromotionsService {
  async _getOrganizerId(userId) {
    const organizer = await eventsRepository.findOrganizerByUserId(userId);
    if (organizer) return organizer.id;

    throw new AppError('Organizer record not found. Please complete your organizer profile.', 403, ErrorCodes.FORBIDDEN);
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
      throw new AppError('Promo code not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    
    if (promo.organizer_id !== organizerId) {
      throw new AppError('You do not have permission to view this promo code', 403, ErrorCodes.FORBIDDEN);
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
      throw new AppError('All selected events must belong to your organizer', 400, ErrorCodes.INVALID_INPUT);
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
          throw new AppError('Please select at least one event for this promotion', 400, ErrorCodes.INVALID_INPUT);
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
      throw new AppError('Start time must be before end_time', 400, ErrorCodes.INVALID_INPUT);
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
      throw new AppError('Promo code not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    if (promo.organizer_id !== organizerId) {
      throw new AppError('You do not have permission to edit this promo code', 403, ErrorCodes.FORBIDDEN);
    }

    this._assertValidTimeRange(data, promo);
    const normalizedData = await this._normalizePromoData(data, organizerId, promo);

    return promotionsRepository.update(id, normalizedData);
  }

  async deactivatePromo(id, userId) {
    const organizerId = await this._getOrganizerId(userId);
    const promo = await promotionsRepository.findById(id);
    if (!promo) {
      throw new AppError('Promo code not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    if (promo.organizer_id !== organizerId) {
      throw new AppError('You do not have permission to deactivate this promo code', 403, ErrorCodes.FORBIDDEN);
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
