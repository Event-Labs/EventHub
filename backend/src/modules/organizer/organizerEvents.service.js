const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const organizerEventsRepository = require('./organizerEvents.repository');
const organizerPaymentsRepository = require('../organizer-payments/organizerPayments.repository');

function mapEvent(row) {
  if (!row) return null;
  const seatingRulesRaw =
    typeof row.seating_rules === 'string'
      ? JSON.parse(row.seating_rules)
      : row.seating_rules || {};
  return {
    ...row,
    tags: row.tags || [],
    seating_rules: {
      require_adjacent_seats: Boolean(seatingRulesRaw.require_adjacent_seats),
      require_same_row: Boolean(seatingRulesRaw.require_same_row),
      disallow_single_seat_left: Boolean(seatingRulesRaw.disallow_single_seat_left),
    },
    refund_policy:
      typeof row.refund_policy === 'string'
        ? JSON.parse(row.refund_policy)
        : row.refund_policy || {},
    sessions: row.sessions || [],
    ticket_types: (row.ticket_types || []).map((tt) => ({
      ...tt,
      price: Number(tt.price),
    })),
  };
}

function sanitizeEventPayload(payload) {
  const data = { ...payload };
  if (data.category_id === '') data.category_id = null;
  if (data.seating_rules !== undefined) {
    const input =
      typeof data.seating_rules === 'string'
        ? JSON.parse(data.seating_rules)
        : data.seating_rules || {};
    data.seating_rules = {
      require_adjacent_seats: Boolean(input.require_adjacent_seats),
      require_same_row: Boolean(input.require_same_row),
      disallow_single_seat_left: Boolean(input.disallow_single_seat_left),
    };
  }
  return data;
}

function cleanOptionalText(value, maxLength) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

function assertValidSessionTimes(startTime, endTime) {
  if (!startTime || !endTime) {
    throw new AppError('start_time and end_time are required', 400, ErrorCodes.INVALID_INPUT);
  }
  if (new Date(startTime) >= new Date(endTime)) {
    throw new AppError('end_time must be later than start_time', 400, ErrorCodes.INVALID_INPUT);
  }
}

