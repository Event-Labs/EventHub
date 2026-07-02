const eventsRepository = require('./events.repository');
const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');

function toNumber(value) {
  if (value === null || value === undefined) return null;
  return Number(value);
}

function formatVenue(row) {
  return [row.venue_name, row.address_line, row.district, row.city]
    .filter(Boolean)
    .join(', ');
}

function mapCard(row) {
  const minPrice = toNumber(row.min_price);
  const maxPrice = toNumber(row.max_price);

  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    short_description: row.short_description,
    thumbnail_url: row.thumbnail_url,
    banner_url: row.banner_url,
    category: row.category_id
      ? { id: row.category_id, name: row.category_name, slug: row.category_slug }
      : null,
    start_time: row.start_time,
    end_time: row.end_time,
    venue: {
      name: row.venue_name,
      city: row.city,
      district: row.district,
      address_line: row.address_line,
      summary: formatVenue(row),
    },
    organizer: row.organizer_id
      ? { id: row.organizer_id, full_name: row.organizer_name }
      : null,
    min_price: minPrice,
    max_price: maxPrice,
    price_range: { min: minPrice, max: maxPrice },
    is_favorited: Boolean(row.is_favorited),
    favorited_at: row.favorited_at,
  };
}

const MAX_TICKETS_PER_ORDER = Number(process.env.MAX_TICKETS_PER_ORDER || 4);
const MAX_TICKETS_PER_EVENT_ACCOUNT = Number(process.env.MAX_TICKETS_PER_EVENT_ACCOUNT || 6);

function requestedQuantity(items = []) {
  return items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}

function mapDetail(row) {
  return {
    ...mapCard(row),
    description: row.description,
    organizer: row.organizer,
    sessions: row.sessions || [],
    venues: Array.from(
      new Map(
        (row.sessions || [])
          .map((session) => session.venue)
          .filter(Boolean)
          .map((venue) => [venue.id, venue]),
      ).values(),
    ),
    ticket_types: (row.ticket_types || []).map((ticketType) => ({
      ...ticketType,
      price: toNumber(ticketType.price),
      quantity: Number(ticketType.quantity || 0),
      sold_quantity: Number(ticketType.sold_quantity || 0),
      active_hold_quantity: Number(ticketType.active_hold_quantity || 0),
      available_quantity: Math.max(0, Number(ticketType.available_quantity || 0)),
    })),
  };
}

class EventsService {
  async getPublicCategories() {
    return eventsRepository.findPublicCategories();
  }

