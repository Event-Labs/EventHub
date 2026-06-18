const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const venuesRepository = require('./venues.repository');

function normalizeVenuePayload(data, { partial = false } = {}) {
  const payload = { ...data };

  ['name', 'address_line', 'country', 'city', 'district', 'ward', 'description'].forEach((key) => {
    if (!partial || data[key] !== undefined) {
      payload[key] = data[key]?.trim?.() || null;
    }
  });

  if (!partial || data.country !== undefined) {
    payload.country = payload.country || 'Vietnam';
  }

  ['latitude', 'longitude'].forEach((key) => {
    if (!partial || data[key] !== undefined) {
      if (data[key] !== undefined && data[key] !== null && data[key] !== '') {
        payload[key] = Number(data[key]);
      } else {
        payload[key] = null;
      }
    }
  });

  return payload;
}

function assertValidCoordinates(payload) {
  if (payload.latitude == null || payload.longitude == null) {
    throw new AppError('Please resolve venue coordinates from the address', 400, ErrorCodes.INVALID_INPUT);
  }

  if (!Number.isFinite(payload.latitude) || !Number.isFinite(payload.longitude)) {
    throw new AppError('Venue coordinates are invalid', 400, ErrorCodes.INVALID_INPUT);
  }
}

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
    const payload = normalizeVenuePayload(data);
    if (!payload.name) {
      throw new AppError('Venue name is required', 400, ErrorCodes.INVALID_INPUT);
    }
    if (!payload.address_line) {
      throw new AppError('Address is required', 400, ErrorCodes.INVALID_INPUT);
    }
    assertValidCoordinates(payload);
    return venuesRepository.create(organizerId, payload);
  }

  async updateVenue(userId, venueId, data) {
    const organizerId = await this.resolveOrganizerId(userId);
    await this.assertOwnsVenue(organizerId, venueId);
    const payload = normalizeVenuePayload(data, { partial: true });
    if (payload.latitude !== undefined || payload.longitude !== undefined) {
      assertValidCoordinates(payload);
    }
    const updated = await venuesRepository.update(venueId, organizerId, payload);
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