class OrganizerEventsService {
  async getActiveOrganizerProfile(userId) {
    const organizer = await organizerEventsRepository.findOrganizerByUserId(userId);
    if (!organizer) {
      throw new AppError('Organizer profile not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    const requestHistory = await organizerEventsRepository.findProfileRequests(userId, organizer);
    const sourceRequest =
      [...requestHistory]
        .reverse()
        .find((request) => request.status === 'APPROVED') ||
      requestHistory[requestHistory.length - 1] ||
      null;

    return {
      ...organizer,
      source_request: sourceRequest,
      request_history: requestHistory,
    };
  }

  async updateActiveOrganizerProfile(userId, payload = {}) {
    const organizer = await organizerEventsRepository.findOrganizerByUserId(userId);
    if (!organizer) {
      throw new AppError('Organizer profile not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    const updates = {
      description: cleanOptionalText(payload.description, 5000),
      website_url: cleanOptionalText(payload.website_url, 2000),
      social_url: cleanOptionalText(payload.social_url, 2000),
    };

    Object.keys(updates).forEach((key) => {
      if (updates[key] === undefined) {
        delete updates[key];
      }
    });

    if (!Object.keys(updates).length) {
      throw new AppError('No valid fields to update', 400, ErrorCodes.INVALID_INPUT);
    }

    await organizerEventsRepository.updateOrganizerProfileByUserId(userId, updates);
    return this.getActiveOrganizerProfile(userId);
  }

  async resolveOrganizerId(userId) {
    const organizer = await this.getActiveOrganizerProfile(userId);
    return organizer.id;
  }

  async assertOwnsEvent(organizerId, eventId) {
    const event = await organizerEventsRepository.findEventById(eventId, organizerId);
    if (!event) {
      throw new AppError('Event not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    return event;
  }

  async assertVenueAccessible(organizerId, venueId) {
    if (!venueId) {
      throw new AppError('venue_id is required', 400, ErrorCodes.INVALID_INPUT);
    }
    const venue = await organizerEventsRepository.findVenueById(venueId, organizerId);
    if (!venue) {
      throw new AppError('Venue not found or not accessible', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    return venue;
  }

  async getVenues(userId) {
    const organizerId = await this.resolveOrganizerId(userId);
    return organizerEventsRepository.findVenuesByOrganizer(organizerId);
  }

  async listEvents(userId) {
    const organizerId = await this.resolveOrganizerId(userId);
    const rows = await organizerEventsRepository.findEventsByOrganizer(organizerId);
    return rows.map(mapEvent);
  }

  async getEvent(userId, eventId) {
    const organizerId = await this.resolveOrganizerId(userId);
    const event = await this.assertOwnsEvent(organizerId, eventId);
    return mapEvent(event);
  }

  async createEvent(userId, payload) {
    const organizerId = await this.resolveOrganizerId(userId);
    const data = sanitizeEventPayload(payload);

    if (!data.title?.trim()) {
      throw new AppError('Title is required', 400, ErrorCodes.INVALID_INPUT);
    }

    const event = await organizerEventsRepository.createEvent(organizerId, data);
    return mapEvent(event);
  }

  async updateEvent(userId, eventId, payload) {
    const organizerId = await this.resolveOrganizerId(userId);
    const data = sanitizeEventPayload(payload);
    await this.assertOwnsEvent(organizerId, eventId);

    const eventFields = {};
    [
      'title',
      'category_id',
      'short_description',
      'description',
      'thumbnail_url',
      'banner_url',
      'visibility',
      'format',
      'tags',
      'seating_rules',
      'refund_policy',
      'additional_terms',
      'start_time',
      'end_time',
    ].forEach((key) => {
      if (data[key] !== undefined) eventFields[key] = data[key];
    });

    if (Object.keys(eventFields).length) {
      await organizerEventsRepository.updateEvent(eventId, organizerId, eventFields);
    }

    if (Array.isArray(data.sessions)) {
      const existing = await organizerEventsRepository.findEventById(eventId, organizerId);
      const existingSessions = existing?.sessions || [];
      const existingIds = new Set(existingSessions.map((s) => s.id));
      const payloadIds = new Set(data.sessions.filter((s) => s.id).map((s) => s.id));

      for (const session of existingSessions) {
        if (!payloadIds.has(session.id)) {
          await organizerEventsRepository.deleteSession(session.id, eventId);
        }
      }

      for (const session of data.sessions) {
        assertValidSessionTimes(session.start_time, session.end_time);
        await this.assertVenueAccessible(organizerId, session.venue_id);

        const sessionData = {
          session_name: session.session_name,
          start_time: session.start_time,
          end_time: session.end_time,
          venue_id: session.venue_id,
          seat_map_id: session.seat_map_id || null,
          checkin_start_time: session.checkin_start_time || null,
        };

        if (session.id && existingIds.has(session.id)) {
          await organizerEventsRepository.updateSession(session.id, eventId, sessionData);
        } else {
          await organizerEventsRepository.createSession(eventId, sessionData);
        }
      }

      await organizerEventsRepository.syncEventTimesFromSessions(eventId);
    }

    if (Array.isArray(data.ticket_types)) {
      const fullEvent = await organizerEventsRepository.findEventById(eventId, organizerId);
      const sessions = fullEvent?.sessions || [];
      const sessionIds = sessions.map((s) => s.id);
      const existingTickets = fullEvent?.ticket_types || [];
      const payloadIds = new Set(data.ticket_types.filter((tt) => tt.id).map((tt) => tt.id));

      for (const existing of existingTickets) {
        if (!payloadIds.has(existing.id)) {
          await organizerEventsRepository.deleteTicketType(existing.id, existing.event_session_id);
        }
      }

      for (const tt of data.ticket_types) {
        const sessionId = tt.event_session_id || tt.session_id;
        if (!sessionId || !sessionIds.includes(sessionId)) {
          throw new AppError('Invalid session for ticket type', 400, ErrorCodes.INVALID_INPUT);
        }

        if (!tt.name?.trim()) {
          throw new AppError('Ticket type name is required', 400, ErrorCodes.INVALID_INPUT);
        }
        if (tt.price === undefined || Number(tt.price) < 0) {
          throw new AppError('Ticket price must be >= 0', 400, ErrorCodes.INVALID_INPUT);
        }
        if (!tt.quantity || Number(tt.quantity) <= 0) {
          throw new AppError('Ticket quantity must be > 0', 400, ErrorCodes.INVALID_INPUT);
        }

        const ttData = {
          name: tt.name,
          description: tt.description,
          price: tt.price,
          quantity: tt.quantity,
          max_per_order: tt.max_per_order,
          sale_start: tt.sale_start,
          sale_end: tt.sale_end,
          is_seated: tt.is_seated,
        };

        if (tt.id) {
          const existing = await organizerEventsRepository.findTicketType(sessionId, tt.id);
          if (existing) {
            await organizerEventsRepository.updateTicketType(tt.id, sessionId, ttData);
          } else {
            await organizerEventsRepository.createTicketType(sessionId, ttData);
          }
        } else {
          await organizerEventsRepository.createTicketType(sessionId, ttData);
        }
      }
    }

    return mapEvent(await organizerEventsRepository.findEventById(eventId, organizerId));
  }

  async submitEvent(userId, eventId) {
    const organizerId = await this.resolveOrganizerId(userId);
    await this.assertOwnsEvent(organizerId, eventId);

    const fullEvent = await organizerEventsRepository.findEventById(eventId, organizerId);
    if (!fullEvent.sessions?.length) {
      throw new AppError('Event must have at least one session before submit', 400, ErrorCodes.INVALID_INPUT);
    }
    if (!fullEvent.ticket_types?.length) {
      throw new AppError('Event must have at least one ticket type before submit', 400, ErrorCodes.INVALID_INPUT);
    }

    const hasPaidTickets = fullEvent.ticket_types.some((tt) => Number(tt.price) > 0);
    if (hasPaidTickets) {
      const channel = await organizerPaymentsRepository.findChannelByOrganizerId(organizerId);
      if (!channel || channel.status !== 'ACTIVE') {
        throw new AppError('Bạn cần cấu hình kênh thanh toán PayOS trước khi mở bán vé cho sự kiện này.', 400, 'PAYOS_NOT_CONFIGURED');
      }
    }

    const event = await organizerEventsRepository.submitEvent(eventId, organizerId);
    if (!event) {
      throw new AppError('Event cannot be submitted', 400, ErrorCodes.INVALID_INPUT);
    }
    return mapEvent(event);
  }

  async publishEvent(userId, eventId) {
    const organizerId = await this.resolveOrganizerId(userId);
    await this.assertOwnsEvent(organizerId, eventId);

    // Chỉ có thể publish khi Admin đã duyệt (status = COMPLETED, approval_status = APPROVED)
    const fullEvent = await organizerEventsRepository.findEventById(eventId, organizerId);
    if (fullEvent.status !== 'COMPLETED' || fullEvent.approval_status !== 'APPROVED') {
      throw new AppError(
        'Sự kiện chưa được Admin phê duyệt. Vui lòng chờ Admin duyệt trước khi xuất bản.',
        400,
        ErrorCodes.INVALID_INPUT,
      );
    }

    const event = await organizerEventsRepository.publishEvent(eventId, organizerId);
    if (!event) {
      throw new AppError('Không thể xuất bản sự kiện này', 400, ErrorCodes.INVALID_INPUT);
    }
    return mapEvent(event);
  }

  async cancelEvent(userId, eventId) {
    const organizerId = await this.resolveOrganizerId(userId);
    const currentEvent = await this.assertOwnsEvent(organizerId, eventId);

    // Chỉ cho phép hủy event đang PUBLISHED hoặc COMPLETED (đã duyệt chưa public)
    if (!['PUBLISHED', 'COMPLETED'].includes(currentEvent.status)) {
      throw new AppError(
        `Không thể hủy sự kiện ở trạng thái "${currentEvent.status}". Chỉ có thể hủy sự kiện đang xuất bản hoặc đã được duyệt.`,
        400,
        ErrorCodes.EVENT_NOT_CANCELLABLE,
      );
    }

    // Kiểm tra xem có đơn hàng đã thanh toán không
    const paidOrderCount = await organizerEventsRepository.countPaidOrders(eventId);
    if (paidOrderCount > 0) {
      throw new AppError(
        `Không thể hủy sự kiện này vì đã có ${paidOrderCount} đơn hàng được thanh toán. Vui lòng liên hệ hỗ trợ để xử lý hoàn tiền trước khi hủy.`,
        400,
        ErrorCodes.EVENT_HAS_PAID_ORDERS,
      );
    }

    const event = await organizerEventsRepository.cancelEvent(eventId, organizerId);
    if (!event) {
      throw new AppError('Không thể hủy sự kiện này', 400, ErrorCodes.EVENT_NOT_CANCELLABLE);
    }
    return mapEvent(event);
  }

  async addSession(userId, eventId, payload) {
    const organizerId = await this.resolveOrganizerId(userId);
    await this.assertOwnsEvent(organizerId, eventId);

    if (!payload.venue_id || !payload.start_time || !payload.end_time) {
      throw new AppError('venue_id, start_time and end_time are required', 400, ErrorCodes.INVALID_INPUT);
    }

    assertValidSessionTimes(payload.start_time, payload.end_time);
    await this.assertVenueAccessible(organizerId, payload.venue_id);

    const session = await organizerEventsRepository.createSession(eventId, payload);
    await organizerEventsRepository.syncEventTimesFromSessions(eventId);
    return session;
  }

  async updateSession(userId, eventId, sessionId, payload) {
    const organizerId = await this.resolveOrganizerId(userId);
    await this.assertOwnsEvent(organizerId, eventId);

    const session = await organizerEventsRepository.findSession(eventId, sessionId);
    if (!session) {
      throw new AppError('Session not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    if (payload.venue_id) {
      await this.assertVenueAccessible(organizerId, payload.venue_id);
    }
    if (payload.start_time && payload.end_time) {
      assertValidSessionTimes(payload.start_time, payload.end_time);
    }

    const updated = await organizerEventsRepository.updateSession(sessionId, eventId, payload);
    await organizerEventsRepository.syncEventTimesFromSessions(eventId);
    return updated;
  }

  async deleteSession(userId, eventId, sessionId) {
    const organizerId = await this.resolveOrganizerId(userId);
    await this.assertOwnsEvent(organizerId, eventId);

    const deleted = await organizerEventsRepository.deleteSession(sessionId, eventId);
    if (!deleted) {
      throw new AppError('Session not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    await organizerEventsRepository.syncEventTimesFromSessions(eventId);
    return { deleted: true };
  }

  async addTicketType(userId, eventId, sessionId, payload) {
    const organizerId = await this.resolveOrganizerId(userId);
    await this.assertOwnsEvent(organizerId, eventId);

    const session = await organizerEventsRepository.findSession(eventId, sessionId);
    if (!session) {
      throw new AppError('Session not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    if (!payload.name?.trim() || payload.price === undefined || !payload.quantity) {
      throw new AppError('name, price and quantity are required', 400, ErrorCodes.INVALID_INPUT);
    }
    if (Number(payload.price) < 0) {
      throw new AppError('Ticket price must be >= 0', 400, ErrorCodes.INVALID_INPUT);
    }
    if (Number(payload.quantity) <= 0) {
      throw new AppError('Ticket quantity must be > 0', 400, ErrorCodes.INVALID_INPUT);
    }

    return organizerEventsRepository.createTicketType(sessionId, payload);
  }

  async updateTicketType(userId, eventId, sessionId, ticketTypeId, payload) {
    const organizerId = await this.resolveOrganizerId(userId);
    await this.assertOwnsEvent(organizerId, eventId);

    const ticketType = await organizerEventsRepository.findTicketType(sessionId, ticketTypeId);
    if (!ticketType) {
      throw new AppError('Ticket type not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    const updated = await organizerEventsRepository.updateTicketType(ticketTypeId, sessionId, payload);
    return updated;
  }

  async deleteTicketType(userId, eventId, sessionId, ticketTypeId) {
    const organizerId = await this.resolveOrganizerId(userId);
    await this.assertOwnsEvent(organizerId, eventId);

    const deleted = await organizerEventsRepository.deleteTicketType(ticketTypeId, sessionId);
    if (!deleted) {
      throw new AppError('Ticket type not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    return { deleted: true };
  }

  async assignZoneTicketTypes(userId, eventId, sessionId, assignments) {
    const organizerId = await this.resolveOrganizerId(userId);
    await this.assertOwnsEvent(organizerId, eventId);

    const session = await organizerEventsRepository.findSession(eventId, sessionId);
    if (!session) {
      throw new AppError('Session not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    if (!session.seat_map_id) {
      throw new AppError('Session has no seat map assigned', 400, ErrorCodes.INVALID_INPUT);
    }
    if (!Array.isArray(assignments) || !assignments.length) {
      throw new AppError('Zone assignments are required', 400, ErrorCodes.INVALID_INPUT);
    }

    for (const item of assignments) {
      if (!item.zone_id || !item.ticket_type_id) {
        throw new AppError('Each assignment needs zone_id and ticket_type_id', 400, ErrorCodes.INVALID_INPUT);
      }
      const tt = await organizerEventsRepository.findTicketType(sessionId, item.ticket_type_id);
      if (!tt) {
        throw new AppError('Invalid ticket type for session', 400, ErrorCodes.INVALID_INPUT);
      }
    }

    await organizerEventsRepository.assignZonesToTicketTypes(sessionId, assignments);
    return { assigned: assignments.length };
  }
}

module.exports = new OrganizerEventsService();