  async getPublicEvents(query, userId) {
    if (query.start_date && query.end_date && query.start_date > query.end_date) {
      throw new AppError('start_date must be before end_date', 400, ErrorCodes.INVALID_INPUT);
    }

    if (
      query.min_price !== undefined &&
      query.max_price !== undefined &&
      query.min_price > query.max_price
    ) {
      throw new AppError('min_price must be less than or equal to max_price', 400, ErrorCodes.INVALID_INPUT);
    }

    const page = query.page;
    const limit = query.limit;
    const { rows, total } = await eventsRepository.findPublicEvents({
      userId,
      keyword: query.keyword,
      categoryId: query.category_id,
      categorySlug: query.category_slug,
      location: query.location,
      startDate: query.start_date,
      endDate: query.end_date,
      minPrice: query.min_price,
      maxPrice: query.max_price,
      sortBy: query.sort_by,
      sortOrder: query.sort_order,
      limit,
      offset: (page - 1) * limit,
    });

    return {
      items: rows.map(mapCard),
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  async getPublicEventDetail(identifier, userId) {
    const event = await eventsRepository.findPublicEventByIdentifier(identifier, userId);
    if (!event) {
      throw new AppError('Event not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    return mapDetail(event);
  }

  async getSessionSeats(sessionId, query) {
    const rows = await eventsRepository.findSessionSeats(sessionId, query.ticket_type_id);
    const first = rows[0];
    return {
      seat_map: first
        ? {
            rows_count: first.rows_count,
            cols_count: first.cols_count,
          }
        : null,
      seats: rows.map((row) => {
        const holdExpired =
          row.status === 'HELD' &&
          row.held_until &&
          new Date(row.held_until).getTime() <= Date.now();
        return {
          session_seat_id: row.session_seat_id,
          seat_id: row.seat_id,
          row_label: row.row_label,
          seat_number: row.seat_number,
          label: `${row.row_label}${row.seat_number}`,
          x_position: row.x_position,
          y_position: row.y_position,
          is_disabled: Boolean(row.is_disabled),
          ticket_type_ids: row.ticket_type_ids || [],
          status: row.is_disabled ? 'BLOCKED' : holdExpired ? 'AVAILABLE' : row.status,
          held_until: row.held_until,
          seat_type: row.seat_type_name
            ? { name: row.seat_type_name, color: row.seat_type_color }
            : null,
        };
      }),
    };
  }

  async checkTicketAvailability(payload, userId = null) {
    const totalRequested = requestedQuantity(payload.items);
    if (totalRequested > MAX_TICKETS_PER_ORDER) {
      return {
        available: false,
        message: `B\u1ea1n ch\u1ec9 \u0111\u01b0\u1ee3c ch\u1ecdn t\u1ed1i \u0111a ${MAX_TICKETS_PER_ORDER} v\u00e9 trong m\u1ed9t \u0111\u01a1n h\u00e0ng.`,
        items: [],
      };
    }

    if (userId) {
      const purchasedQuantity = await eventsRepository.countPaidTicketsForEvent({
        userId,
        eventId: payload.event_id,
      });
      if (purchasedQuantity + totalRequested > MAX_TICKETS_PER_EVENT_ACCOUNT) {
        return {
          available: false,
          message: `T\u00e0i kho\u1ea3n n\u00e0y ch\u1ec9 \u0111\u01b0\u1ee3c mua t\u1ed1i \u0111a ${MAX_TICKETS_PER_EVENT_ACCOUNT} v\u00e9 cho s\u1ef1 ki\u1ec7n n\u00e0y.`,
          items: [],
        };
      }
    }

    const rows = await eventsRepository.checkTicketAvailability(payload.event_id, payload.items);
    const itemResults = rows.map((row) => {
      const issues = [];
      const now = Date.now();
      const saleStart = row.sale_start ? new Date(row.sale_start).getTime() : null;
      const saleEnd = row.sale_end ? new Date(row.sale_end).getTime() : null;
      const eventEnd = row.event_end_time ? new Date(row.event_end_time).getTime() : null;
      const sessionEnd = row.session_end_time ? new Date(row.session_end_time).getTime() : null;
      const selectedSeats = row.selected_seats || [];

      if (!row.ticket_type_id || row.event_id !== payload.event_id) {
        issues.push('V\u00e9 kh\u00f4ng thu\u1ed9c s\u1ef1 ki\u1ec7n n\u00e0y.')
      }

      if (
        row.deleted_at ||
        row.event_status !== 'PUBLISHED' ||
        row.visibility !== 'PUBLIC' ||
        row.approval_status !== 'APPROVED' ||
        row.session_status !== 'UPCOMING'
      ) {
        issues.push('S\u1ef1 ki\u1ec7n ho\u1eb7c su\u1ea5t di\u1ec5n hi\u1ec7n kh\u00f4ng kh\u1ea3 d\u1ee5ng.')
      }

      if ((eventEnd && eventEnd < now) || (sessionEnd && sessionEnd < now)) {
        issues.push('Event or session has ended and tickets can no longer be sold.');
      }

      if ((saleStart && saleStart > now) || (saleEnd && saleEnd < now)) {
        issues.push('V\u00e9 ch\u01b0a m\u1edf b\u00e1n ho\u1eb7c \u0111\u00e3 h\u1ebft th\u1eddi gian b\u00e1n.')
      }
      if (row.requested_quantity > Math.min(row.max_per_order || MAX_TICKETS_PER_ORDER, MAX_TICKETS_PER_ORDER)) {
        issues.push(`B\u1ea1n ch\u1ec9 \u0111\u01b0\u1ee3c mua t\u1ed1i \u0111a ${Math.min(row.max_per_order || MAX_TICKETS_PER_ORDER, MAX_TICKETS_PER_ORDER)} v\u00e9 trong m\u1ed9t \u0111\u01a1n h\u00e0ng.`);
      }

      if (row.is_seated || selectedSeats.length > 0) {
        if (selectedSeats.length !== Number(row.requested_quantity)) {
          issues.push('S\u1ed1 gh\u1ebf \u0111\u00e3 ch\u1ecdn ch\u01b0a kh\u1edbp v\u1edbi s\u1ed1 l\u01b0\u1ee3ng v\u00e9.')
        }

        for (const seat of selectedSeats) {
          const heldStillValid =
            seat.status === 'HELD' &&
            seat.held_until &&
            new Date(seat.held_until).getTime() > now &&
            String(seat.held_by) !== String(userId);
          const unavailable =
            seat.is_disabled ||
            seat.status === 'SOLD' ||
            heldStillValid ||
            (seat.requires_mapping && !seat.has_mapping);

          if (unavailable) {
            issues.push(`Gh\u1ebf ${seat.label || ''} kh\u00f4ng c\u00f2n kh\u1ea3 d\u1ee5ng.`.trim())
          }
        }
      } else if (Number(row.requested_quantity) > Number(row.available_quantity || 0)) {
        issues.push(`V\u00e9 "${row.name || '\u0111\u00e3 ch\u1ecdn'}" ch\u1ec9 c\u00f2n ${Math.max(0, Number(row.available_quantity || 0))} v\u00e9.`);
      }

      return {
        ticket_type_id: row.ticket_type_id,
        name: row.name,
        is_seated: Boolean(row.is_seated || selectedSeats.length > 0),
        requested_quantity: Number(row.requested_quantity || 0),
        available_quantity: row.is_seated || selectedSeats.length > 0 ? null : Math.max(0, Number(row.available_quantity || 0)),
        selected_seats: selectedSeats,
        available: issues.length === 0,
        message: issues[0] || null,
        issues,
      };
    });

    const firstUnavailable = itemResults.find((item) => !item.available);
    return {
      available: !firstUnavailable,
      message: firstUnavailable?.message || null,
      items: itemResults,
    };
  }

  async holdSeats(userId, payload) {
    const totalRequested = requestedQuantity(payload.items);
    if (totalRequested > MAX_TICKETS_PER_ORDER) {
      throw new AppError(`B\u1ea1n ch\u1ec9 \u0111\u01b0\u1ee3c ch\u1ecdn t\u1ed1i \u0111a ${MAX_TICKETS_PER_ORDER} v\u00e9 trong m\u1ed9t \u0111\u01a1n h\u00e0ng.`, 400, ErrorCodes.ORDER_INVALID_ITEMS);
    }

    const purchasedQuantity = await eventsRepository.countPaidTicketsForEvent({
      userId,
      eventId: payload.event_id,
    });
    if (purchasedQuantity + totalRequested > MAX_TICKETS_PER_EVENT_ACCOUNT) {
      throw new AppError(`T\u00e0i kho\u1ea3n n\u00e0y ch\u1ec9 \u0111\u01b0\u1ee3c mua t\u1ed1i \u0111a ${MAX_TICKETS_PER_EVENT_ACCOUNT} v\u00e9 cho s\u1ef1 ki\u1ec7n n\u00e0y.`, 400, ErrorCodes.ORDER_INVALID_ITEMS);
    }

    return eventsRepository.holdSeats(userId, payload);
  }

  async releaseSeatHolds(userId, payload) {
    return eventsRepository.releaseSeatHolds(userId, payload);
  }
  async getFavoriteEvents(userId) {
    const rows = await eventsRepository.findFavoriteEvents(userId);
    return rows.map(mapCard);
  }

  async addFavorite(userId, eventId) {
    await this.getPublicEventDetail(eventId, userId);
    await eventsRepository.createFavorite(userId, eventId);
    return { event_id: eventId, is_favorited: true };
  }

  async removeFavorite(userId, eventId) {
    await this.getPublicEventDetail(eventId, userId);
    await eventsRepository.deleteFavorite(userId, eventId);
    return { event_id: eventId, is_favorited: false };
  }

  async toggleFavorite(userId, eventId) {
    await this.getPublicEventDetail(eventId, userId);
    const existing = await eventsRepository.findFavorite(userId, eventId);
    if (existing) {
      await eventsRepository.deleteFavorite(userId, eventId);
      return { event_id: eventId, is_favorited: false };
    }

    await eventsRepository.createFavorite(userId, eventId);
    return { event_id: eventId, is_favorited: true };
  }

  async getOrganizerEvents(userId) {
    return eventsRepository.findByOrganizer(userId);
  }
}

module.exports = new EventsService();





