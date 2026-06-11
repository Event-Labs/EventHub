const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const venuesRepository = require('./venues.repository');

class VenuesService {
  async resolveOrganizerId(userId) {
    const organizer = await venuesRepository.findOrganizerByUserId(userId);
    if (!organizer) {
      throw new AppError('Organizer profile not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    return organizer.id;
  }

  async assertOwnsVenue(organizerId, venueId) {
    const venue = await venuesRepository.findById(venueId, organizerId);
    if (!venue) {
      throw new AppError('Venue not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    return venue;
  }

  async listVenues(userId) {
    const organizerId = await this.resolveOrganizerId(userId);
    return venuesRepository.findByOrganizer(organizerId);
  }

  async getVenue(userId, venueId) {
    const organizerId = await this.resolveOrganizerId(userId);
    return this.assertOwnsVenue(organizerId, venueId);
  }

  async createVenue(userId, data) {
    const organizerId = await this.resolveOrganizerId(userId);
    if (!data.name?.trim()) {
      throw new AppError('Venue name is required', 400, ErrorCodes.INVALID_INPUT);
    }
    if (!data.address_line?.trim() || !data.city?.trim()) {
      throw new AppError('Address and city are required', 400, ErrorCodes.INVALID_INPUT);
    }
    if (data.latitude == null || data.longitude == null) {
      throw new AppError('Please select a location on the map', 400, ErrorCodes.INVALID_INPUT);
    }
    return venuesRepository.create(organizerId, data);
  }

  async updateVenue(userId, venueId, data) {
    const organizerId = await this.resolveOrganizerId(userId);
    await this.assertOwnsVenue(organizerId, venueId);
    const updated = await venuesRepository.update(venueId, organizerId, data);
    if (!updated) {
      throw new AppError('Venue not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    return updated;
  }

  async deleteVenue(userId, venueId) {
    const organizerId = await this.resolveOrganizerId(userId);
    await this.assertOwnsVenue(organizerId, venueId);
    const inUse = await venuesRepository.countActiveUsage(venueId);
    if (inUse > 0) {
      throw new AppError('Venue đang được sử dụng bởi sự kiện active', 400, ErrorCodes.INVALID_INPUT);
    }
    const deleted = await venuesRepository.softDelete(venueId, organizerId);
    if (!deleted) {
      throw new AppError('Venue not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    return { deleted: true };
  }
}

module.exports = new VenuesService();
