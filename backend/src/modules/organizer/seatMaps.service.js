const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const seatMapsRepository = require('./seatMaps.repository');
const subscriptionGuard = require('../organizer-subscriptions/subscriptionGuard.service');

const MAX_SEATS = 2000;

class SeatMapsService {
  async resolveOrganizerId(userId) {
    const organizer = await seatMapsRepository.findOrganizerByUserId(userId);
    if (!organizer) {
      throw new AppError('Organizer profile not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    return organizer.id;
  }

  validatePayload(data) {
    if (!data.name?.trim()) {
      throw new AppError('Vui lòng nhập tên sơ đồ.', 400, ErrorCodes.INVALID_INPUT);
    }
    const hasSeats = Boolean(data.seats && data.seats.length > 0);
    const hasStandingAreas = Boolean(data.config?.standingAreas && data.config.standingAreas.length > 0);
    if (!hasSeats && !hasStandingAreas) {
      throw new AppError('Sơ đồ cần có ít nhất một ghế ngồi hoặc một vùng đứng.', 400, ErrorCodes.INVALID_INPUT);
    }
    if ((data.seats || []).length > MAX_SEATS) {
      throw new AppError(`Tối đa ${MAX_SEATS} ghế trên một sơ đồ.`, 400, ErrorCodes.INVALID_INPUT);
    }
  }

  async listByVenue(userId, venueId) {
    const organizerId = await this.resolveOrganizerId(userId);
    const venue = await seatMapsRepository.assertVenueOwned(venueId, organizerId);
    if (!venue) {
      throw new AppError('Venue not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    return seatMapsRepository.findSeatMapsByVenue(venueId, organizerId);
  }

  async getSeatMap(userId, seatMapId) {
    const organizerId = await this.resolveOrganizerId(userId);
    const seatMap = await seatMapsRepository.findSeatMapById(seatMapId, organizerId);
    if (!seatMap) {
      throw new AppError('Seat map not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    return seatMap;
  }

  async createSeatMap(userId, venueId, data) {
    const organizerId = await this.resolveOrganizerId(userId);
    await subscriptionGuard.assertSeatMapCreationAllowed(organizerId);
    const venue = await seatMapsRepository.assertVenueOwned(venueId, organizerId);
    if (!venue) {
      throw new AppError('Venue not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    this.validatePayload(data);
    const seatMapId = await seatMapsRepository.insertSeatMapWithData(venueId, data);
    return seatMapsRepository.findSeatMapById(seatMapId, organizerId);
  }

  async updateSeatMap(userId, seatMapId, data) {
    const organizerId = await this.resolveOrganizerId(userId);
    const existing = await seatMapsRepository.findSeatMapById(seatMapId, organizerId);
    if (!existing) {
      throw new AppError('Không tìm thấy sơ đồ ghế.', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    const inUse = await seatMapsRepository.countSessionUsage(seatMapId);
    if (inUse > 0) {
      throw new AppError('Sơ đồ ghế đang được sử dụng bởi phiên sự kiện đang hoạt động.', 400, ErrorCodes.INVALID_INPUT);
    }
    this.validatePayload(data);
    await seatMapsRepository.replaceSeatMapData(seatMapId, data);
    return seatMapsRepository.findSeatMapById(seatMapId, organizerId);
  }

  async deleteSeatMap(userId, seatMapId) {
    const organizerId = await this.resolveOrganizerId(userId);
    const existing = await seatMapsRepository.findSeatMapById(seatMapId, organizerId);
    if (!existing) {
      throw new AppError('Không tìm thấy sơ đồ ghế.', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    const inUse = await seatMapsRepository.countSessionUsage(seatMapId);
    if (inUse > 0) {
      throw new AppError('Sơ đồ ghế đang được sử dụng bởi một hoặc nhiều phiên sự kiện, không thể xóa.', 400, ErrorCodes.INVALID_INPUT);
    }
    const deleted = await seatMapsRepository.softDelete(seatMapId);
    if (!deleted) {
      throw new AppError('Seat map not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    return { deleted: true };
  }
}

module.exports = new SeatMapsService();
