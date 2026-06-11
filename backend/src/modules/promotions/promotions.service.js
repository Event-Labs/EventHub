const promotionsRepository = require('./promotions.repository');
const eventsRepository = require('../events/events.repository');
const db = require('../../infrastructure/database/db.client');
const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');

class PromotionsService {
  async _getOrganizerId(userId) {
    const organizer = await eventsRepository.findOrganizerByUserId(userId);
    if (organizer) return organizer.id;

    // Check if user is admin
    const { rows } = await db.query(
      `SELECT r.name FROM user_roles ur JOIN roles r ON ur.role_id = r.id WHERE ur.user_id = $1`,
      [userId]
    );
    const isAdmin = rows.some(r => r.name === 'ADMIN' || r.name === 'STAFF');
    
    // If admin but no organizer record, we might need a different logic or just return userId
    // for now let's return userId as fallback if they are admin
    if (isAdmin) return userId;

    throw new AppError('Organizer record not found. Please complete your organizer profile.', 403, ErrorCodes.FORBIDDEN);
  }

  async _isAdmin(userId) {
    const { rows } = await db.query(
      `SELECT r.name FROM user_roles ur JOIN roles r ON ur.role_id = r.id WHERE ur.user_id = $1`,
      [userId]
    );
    return rows.some(r => r.name === 'ADMIN' || r.name === 'STAFF');
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
    
    const isAdmin = await this._isAdmin(userId);

    if (!isAdmin && promo.organizer_id !== organizerId) {
      throw new AppError('You do not have permission to view this promo code', 403, ErrorCodes.FORBIDDEN);
    }
    return this._calculateStatusAndUsage(promo);
  }

  async createPromo(data, userId) {
    const organizerId = await this._getOrganizerId(userId);
    
    if (data.start_time >= data.end_time) {
      throw new AppError('Start time must be before end_time', 400, ErrorCodes.INVALID_INPUT);
    }
    
    const promoData = {
      ...data,
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

    const isAdmin = await this._isAdmin(userId);

    if (!isAdmin && promo.organizer_id !== organizerId) {
      throw new AppError('You do not have permission to edit this promo code', 403, ErrorCodes.FORBIDDEN);
    }

    if (data.start_time && data.end_time && data.start_time >= data.end_time) {
      throw new AppError('Start time must be before end_time', 400, ErrorCodes.INVALID_INPUT);
    }

    return promotionsRepository.update(id, data);
  }

  async deactivatePromo(id, userId) {
    const organizerId = await this._getOrganizerId(userId);
    const promo = await promotionsRepository.findById(id);
    if (!promo) {
      throw new AppError('Promo code not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    const isAdmin = await this._isAdmin(userId);

    if (!isAdmin && promo.organizer_id !== organizerId) {
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
