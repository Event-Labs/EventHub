const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const organizerOrdersRepository = require('./organizerOrders.repository');
const organizerEventsRepository = require('./organizerEvents.repository');

class OrganizerOrdersService {
  async _resolveOrganizerId(userId) {
    const organizer = await organizerEventsRepository.findOrganizerByUserId(userId);
    if (!organizer) {
      throw new AppError('Organizer profile not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    return organizer.id;
  }

  async _assertOwnsEvent(organizerId, eventId) {
    const event = await organizerEventsRepository.findEventById(eventId, organizerId);
    if (!event) {
      throw new AppError('Event not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    return event;
  }

  async listOrders(userId, filters) {
    const organizerId = await this._resolveOrganizerId(userId);
    if (filters.eventId) {
      await this._assertOwnsEvent(organizerId, filters.eventId);
    }
    const { items, total } = await organizerOrdersRepository.findOrdersByOrganizer(
      organizerId,
      filters,
    );
    return { items, total };
  }

  async getOrderDetail(userId, orderId) {
    const organizerId = await this._resolveOrganizerId(userId);
    const result = await organizerOrdersRepository.findOrderDetailByOrganizer(
      organizerId,
      orderId,
    );
    if (!result) {
      throw new AppError('Order not found', 404, ErrorCodes.ORDER_NOT_FOUND);
    }
    return result;
  }

  async listAttendees(userId, eventId, filters) {
    const organizerId = await this._resolveOrganizerId(userId);
    await this._assertOwnsEvent(organizerId, eventId);
    const { items, total } = await organizerOrdersRepository.findAttendeesByEvent(
      organizerId,
      eventId,
      filters,
    );
    return { items, total };
  }

  async getCheckinStats(userId, eventId) {
    const organizerId = await this._resolveOrganizerId(userId);
    await this._assertOwnsEvent(organizerId, eventId);
    return organizerOrdersRepository.getCheckinStats(organizerId, eventId);
  }

  async getRevenueStats(userId, filters = {}) {
    const organizerId = await this._resolveOrganizerId(userId);
    if (filters.eventId) {
      await this._assertOwnsEvent(organizerId, filters.eventId);
    }
    return organizerOrdersRepository.getRevenueStats(organizerId, filters);
  }
}

module.exports = new OrganizerOrdersService();
