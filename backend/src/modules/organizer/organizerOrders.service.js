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

  /**
   * Return a paginated list of orders for all events managed by the organizer.
   *
   * @param {string} userId  - Authenticated user's id (req.user.sub)
   * @param {object} filters - Validated query params from Zod schema
   */
  async listOrders(userId, filters) {
    const organizerId = await this._resolveOrganizerId(userId);

    // If an eventId filter is provided, ensure the organizer owns that event
    if (filters.eventId) {
      await this._assertOwnsEvent(organizerId, filters.eventId);
    }

    const { items, total } = await organizerOrdersRepository.findOrdersByOrganizer(
      organizerId,
      filters,
    );

    return { items, total };
  }

  /**
   * Return full detail of a single order, verifying organizer ownership.
   *
   * @param {string} userId  - Authenticated user's id (req.user.sub)
   * @param {string} orderId - UUID from route param
   */
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

  /**
   * Return a paginated attendee list for a specific event.
   * Organizer ownership of the event is verified before querying.
   *
   * @param {string} userId  - Authenticated user's id (req.user.sub)
   * @param {string} eventId - UUID from route param
   * @param {object} filters - Validated query params from Zod schema
   */
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
}

module.exports = new OrganizerOrdersService();
