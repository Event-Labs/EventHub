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
      seats: rows.map((row) => ({
        session_seat_id: row.session_seat_id,
        seat_id: row.seat_id,
        row_label: row.row_label,
        seat_number: row.seat_number,
        label: `${row.row_label}${row.seat_number}`,
        x_position: row.x_position,
        y_position: row.y_position,
        is_disabled: Boolean(row.is_disabled),
        status: row.is_disabled ? 'BLOCKED' : row.status,
        held_until: row.held_until,
        seat_type: row.seat_type_name
          ? { name: row.seat_type_name, color: row.seat_type_color }
          : null,
      })),
    };
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
}

module.exports = new EventsService();
