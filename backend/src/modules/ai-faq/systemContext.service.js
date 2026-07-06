const eventsService = require('../events/events.service');
const userContextService = require('./userContext.service');

const PUBLIC_EVENTS_LIMIT = 12;

function compactEvent(event) {
  return {
    id: event.id,
    title: event.title,
    slug: event.slug,
    short_description: event.short_description,
    category: event.category?.name || null,
    start_time: event.start_time,
    end_time: event.end_time,
    venue: event.venue?.summary || event.venue?.name || null,
    price_range: event.price_range,
    status: event.status,
  };
}

class SystemContextService {
  async build(userId, queryText = '') {
    const context = {
      platform: {
        name: 'EventHub',
        domain:
          'Nền tảng khám phá sự kiện, đặt vé, thanh toán, quản lý vé, check-in QR, phản hồi sau sự kiện và đăng ký organizer.',
        supported_topics: [
          'Sự kiện công khai trên EventHub',
          'Vé, mã QR, trạng thái vé',
          'Đơn hàng và thanh toán',
          'Check-in tại sự kiện',
          'Tài khoản và hồ sơ người dùng',
          'Yêu thích, phản hồi, organizer request',
        ],
      },
      public_events: {
        status: 'unavailable',
        items: [],
      },
      query_matched_events: {
        status: 'not_requested',
        items: [],
      },
      categories: {
        status: 'unavailable',
        items: [],
      },
      user_context: userId
        ? { status: 'unavailable', authenticated: true }
        : { status: 'available', authenticated: false },
    };

    const hasQuery = String(queryText || '').trim().length >= 2;

    // Build shared upcoming filter — only events that haven't ended yet
    const upcomingFilter = {
      page: 1,
      limit: PUBLIC_EVENTS_LIMIT,
      sort_by: 'start_time',
      sort_order: 'asc',
      start_date: new Date(), // maps to filters.startDate in buildListQuery → e.start_time >= now
    };

    const [eventsResult, queryEventsResult, categoriesResult, userContextResult] = await Promise.allSettled([
      eventsService.getPublicEvents(upcomingFilter, userId || null),
      hasQuery
        ? eventsService.getPublicEvents(
            { ...upcomingFilter, keyword: queryText },
            userId || null,
          )
        : Promise.resolve(null),
      eventsService.getPublicCategories(),
      userId ? userContextService.build(userId) : Promise.resolve(null),
    ]);

    if (eventsResult.status === 'fulfilled') {
      context.public_events = {
        status: 'available',
        items: (eventsResult.value.items || []).map(compactEvent),
        total: eventsResult.value.pagination?.total || 0,
      };
    } else {
      context.public_events.error = eventsResult.reason?.message || 'Cannot load public events';
    }

    if (!hasQuery) {
      context.query_matched_events = {
        status: 'not_requested',
        items: [],
      };
    } else if (queryEventsResult.status === 'fulfilled') {
      context.query_matched_events = {
        status: 'available',
        items: (queryEventsResult.value?.items || []).map(compactEvent),
        total: queryEventsResult.value?.pagination?.total || 0,
      };
    } else {
      context.query_matched_events = {
        status: 'unavailable',
        items: [],
        error: queryEventsResult.reason?.message || 'Cannot search events for query',
      };
    }

    if (categoriesResult.status === 'fulfilled') {
      context.categories = {
        status: 'available',
        items: categoriesResult.value.map((category) => ({
          id: category.id,
          name: category.name,
          slug: category.slug,
          event_count: category.event_count,
        })),
      };
    } else {
      context.categories.error = categoriesResult.reason?.message || 'Cannot load categories';
    }

    if (userId && userContextResult.status === 'fulfilled') {
      context.user_context = {
        status: 'available',
        ...userContextResult.value,
      };
    } else if (userId) {
      context.user_context.error = userContextResult.reason?.message || 'Cannot load user context';
    }

    return context;
  }
}

module.exports = new SystemContextService();
