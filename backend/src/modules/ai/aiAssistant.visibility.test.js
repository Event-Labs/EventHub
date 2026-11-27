'use strict';

jest.mock('../../infrastructure/database/db.client', () => ({
  query: jest.fn()
}));

jest.mock('../../infrastructure/ai/ollama.client', () => ({
  chat: jest.fn()
}));

jest.mock('../events/events.service', () => ({
  getPublicEvents: jest.fn(),
  getPublicEventDetail: jest.fn(),
  releaseSeatHolds: jest.fn(),
  getSessionSeats: jest.fn(),
  holdSeats: jest.fn()
}));

jest.mock('../events/events.repository', () => ({
  findPublicEvents: jest.fn()
}));

jest.mock('../user/user.service', () => ({
  getProfile: jest.fn()
}));

jest.mock('../orders/orders.service', () => ({
  getCustomerOrders: jest.fn()
}));

const db = require('../../infrastructure/database/db.client');
const ollamaClient = require('../../infrastructure/ai/ollama.client');
const eventsService = require('../events/events.service');
const eventsRepository = require('../events/events.repository');
const userService = require('../user/user.service');
const aiService = require('./aiAssistant.service');

const NOW = new Date('2026-11-25T10:00:00.000Z').getTime();
const PAST_START = '2026-11-10T10:00:00.000Z';
const PAST_END = '2026-11-10T13:00:00.000Z';
const ONGOING_START = '2026-11-25T08:00:00.000Z';
const FUTURE_START = '2026-12-20T12:00:00.000Z';
const FUTURE_END = '2026-12-20T16:00:00.000Z';

function buildOngoingEvent(overrides = {}) {
  return {
    id: 'ev-ongoing-1',
    title: 'Đêm Nhạc Đang Diễn Ra',
    slug: 'dem-nhac-dang-dien-ra',
    short_description: 'Sự kiện âm nhạc đang diễn ra.',
    description: 'Chi tiết sự kiện đang diễn ra',
    status: 'PUBLISHED',
    visibility: 'PUBLIC',
    approval_status: 'APPROVED',
    display_state: 'VISIBLE',
    deleted_at: null,
    sales_status: 'ON_SALE',
    start_time: ONGOING_START,
    end_time: FUTURE_END,
    venue_name: 'Nhà hát Hòa Bình',
    city: 'TP.HCM',
    min_price: 250000,
    organizer_id: 'org-1',
    organizer_name: 'Saigon Sound',
    sessions: [
      { id: 'sess-ongoing-1', session_name: 'Suất chính', start_time: ONGOING_START, end_time: FUTURE_END }
    ],
    ticket_types: [
      { id: 'tt-1', name: 'VIP', price: 250000, available_quantity: 20, is_seated: false }
    ],
    ...overrides
  };
}

function buildUpcomingEvent(overrides = {}) {
  return {
    id: 'ev-upcoming-1',
    title: 'Lễ Hội Sắp Diễn Ra',
    slug: 'le-hoi-sap-dien-ra',
    short_description: 'Sự kiện âm nhạc cuối năm.',
    description: 'Chi tiết sự kiện sắp diễn ra',
    status: 'PUBLISHED',
    visibility: 'PUBLIC',
    approval_status: 'APPROVED',
    display_state: 'VISIBLE',
    deleted_at: null,
    sales_status: 'ON_SALE',
    start_time: FUTURE_START,
    end_time: FUTURE_END,
    venue_name: 'Sân vận động Mỹ Đình',
    city: 'Hà Nội',
    min_price: 500000,
    organizer_id: 'org-1',
    organizer_name: 'Saigon Sound',
    sessions: [
      { id: 'sess-up-1', session_name: 'Suất tối', start_time: FUTURE_START, end_time: FUTURE_END }
    ],
    ticket_types: [
      { id: 'tt-up-1', name: 'Standard', price: 500000, available_quantity: 50, is_seated: false }
    ],
    ...overrides
  };
}

function buildEndedEvent(overrides = {}) {
  return {
    id: 'ev-ended-1',
    title: 'Đêm Nhạc Cũ Đã Kết Thúc',
    slug: 'dem-nhac-cu-da-ket-thuc',
    short_description: 'Sự kiện này đã kết thúc từ tháng trước.',
    description: 'BÍ MẬT ĐỊA ĐIỂM KẾT THÚC - Sân Khấu Cũ 123',
    status: 'COMPLETED',
    visibility: 'PUBLIC',
    approval_status: 'APPROVED',
    display_state: 'VISIBLE',
    deleted_at: null,
    sales_status: 'ENDED',
    start_time: PAST_START,
    end_time: PAST_END,
    venue_name: 'Sân Khấu Cũ Secret Venue',
    city: 'Đà Nẵng',
    min_price: 999000,
    organizer_id: 'org-1',
    organizer_name: 'Saigon Sound',
    refund_policy: {
      allow_refund: true,
      refund_rules: [{ days_before: 7, refund_rate: 80 }]
    },
    sessions: [
      { id: 'sess-end-1', session_name: 'Suất cũ 19h', start_time: PAST_START, end_time: PAST_END }
    ],
    ticket_types: [
      { id: 'tt-end-1', name: 'Vé Cũ VVIP', price: 999000, available_quantity: 0, is_seated: false }
    ],
    ...overrides
  };
}

function buildHiddenEvent(overrides = {}) {
  return {
    id: 'ev-hidden-1',
    title: 'Sự Kiện Bí Mật Nội Bộ',
    slug: 'su-kien-bi-mat-noi-bo',
    short_description: 'Chưa publish hoặc đang bị ẩn.',
    description: 'Nội dung nội bộ tuyệt mật',
    status: 'DRAFT',
    visibility: 'PRIVATE',
    approval_status: 'PENDING',
    display_state: 'HIDDEN_BY_ORGANIZER',
    deleted_at: null,
    sales_status: 'ON_SALE',
    start_time: FUTURE_START,
    end_time: FUTURE_END,
    venue_name: 'Địa Điểm Nội Bộ',
    min_price: 150000,
    refund_policy: {
      allow_refund: true,
      refund_rules: [{ days_before: 9, refund_rate: 73 }]
    },
    ...overrides
  };
}

describe('AI Chatbot Event Visibility & Ended Event Handling', () => {
  let realDateNow;

  beforeEach(() => {
    jest.clearAllMocks();
    aiService.invalidatePublishedEventsCache();
    realDateNow = Date.now;
    Date.now = jest.fn(() => NOW);

    userService.getProfile.mockResolvedValue({
      id: 'user-1',
      full_name: 'Nguyễn Văn A',
      email: 'a@example.com',
      phone: '0901234567'
    });
    ollamaClient.chat.mockResolvedValue({
      content: 'Eve luôn sẵn sàng hỗ trợ bạn tìm các sự kiện đang diễn ra hoặc sắp diễn ra trên EventHub nhé!',
      tool_calls: []
    });
    db.query.mockResolvedValue({ rows: [] });
  });

  afterEach(() => {
    Date.now = realDateNow;
  });

  describe('Visibility & Ended Helpers', () => {
    test('classifies ongoing and upcoming visible published events as allowed', () => {
      const ongoing = buildOngoingEvent();
      const upcoming = buildUpcomingEvent();

      expect(aiService.isOngoingOrUpcomingPublicEvent(ongoing, NOW)).toBe(true);
      expect(aiService.isEventEnded(ongoing, NOW)).toBe(false);
      expect(aiService.isEventHiddenOrUnpublished(ongoing, NOW)).toBe(false);

      expect(aiService.isOngoingOrUpcomingPublicEvent(upcoming, NOW)).toBe(true);
      expect(aiService.isEventEnded(upcoming, NOW)).toBe(false);
      expect(aiService.isEventHiddenOrUnpublished(upcoming, NOW)).toBe(false);
    });

    test('blocks hidden, suspended, unpublished, private, cancelled, deleted, and out-of-publish-window events', () => {
      const cases = [
        buildUpcomingEvent({ display_state: 'HIDDEN_BY_ORGANIZER' }),
        buildUpcomingEvent({ display_state: 'SUSPENDED_BY_ADMIN' }),
        buildUpcomingEvent({ visibility: 'PRIVATE' }),
        buildUpcomingEvent({ visibility: 'UNLISTED' }),
        buildUpcomingEvent({ approval_status: 'PENDING' }),
        buildUpcomingEvent({ approval_status: 'REJECTED' }),
        buildUpcomingEvent({ status: 'DRAFT' }),
        buildUpcomingEvent({ status: 'PENDING' }),
        buildUpcomingEvent({ status: 'CANCELLED' }),
        buildUpcomingEvent({ deleted_at: '2026-11-20T00:00:00Z' }),
        buildUpcomingEvent({ start_publish_at: '2026-12-01T00:00:00Z' }),
        buildUpcomingEvent({ end_publish_at: '2026-11-20T00:00:00Z' })
      ];

      for (const ev of cases) {
        expect(aiService.isEventHiddenOrUnpublished(ev, NOW)).toBe(true);
        expect(aiService.isOngoingOrUpcomingPublicEvent(ev, NOW)).toBe(false);
      }
    });

    test('detects ended events by status, sales_status, end_time, or all sessions ended', () => {
      const endedCases = [
        buildUpcomingEvent({ status: 'COMPLETED' }),
        buildUpcomingEvent({ status: 'ENDED' }),
        buildUpcomingEvent({ sales_status: 'ENDED' }),
        buildUpcomingEvent({ sales_status: 'CLOSED' }),
        buildUpcomingEvent({ status: 'PUBLISHED', start_time: PAST_START, end_time: PAST_END, sessions: [] }),
        buildUpcomingEvent({
          status: 'PUBLISHED',
          start_time: null,
          end_time: null,
          sessions: [{ id: 's1', start_time: PAST_START, end_time: PAST_END }]
        })
      ];

      for (const ev of endedCases) {
        expect(aiService.isEventEnded(ev, NOW)).toBe(true);
        expect(aiService.isOngoingOrUpcomingPublicEvent(ev, NOW)).toBe(false);
      }
    });

    test('keeps multi-session event active when at least one session is still ongoing/upcoming', () => {
      const multiSession = buildUpcomingEvent({
        start_time: PAST_START,
        end_time: null,
        sessions: [
          { id: 's-past', start_time: PAST_START, end_time: PAST_END },
          { id: 's-future', start_time: FUTURE_START, end_time: FUTURE_END }
        ]
      });
      expect(aiService.isEventEnded(multiSession, NOW)).toBe(false);
      expect(aiService.isOngoingOrUpcomingPublicEvent(multiSession, NOW)).toBe(true);
    });
  });

  describe('Cache, Organizer Listing & Matching Filtering', () => {
    test('getPublishedEventsCache requests activeAt and keeps only ongoing/upcoming public events', async () => {
      const ongoing = buildOngoingEvent();
      const upcoming = buildUpcomingEvent();
      const ended = buildEndedEvent();
      const hidden = buildHiddenEvent();

      eventsRepository.findPublicEvents.mockResolvedValue({
        rows: [ongoing, ended, hidden, upcoming]
      });

      const cached = await aiService.getPublishedEventsCache();
      expect(eventsRepository.findPublicEvents).toHaveBeenCalledWith(
        expect.objectContaining({ activeAt: expect.any(Date) })
      );
      expect(cached.map(e => e.id)).toEqual([ongoing.id, upcoming.id]);
    });

    test('formatOrganizerEventsResponse excludes ended and hidden events', () => {
      const ongoing = buildOngoingEvent();
      const ended = buildEndedEvent();
      const hidden = buildHiddenEvent({ organizer_id: 'org-1', organizer_name: 'Saigon Sound' });

      const resp = aiService.formatOrganizerEventsResponse(
        { id: 'org-1', organization_name: 'Saigon Sound' },
        [ongoing, ended, hidden],
        false
      );

      expect(resp).toContain(ongoing.title);
      expect(resp).not.toContain(ended.title);
      expect(resp).not.toContain(hidden.title);
    });

    test('formatOrganizerEventsResponse says no ongoing/upcoming events when all organizer events ended', () => {
      const ended = buildEndedEvent();
      const resp = aiService.formatOrganizerEventsResponse(
        { id: 'org-1', organization_name: 'Saigon Sound' },
        [ended],
        false
      );
      expect(resp).not.toContain(ended.title);
      expect(resp).toContain('chưa có sự kiện nào đang diễn ra hoặc sắp diễn ra');
    });
  });

  describe('Tool Execution (searchEvents, getEventDetails, booking tools)', () => {
    test('searchEvents passes strict_upcoming: true and filters out ended/hidden events', async () => {
      const upcoming = buildUpcomingEvent();
      const ended = buildEndedEvent();
      const hidden = buildHiddenEvent({ title: 'Lễ Hội Bí Mật' });

      eventsRepository.findPublicEvents.mockResolvedValue({ rows: [] });
      eventsService.getPublicEvents.mockResolvedValue({
        items: [ended, hidden, upcoming]
      });

      const res = await aiService.executeTool('user-1', 'searchEvents', { query: 'Lễ Hội' }, { message: 'Tìm lễ hội' });

      expect(eventsService.getPublicEvents).toHaveBeenCalledWith(
        expect.objectContaining({ upcoming_only: true, strict_upcoming: true }),
        'user-1'
      );
      expect(res.status).toBe('FOUND');
      expect(res.events).toHaveLength(1);
      expect(res.events[0].title).toBe(upcoming.title);
    });

    test('searchEvents returns EVENT_ENDED with zero details when searching a specific ended public event', async () => {
      const ended = buildEndedEvent();
      eventsRepository.findPublicEvents.mockResolvedValue({ rows: [] });
      eventsService.getPublicEvents.mockResolvedValue({ items: [ended] });

      db.query.mockImplementation(async (sql) => {
        if (sql.includes("e.visibility = 'PUBLIC'") && sql.includes('LIMIT 200')) {
          return { rows: [ended] };
        }
        return { rows: [] };
      });

      const res = await aiService.executeTool('user-1', 'searchEvents', { query: ended.title }, { message: ended.title });

      expect(res.status).toBe('EVENT_ENDED');
      expect(res.events).toEqual([]);
      expect(JSON.stringify(res)).not.toContain(ended.venue_name);
      expect(JSON.stringify(res)).not.toContain('999');
    });

    test('getEventDetails returns EVENT_ENDED with zero details for ended public events', async () => {
      const ended = buildEndedEvent();
      eventsRepository.findPublicEvents.mockResolvedValue({ rows: [] });

      db.query.mockImplementation(async (sql) => {
        if (sql.includes('WHERE (e.id::text = $1 OR e.slug = $1)')) {
          return { rows: [ended] };
        }
        return { rows: [] };
      });

      const res = await aiService.executeTool('user-1', 'getEventDetails', { eventId: ended.slug }, { message: `Thông tin ${ended.title}` });

      expect(res.status).toBe('EVENT_ENDED');
      expect(res.venue).toBeUndefined();
      expect(res.sessions).toBeUndefined();
      expect(res.ticket_types).toBeUndefined();
      expect(res.description).toBeUndefined();
      expect(eventsService.getPublicEventDetail).not.toHaveBeenCalled();
    });

    test('getEventDetails & booking tools return NOT_FOUND/error for hidden/unpublished/draft events even if getPublicEventDetail has stale row', async () => {
      const hidden = buildHiddenEvent({
        visibility: 'PUBLIC',
        approval_status: 'APPROVED',
        display_state: 'HIDDEN_BY_ORGANIZER',
        status: 'PUBLISHED'
      });
      eventsRepository.findPublicEvents.mockResolvedValue({ rows: [] });
      eventsService.getPublicEventDetail.mockResolvedValue(hidden);
      db.query.mockImplementation(async (sql) => {
        if (sql.includes('WHERE (e.id::text = $1 OR e.slug = $1)')) {
          return { rows: [hidden] };
        }
        return { rows: [] };
      });

      const detailRes = await aiService.executeTool('user-1', 'getEventDetails', { eventId: hidden.slug }, { message: hidden.title });
      expect(detailRes.status).toBe('NOT_FOUND');
      expect(detailRes.instruction).not.toContain('đã kết thúc');
      expect(detailRes.description).toBeUndefined();

      const bookRes = await aiService.executeTool('user-1', 'generateBookingAction', { eventId: hidden.slug }, {});
      expect(bookRes.error).toBeTruthy();
      expect(bookRes.instruction || '').not.toContain('[ACTION:BOOKING:');

      const prefillRes = await aiService.executeTool('user-1', 'generatePrefillBookingAction', { eventId: hidden.slug, quantity: 2 }, { userProfile: { phone: '0901234567' } });
      expect(prefillRes.error).toBeTruthy();
      expect(prefillRes.instruction || '').not.toContain('[ACTION:PREFILL_BOOKING:');

      const smartRes = await aiService.executeTool('user-1', 'proposeSmartBooking', { eventId: hidden.slug, quantity: 1 }, {});
      expect(smartRes.error).toBeTruthy();
    });

    test('booking tools reject ended public events without generating [ACTION:...] tags', async () => {
      const ended = buildEndedEvent();
      eventsRepository.findPublicEvents.mockResolvedValue({ rows: [] });
      db.query.mockImplementation(async (sql) => {
        if (sql.includes('WHERE (e.id::text = $1 OR e.slug = $1)')) {
          return { rows: [ended] };
        }
        return { rows: [] };
      });

      const bookRes = await aiService.executeTool('user-1', 'generateBookingAction', { eventId: ended.slug }, {});
      expect(bookRes.status).toBe('EVENT_ENDED');
      expect(JSON.stringify(bookRes)).not.toContain('[ACTION:');

      const prefillRes = await aiService.executeTool('user-1', 'generatePrefillBookingAction', { eventId: ended.slug, quantity: 2 }, { userProfile: { phone: '0901234567' } });
      expect(prefillRes.status).toBe('EVENT_ENDED');
      expect(JSON.stringify(prefillRes)).not.toContain('[ACTION:');

      const smartRes = await aiService.executeTool('user-1', 'proposeSmartBooking', { eventId: ended.slug, quantity: 1 }, {});
      expect(smartRes.status).toBe('EVENT_ENDED');
    });
  });

  describe('End-to-End chat() Behavior', () => {
    test('asking details/prices about an ended event replies ONLY that it has ended with ZERO details', async () => {
      const upcoming = buildUpcomingEvent();
      const ended = buildEndedEvent();

      eventsRepository.findPublicEvents.mockResolvedValue({ rows: [upcoming] });
      db.query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT id, organization_name, description FROM organizers')) {
          return { rows: [{ id: 'org-1', organization_name: 'Saigon Sound', description: '' }] };
        }
        if (sql.includes("e.visibility = 'PUBLIC'") && sql.includes('LIMIT 200')) {
          return { rows: [ended] };
        }
        return { rows: [] };
      });

      const reply = await aiService.chat('user-1', `Cho mình hỏi thông tin, địa điểm và giá vé sự kiện ${ended.title}`, [], {});

      expect(reply.content).toContain(ended.title);
      expect(reply.content.toLowerCase()).toContain('đã kết thúc');
      expect(reply.content).not.toContain(ended.venue_name);
      expect(reply.content).not.toContain('999');
      expect(reply.content).not.toContain(ended.description);
      expect(reply.content).not.toContain(ended.sessions[0].session_name);
      expect(reply.content).not.toContain('[ACTION:');
    });

    test('asking refund policy about an ended event replies ONLY that it has ended (not intercepted by refund FAQ and no policy leaked)', async () => {
      const ended = buildEndedEvent();
      eventsRepository.findPublicEvents.mockResolvedValue({ rows: [] });
      db.query.mockImplementation(async (sql) => {
        if (sql.includes("e.visibility = 'PUBLIC'") && sql.includes('LIMIT 200')) {
          return { rows: [ended] };
        }
        return { rows: [] };
      });

      const reply = await aiService.chat('user-1', `Sự kiện ${ended.title} có được hoàn vé không?`, [], {});

      expect(reply.content).toContain(ended.title);
      expect(reply.content.toLowerCase()).toContain('đã kết thúc');
      expect(reply.content).not.toContain('80%');
      expect(reply.content).not.toContain('72 giờ');
      expect(reply.content).not.toContain('Vé của tôi');
    });

    test('asking refund policy about a hidden/draft event NEVER queries unfiltered events or discloses existence/policy', async () => {
      const hidden = buildHiddenEvent();
      eventsRepository.findPublicEvents.mockResolvedValue({ rows: [] });

      db.query.mockImplementation(async (sql) => {
        // Guardrail assertion: must NEVER run an unfiltered query like `WHERE title ILIKE $1`!
        expect(sql).not.toMatch(/WHERE\s+title\s+ILIKE/i);
        return { rows: [] };
      });

      const reply = await aiService.chat('user-1', `Sự kiện ${hidden.title} có được hoàn vé không?`, [], {});

      expect(reply.content).not.toContain(hidden.title);
      expect(reply.content).not.toContain('73%');
      expect(reply.content).not.toContain(hidden.venue_name);
    });

    test('asking about an ended event in English replies concisely in English without details', async () => {
      const ended = buildEndedEvent({ title: 'Autumn Acoustic Show 2025' });
      eventsRepository.findPublicEvents.mockResolvedValue({ rows: [] });
      db.query.mockImplementation(async (sql) => {
        if (sql.includes("e.visibility = 'PUBLIC'") && sql.includes('LIMIT 200')) {
          return { rows: [ended] };
        }
        return { rows: [] };
      });

      const reply = await aiService.chat('user-1', 'Tell me ticket price and schedule for Autumn Acoustic Show 2025', [], { locale: 'en' });

      expect(reply.content).toContain('Autumn Acoustic Show 2025');
      expect(reply.content.toLowerCase()).toContain('ended');
      expect(reply.content).not.toContain(ended.venue_name);
      expect(reply.content).not.toContain('999');
    });

    test('asking about an ongoing public event still returns full event details', async () => {
      const ongoing = buildOngoingEvent();
      eventsRepository.findPublicEvents.mockResolvedValue({ rows: [ongoing] });
      eventsService.getPublicEventDetail.mockResolvedValue(ongoing);
      db.query.mockImplementation(async (sql) => {
        if (sql.includes('WHERE (e.id::text = $1 OR e.slug = $1)')) {
          return { rows: [ongoing] };
        }
        return { rows: [] };
      });

      const reply = await aiService.chat('user-1', `Cho mình xem thông tin chi tiết sự kiện ${ongoing.title}`, [], {});

      expect(reply.content).toContain(ongoing.title);
      expect(reply.content).toContain(ongoing.venue_name);
      expect(reply.content).toContain('250.000');
    });

    test('stale activeEvent in clientContext that has ended replies ONLY with ended notice', async () => {
      const ended = buildEndedEvent();
      eventsRepository.findPublicEvents.mockResolvedValue({ rows: [] });
      db.query.mockImplementation(async (sql) => {
        if (sql.includes("e.visibility = 'PUBLIC'") && sql.includes('LIMIT 200')) {
          return { rows: [ended] };
        }
        return { rows: [] };
      });

      const reply = await aiService.chat('user-1', 'Đặt cho mình 2 vé sự kiện này', [], { eventSlug: ended.slug });

      expect(reply.content).toContain(ended.title);
      expect(reply.content.toLowerCase()).toContain('đã kết thúc');
      expect(reply.content).not.toContain('[ACTION:');
    });
  });

  describe('_sanitizeEventRecommendations()', () => {
    test('uses strict_upcoming and filters out ended/hidden fallback items', async () => {
      const ongoing = buildOngoingEvent();
      const ended = buildEndedEvent();
      const hidden = buildHiddenEvent();

      eventsRepository.findPublicEvents.mockResolvedValue({ rows: [ongoing] });
      eventsService.getPublicEvents.mockResolvedValue({ items: [ended, hidden, ongoing] });

      const hallucinated = [
        '1. **Fake Event 2026**',
        'Thời gian: 20/12/2026',
        'Giá vé: 100.000đ'
      ].join('\n');

      const sanitized = await aiService._sanitizeEventRecommendations(hallucinated, null);

      expect(eventsService.getPublicEvents).toHaveBeenCalledWith(
        expect.objectContaining({ upcoming_only: true, strict_upcoming: true })
      );
      expect(sanitized).toContain(ongoing.title);
      expect(sanitized).not.toContain(ended.title);
      expect(sanitized).not.toContain(hidden.title);
    });
  });

  describe('Booking Proposal Attendee Preservation Across Seat Changes', () => {
    test('preserves all 3 attendees (including default buyer slot) when switching rows after completing attendees', async () => {
      const seatedEvent = buildUpcomingEvent({
        id: 'ev-acoustic-1',
        title: 'Vietnam Acoustic Nights 2029',
        slug: 'vietnam-acoustic-nights-2029',
        require_attendee_info: true,
        sessions: [
          { id: 'sess-acoustic-1', session_name: 'Acoustic Opening Night', start_time: FUTURE_START, end_time: FUTURE_END, seat_map_id: 'sm-1', has_seat_map: true }
        ],
        ticket_types: [
          { id: 'tt-gold', name: 'Khu vực Hạng A (Gold)', price: 50000, available_quantity: 50, is_seated: true }
        ]
      });

      const makeSeats = (row, startNum) => [0, 1, 2, 3, 4].map(i => ({
        id: `seat-${row}-${startNum + i}`,
        session_seat_id: `ss-${row}-${startNum + i}`,
        label: `${row}${startNum + i}`,
        row_label: row,
        seat_number: startNum + i,
        is_disabled: false,
        status: 'AVAILABLE',
        ticket_type_ids: ['tt-gold']
      }));

      userService.getProfile.mockResolvedValue({
        id: 'user-cims',
        full_name: 'CIMS',
        email: 'cimscinema@gmail.com',
        phone: '0901234567'
      });
      eventsRepository.findPublicEvents.mockResolvedValue({ rows: [seatedEvent] });
      eventsService.getPublicEventDetail.mockResolvedValue(seatedEvent);
      eventsService.getSessionSeats.mockResolvedValue({
        seats: [...makeSeats('A', 10), ...makeSeats('B', 10)]
      });
      eventsService.holdSeats.mockResolvedValue({
        hold_expires_at: new Date(NOW + 15 * 60 * 1000).toISOString()
      });

      db.query.mockImplementation(async (sql) => {
        if (sql.includes('WHERE (e.id::text = $1 OR e.slug = $1)')) {
          return { rows: [seatedEvent] };
        }
        return { rows: [] };
      });

      // Turn 1: user books 3 tickets -> auto-fills slot 1 with CIMS
      const r1 = await aiService.chat('user-cims', 'đặt giúp tôi 3 vé sự kiện Vietnam Acoustic Nights 2029', [], {});
      const m1 = r1.content.match(/\[ACTION:BOOKING_PROPOSAL:([^\]]+)\]/);
      expect(m1).toBeTruthy();
      const p1 = JSON.parse(decodeURIComponent(m1[1]));
      expect(p1.attendees).toHaveLength(1);
      expect(p1.isAttendeesComplete).toBe(false);

      // Turn 2: user provides 2 remaining attendees -> 3/3 complete
      const attendeeMsg = 'Nguyễn Văn B, bbb@gmail.com\nNguyễn Văn C, ccc@gmail.com';
      const hist1 = [
        { role: 'user', content: 'đặt giúp tôi 3 vé sự kiện Vietnam Acoustic Nights 2029' },
        { role: 'assistant', content: r1.content }
      ];
      const r2 = await aiService.chat('user-cims', attendeeMsg, hist1, {});
      const m2 = r2.content.match(/\[ACTION:BOOKING_PROPOSAL:([^\]]+)\]/);
      expect(m2).toBeTruthy();
      const p2 = JSON.parse(decodeURIComponent(m2[1]));
      expect(p2.attendees.map(a => a.email)).toEqual(['cimscinema@gmail.com', 'bbb@gmail.com', 'ccc@gmail.com']);
      expect(p2.isAttendeesComplete).toBe(true);

      // Turn 3: user switches to row B -> must keep row B seats AND all 3 attendees
      const hist2 = [
        ...hist1,
        { role: 'user', content: attendeeMsg },
        { role: 'assistant', content: r2.content }
      ];
      const r3 = await aiService.chat('user-cims', 'Đổi sang hàng ghế B', hist2, {});
      const m3 = r3.content.match(/\[ACTION:BOOKING_PROPOSAL:([^\]]+)\]/);
      expect(m3).toBeTruthy();
      const p3 = JSON.parse(decodeURIComponent(m3[1]));
      expect(p3.seats.every(s => s.row_label === 'B')).toBe(true);
      expect(p3.attendees).toHaveLength(3);
      expect(p3.attendees.map(a => a.email)).toEqual(['cimscinema@gmail.com', 'bbb@gmail.com', 'ccc@gmail.com']);
      expect(p3.isAttendeesComplete).toBe(true);
    });

    test('replaces default buyer placeholder completely when user provides all 3 attendees (even on a single line)', async () => {
      const seatedEvent = buildUpcomingEvent({
        id: 'ev-acoustic-2',
        title: 'Vietnam Acoustic Nights 2029',
        slug: 'vietnam-acoustic-nights-2029',
        require_attendee_info: true,
        sessions: [
          { id: 'sess-acoustic-1', session_name: 'Acoustic Opening Night', start_time: FUTURE_START, end_time: FUTURE_END, seat_map_id: 'sm-1', has_seat_map: true }
        ],
        ticket_types: [
          { id: 'tt-gold', name: 'Khu vực Hạng A (Gold)', price: 50000, available_quantity: 50, is_seated: true }
        ]
      });

      const makeSeats = (row, startNum) => [0, 1, 2, 3, 4].map(i => ({
        id: `seat-${row}-${startNum + i}`,
        session_seat_id: `ss-${row}-${startNum + i}`,
        label: `${row}${startNum + i}`,
        row_label: row,
        seat_number: startNum + i,
        is_disabled: false,
        status: 'AVAILABLE',
        ticket_type_ids: ['tt-gold']
      }));

      userService.getProfile.mockResolvedValue({
        id: 'user-cims',
        full_name: 'CIMS',
        email: 'cimscinema@gmail.com',
        phone: '0901234567'
      });
      eventsRepository.findPublicEvents.mockResolvedValue({ rows: [seatedEvent] });
      eventsService.getPublicEventDetail.mockResolvedValue(seatedEvent);
      eventsService.getSessionSeats.mockResolvedValue({
        seats: [...makeSeats('A', 10), ...makeSeats('B', 10)]
      });
      eventsService.holdSeats.mockResolvedValue({
        hold_expires_at: new Date(NOW + 15 * 60 * 1000).toISOString()
      });

      db.query.mockImplementation(async (sql) => {
        if (sql.includes('WHERE (e.id::text = $1 OR e.slug = $1)')) {
          return { rows: [seatedEvent] };
        }
        return { rows: [] };
      });

      // Turn 1: auto-populates CIMS as initial placeholder (1/3)
      const r1 = await aiService.chat('user-cims', 'đặt giúp tôi 3 vé sự kiện Vietnam Acoustic Nights 2029', [], {});
      const m1 = r1.content.match(/\[ACTION:BOOKING_PROPOSAL:([^\]]+)\]/);
      expect(JSON.parse(decodeURIComponent(m1[1])).attendees).toHaveLength(1);

      // Turn 2: user enters ALL 3 new attendees on a single line -> CIMS must NOT remain at index 0
      const full3Msg = 'Nguyễn Văn A, aaa@gmail.com Nguyễn Văn B, bbb@gmail.com Nguyễn Văn C, ccc@gmail.com';
      const hist1 = [
        { role: 'user', content: 'đặt giúp tôi 3 vé sự kiện Vietnam Acoustic Nights 2029' },
        { role: 'assistant', content: r1.content }
      ];
      const r2 = await aiService.chat('user-cims', full3Msg, hist1, {});
      const m2 = r2.content.match(/\[ACTION:BOOKING_PROPOSAL:([^\]]+)\]/);
      const p2 = JSON.parse(decodeURIComponent(m2[1]));
      expect(p2.attendees).toEqual([
        { name: 'Nguyễn Văn A', email: 'aaa@gmail.com' },
        { name: 'Nguyễn Văn B', email: 'bbb@gmail.com' },
        { name: 'Nguyễn Văn C', email: 'ccc@gmail.com' }
      ]);
      expect(p2.isAttendeesComplete).toBe(true);

      // Turn 3: switching row keeps A, B, C (still no CIMS)
      const hist2 = [
        ...hist1,
        { role: 'user', content: full3Msg },
        { role: 'assistant', content: r2.content }
      ];
      const r3 = await aiService.chat('user-cims', 'Đổi sang hàng ghế B', hist2, {});
      const m3 = r3.content.match(/\[ACTION:BOOKING_PROPOSAL:([^\]]+)\]/);
      const p3 = JSON.parse(decodeURIComponent(m3[1]));
      expect(p3.attendees).toEqual([
        { name: 'Nguyễn Văn A', email: 'aaa@gmail.com' },
        { name: 'Nguyễn Văn B', email: 'bbb@gmail.com' },
        { name: 'Nguyễn Văn C', email: 'ccc@gmail.com' }
      ]);
    });

    test('edits a single attendee on a completed 3-ticket proposal without changing quantity or seats', async () => {
      const seatedEvent = buildUpcomingEvent({
        id: 'ev-acoustic-3',
        title: 'Vietnam Acoustic Nights 2029',
        slug: 'vietnam-acoustic-nights-2029',
        require_attendee_info: true,
        sessions: [
          { id: 'sess-acoustic-1', session_name: 'Acoustic Opening Night', start_time: FUTURE_START, end_time: FUTURE_END, seat_map_id: 'sm-1', has_seat_map: true }
        ],
        ticket_types: [
          { id: 'tt-gold', name: 'Khu vực Hạng A (Gold)', price: 50000, available_quantity: 50, is_seated: true }
        ]
      });

      const makeSeats = (row, startNum) => [0, 1, 2, 3, 4].map(i => ({
        id: `seat-${row}-${startNum + i}`,
        session_seat_id: `ss-${row}-${startNum + i}`,
        label: `${row}${startNum + i}`,
        row_label: row,
        seat_number: startNum + i,
        is_disabled: false,
        status: 'AVAILABLE',
        ticket_type_ids: ['tt-gold']
      }));

      userService.getProfile.mockResolvedValue({
        id: 'user-cims',
        full_name: 'CIMS',
        email: 'cimscinema@gmail.com',
        phone: '0901234567'
      });
      eventsRepository.findPublicEvents.mockResolvedValue({ rows: [seatedEvent] });
      eventsService.getPublicEventDetail.mockResolvedValue(seatedEvent);
      eventsService.getSessionSeats.mockResolvedValue({
        seats: [...makeSeats('A', 10), ...makeSeats('B', 10)]
      });
      eventsService.holdSeats.mockResolvedValue({
        hold_expires_at: new Date(NOW + 15 * 60 * 1000).toISOString()
      });
      db.query.mockImplementation(async (sql) => {
        if (sql.includes('WHERE (e.id::text = $1 OR e.slug = $1)')) {
          return { rows: [seatedEvent] };
        }
        return { rows: [] };
      });

      expect(aiService.parseQuantityFromText('đổi 1 người tham dự thành cims, cims@gmail.com')).toBeNull();

      const r1 = await aiService.chat('user-cims', 'đặt giúp tôi 3 vé sự kiện Vietnam Acoustic Nights 2029', [], {});
      const full3Msg = 'Nguyễn Văn A, aaa@gmail.com\nNguyễn Văn B, bbb@gmail.com\nNguyễn Văn C, ccc@gmail.com';
      const hist1 = [
        { role: 'user', content: 'đặt giúp tôi 3 vé sự kiện Vietnam Acoustic Nights 2029' },
        { role: 'assistant', content: r1.content }
      ];
      const r2 = await aiService.chat('user-cims', full3Msg, hist1, {});
      const hist2 = [
        ...hist1,
        { role: 'user', content: full3Msg },
        { role: 'assistant', content: r2.content }
      ];

      // Edit slot 1 via "đổi 1 người tham dự thành cims, cims@gmail.com" -> MUST keep 3 tickets!
      const editMsg1 = 'đổi 1 người tham dự thành cims, cims@gmail.com';
      const r3 = await aiService.chat('user-cims', editMsg1, hist2, {});
      const m3 = r3.content.match(/\[ACTION:BOOKING_PROPOSAL:([^\]]+)\]/);
      const p3 = JSON.parse(decodeURIComponent(m3[1]));
      expect(p3.quantity).toBe(3);
      expect(p3.totalAmount).toBe(150000);
      expect(p3.seats).toHaveLength(3);
      expect(p3.attendees).toEqual([
        { name: 'cims', email: 'cims@gmail.com' },
        { name: 'Nguyễn Văn B', email: 'bbb@gmail.com' },
        { name: 'Nguyễn Văn C', email: 'ccc@gmail.com' }
      ]);
      expect(p3.isAttendeesComplete).toBe(true);

      // Edit named attendee -> "thay Nguyễn Văn B thành Trần Thị D, ddd@gmail.com"
      const hist3 = [
        ...hist2,
        { role: 'user', content: editMsg1 },
        { role: 'assistant', content: r3.content }
      ];
      const editMsg2 = 'thay Nguyễn Văn B thành Trần Thị D, ddd@gmail.com';
      const r4 = await aiService.chat('user-cims', editMsg2, hist3, {});
      const m4 = r4.content.match(/\[ACTION:BOOKING_PROPOSAL:([^\]]+)\]/);
      const p4 = JSON.parse(decodeURIComponent(m4[1]));
      expect(p4.quantity).toBe(3);
      expect(p4.attendees).toEqual([
        { name: 'cims', email: 'cims@gmail.com' },
        { name: 'Trần Thị D', email: 'ddd@gmail.com' },
        { name: 'Nguyễn Văn C', email: 'ccc@gmail.com' }
      ]);

      // Follow-up seat row change preserves edited attendees [cims, Trần Thị D, Nguyễn Văn C]
      const hist4 = [
        ...hist3,
        { role: 'user', content: editMsg2 },
        { role: 'assistant', content: r4.content }
      ];
      const r5 = await aiService.chat('user-cims', 'Đổi sang hàng ghế B', hist4, {});
      const m5 = r5.content.match(/\[ACTION:BOOKING_PROPOSAL:([^\]]+)\]/);
      const p5 = JSON.parse(decodeURIComponent(m5[1]));
      expect(p5.quantity).toBe(3);
      expect(p5.seats.every(s => s.row_label === 'B')).toBe(true);
      expect(p5.attendees).toEqual([
        { name: 'cims', email: 'cims@gmail.com' },
        { name: 'Trần Thị D', email: 'ddd@gmail.com' },
        { name: 'Nguyễn Văn C', email: 'ccc@gmail.com' }
      ]);
    });
  });

  describe('Same-row seat change default vs explicit row change', () => {
    const setupSeatedEvent = (rowASeatNums, rowBSeatNums = [10, 11, 12, 13, 14]) => {
      const seatedEvent = buildUpcomingEvent({
        id: 'ev-acoustic-same-row',
        title: 'Vietnam Acoustic Nights 2029',
        slug: 'vietnam-acoustic-nights-2029',
        require_attendee_info: true,
        sessions: [
          { id: 'sess-acoustic-1', session_name: 'Acoustic Opening Night', start_time: FUTURE_START, end_time: FUTURE_END, seat_map_id: 'sm-1', has_seat_map: true }
        ],
        ticket_types: [
          { id: 'tt-gold', name: 'Khu vực Hạng A (Gold)', price: 50000, available_quantity: 50, is_seated: true }
        ]
      });

      const toSeats = (row, nums) => nums.map(num => ({
        id: `seat-${row}-${num}`,
        session_seat_id: `ss-${row}-${num}`,
        label: `${row}${num}`,
        row_label: row,
        seat_number: num,
        is_disabled: false,
        status: 'AVAILABLE',
        ticket_type_ids: ['tt-gold']
      }));

      userService.getProfile.mockResolvedValue({
        id: 'user-cims',
        full_name: 'CIMS',
        email: 'cimscinema@gmail.com',
        phone: '0901234567'
      });
      eventsRepository.findPublicEvents.mockResolvedValue({ rows: [seatedEvent] });
      eventsService.getPublicEventDetail.mockResolvedValue(seatedEvent);
      eventsService.getSessionSeats.mockResolvedValue({
        seats: [...toSeats('A', rowASeatNums), ...toSeats('B', rowBSeatNums)]
      });
      eventsService.holdSeats.mockResolvedValue({
        hold_expires_at: new Date(NOW + 15 * 60 * 1000).toISOString()
      });
      db.query.mockImplementation(async (sql) => {
        if (sql.includes('WHERE (e.id::text = $1 OR e.slug = $1)')) {
          return { rows: [seatedEvent] };
        }
        return { rows: [] };
      });
    };

    const parseProposal = (reply) => {
      const match = reply.content.match(/\[ACTION:BOOKING_PROPOSAL:([^\]]+)\]/);
      expect(match).toBeTruthy();
      return JSON.parse(decodeURIComponent(match[1]));
    };

    test('"đổi ghế khác" and "đổi 3 ghế khác" default to other disjoint seats on the SAME row when available', async () => {
      // Row A has 6 seats [A10..A15]; CENTER initial pick takes middle [A12, A13, A14] or [A11, A12, A13], wait - with 6 seats center has A10..A12 and A13..A15 disjoint!
      setupSeatedEvent([10, 11, 12, 13, 14, 15]);
      const r1 = await aiService.chat('user-cims', 'đặt giúp tôi 3 vé sự kiện Vietnam Acoustic Nights 2029', [], {});
      const p1 = parseProposal(r1);
      expect(p1.seats.every(s => s.row_label === 'A')).toBe(true);
      const initialLabels = p1.seats.map(s => s.label);

      const hist1 = [
        { role: 'user', content: 'đặt giúp tôi 3 vé sự kiện Vietnam Acoustic Nights 2029' },
        { role: 'assistant', content: r1.content }
      ];
      const r2 = await aiService.chat('user-cims', 'đổi ghế khác', hist1, {});
      const p2 = parseProposal(r2);
      expect(p2.quantity).toBe(3);
      expect(p2.seats.every(s => s.row_label === 'A')).toBe(true);
      expect(p2.seats.map(s => s.label)).not.toEqual(initialLabels);

      // Even specifying the same quantity ("đổi 3 ghế khác") keeps same-row replacement and does not return identical seats
      const hist2 = [
        ...hist1,
        { role: 'user', content: 'đổi ghế khác' },
        { role: 'assistant', content: r2.content }
      ];
      const r3 = await aiService.chat('user-cims', 'đổi 3 ghế khác', hist2, {});
      const p3 = parseProposal(r3);
      expect(p3.quantity).toBe(3);
      expect(p3.seats.every(s => s.row_label === 'A')).toBe(true);
      expect(p3.seats.map(s => s.label)).not.toEqual(p2.seats.map(s => s.label));
    });

    test('"đổi ghế" shifts to another contiguous combination on the SAME row when no fully disjoint slice remains', async () => {
      // Row A has 5 seats [A10..A14] -> initial 3-seat center slice is [A11, A12, A13]; shifted slices [A10, A11, A12] / [A12, A13, A14] exist on Row A
      setupSeatedEvent([10, 11, 12, 13, 14]);
      const r1 = await aiService.chat('user-cims', 'đặt giúp tôi 3 vé sự kiện Vietnam Acoustic Nights 2029', [], {});
      const p1 = parseProposal(r1);
      expect(p1.seats.every(s => s.row_label === 'A')).toBe(true);
      const initialLabels = p1.seats.map(s => s.label);

      const hist1 = [
        { role: 'user', content: 'đặt giúp tôi 3 vé sự kiện Vietnam Acoustic Nights 2029' },
        { role: 'assistant', content: r1.content }
      ];
      const r2 = await aiService.chat('user-cims', 'đổi ghế', hist1, {});
      const p2 = parseProposal(r2);
      expect(p2.quantity).toBe(3);
      expect(p2.seats.every(s => s.row_label === 'A')).toBe(true);
      expect(p2.seats.map(s => s.label)).not.toEqual(initialLabels);
    });

    test('"đổi ghế khác" moves to Row B only when current Row A has no other valid contiguous slice', async () => {
      // Row A has ONLY 3 seats [A12, A13, A14] -> zero alternative 3-seat combinations remain on Row A
      setupSeatedEvent([12, 13, 14]);
      const r1 = await aiService.chat('user-cims', 'đặt giúp tôi 3 vé sự kiện Vietnam Acoustic Nights 2029', [], {});
      const p1 = parseProposal(r1);
      expect(p1.seats.map(s => s.label)).toEqual(['A12', 'A13', 'A14']);

      const hist1 = [
        { role: 'user', content: 'đặt giúp tôi 3 vé sự kiện Vietnam Acoustic Nights 2029' },
        { role: 'assistant', content: r1.content }
      ];
      const r2 = await aiService.chat('user-cims', 'đổi ghế khác', hist1, {});
      const p2 = parseProposal(r2);
      expect(p2.quantity).toBe(3);
      expect(p2.seats.every(s => s.row_label === 'B')).toBe(true);
    });

    test('"đổi hàng ghế khác" explicitly excludes Row A and switches to Row B even when Row A has other seats', async () => {
      setupSeatedEvent([10, 11, 12, 13, 14, 15]);
      const r1 = await aiService.chat('user-cims', 'đặt giúp tôi 3 vé sự kiện Vietnam Acoustic Nights 2029', [], {});
      const p1 = parseProposal(r1);
      expect(p1.seats.every(s => s.row_label === 'A')).toBe(true);

      const hist1 = [
        { role: 'user', content: 'đặt giúp tôi 3 vé sự kiện Vietnam Acoustic Nights 2029' },
        { role: 'assistant', content: r1.content }
      ];
      const r2 = await aiService.chat('user-cims', 'đổi hàng ghế khác', hist1, {});
      const p2 = parseProposal(r2);
      expect(p2.quantity).toBe(3);
      expect(p2.seats.every(s => s.row_label === 'B')).toBe(true);
    });
  });

  describe('Adding tickets while restoring historical/profile attendees', () => {
    const setupMultiRowEvent = () => {
      const seatedEvent = buildUpcomingEvent({
        id: 'ev-acoustic-add-restore',
        title: 'Vietnam Acoustic Nights 2029',
        slug: 'vietnam-acoustic-nights-2029',
        require_attendee_info: true,
        sessions: [
          { id: 'sess-acoustic-1', session_name: 'Acoustic Opening Night', start_time: FUTURE_START, end_time: FUTURE_END, seat_map_id: 'sm-1', has_seat_map: true }
        ],
        ticket_types: [
          { id: 'tt-gold', name: 'Khu vực Hạng A (Gold)', price: 50000, available_quantity: 50, is_seated: true }
        ]
      });

      const makeRowSeats = (row, nums) => nums.map(num => ({
        id: `seat-${row}-${num}`,
        session_seat_id: `ss-${row}-${num}`,
        label: `${row}${num}`,
        row_label: row,
        seat_number: num,
        is_disabled: false,
        status: 'AVAILABLE',
        ticket_type_ids: ['tt-gold']
      }));

      userService.getProfile.mockResolvedValue({
        id: 'user-cims',
        full_name: 'CIMS',
        email: 'cimscinema@gmail.com',
        phone: '0901234567'
      });
      eventsRepository.findPublicEvents.mockResolvedValue({ rows: [seatedEvent] });
      eventsService.getPublicEventDetail.mockResolvedValue(seatedEvent);
      eventsService.getSessionSeats.mockResolvedValue({
        seats: [
          ...makeRowSeats('A', [10, 11, 12, 13, 14, 15]),
          ...makeRowSeats('D', [8, 9, 10, 11, 12, 13])
        ]
      });
      eventsService.holdSeats.mockResolvedValue({
        hold_expires_at: new Date(NOW + 15 * 60 * 1000).toISOString()
      });
      db.query.mockImplementation(async (sql) => {
        if (sql.includes('WHERE (e.id::text = $1 OR e.slug = $1)')) {
          return { rows: [seatedEvent] };
        }
        return { rows: [] };
      });
    };

    const parseProposal = (reply) => {
      const match = reply.content.match(/\[ACTION:BOOKING_PROPOSAL:([^\]]+)\]/);
      expect(match).toBeTruthy();
      return JSON.parse(decodeURIComponent(match[1]));
    };

    test('handles "đặt thêm 1 vé nữa, lấy lại thông tin người tham dự CIMS lúc nãy" after attendee replacement and row change', async () => {
      setupMultiRowEvent();
      const history = [];

      const sendTurn = async (msg) => {
        const res = await aiService.chat('user-cims', msg, [...history], {});
        history.push({ role: 'user', content: msg }, { role: 'assistant', content: res.content });
        return res;
      };

      const r1 = await sendTurn('đặt giúp tôi 3 vé sự kiện Vietnam acoustic');
      expect(parseProposal(r1).quantity).toBe(3);

      const r2 = await sendTurn('Nguyễn Văn A, aaa@gmail.com Nguyễn Văn B, bbb@gmail.com');
      expect(parseProposal(r2).attendees.map(a => a.email)).toEqual(['cimscinema@gmail.com', 'aaa@gmail.com', 'bbb@gmail.com']);

      const r3 = await sendTurn('đổi ghế khác');
      const p3 = parseProposal(r3);
      expect(p3.seats.every(s => s.row_label === 'A')).toBe(true);

      const r4 = await sendTurn('đổi người tham dự CIMS thành Nguyễn Văn C, ccc@gmail.com');
      const p4 = parseProposal(r4);
      expect(p4.note).toBeNull();
      expect(p4.attendees).toEqual([
        { name: 'Nguyễn Văn C', email: 'ccc@gmail.com' },
        { name: 'Nguyễn Văn A', email: 'aaa@gmail.com' },
        { name: 'Nguyễn Văn B', email: 'bbb@gmail.com' }
      ]);

      const r5 = await sendTurn('đổi hàng ghế D');
      const p5 = parseProposal(r5);
      expect(p5.seats.every(s => s.row_label === 'D')).toBe(true);

      const r6 = await sendTurn('đặt thêm 1 vé nữa, lấy lại thông tin người tham dự CIMS lúc nãy');
      const p6 = parseProposal(r6);
      expect(p6.quantity).toBe(4);
      expect(p6.seats).toHaveLength(4);
      expect(p6.seats.every(s => s.row_label === 'D')).toBe(true);
      expect(p6.totalAmount).toBe(200000);
      expect(p6.isAttendeesComplete).toBe(true);
      expect(p6.attendees).toEqual([
        { name: 'Nguyễn Văn C', email: 'ccc@gmail.com' },
        { name: 'Nguyễn Văn A', email: 'aaa@gmail.com' },
        { name: 'Nguyễn Văn B', email: 'bbb@gmail.com' },
        { name: 'CIMS', email: 'cimscinema@gmail.com', phone: '0901234567' }
      ]);
    });

    test('restores a previously replaced non-profile attendee when user asks "thêm 1 vé nữa, lấy lại thông tin người tham dự <name> lúc nãy"', async () => {
      setupMultiRowEvent();
      const history = [];
      const sendTurn = async (msg) => {
        const res = await aiService.chat('user-cims', msg, [...history], {});
        history.push({ role: 'user', content: msg }, { role: 'assistant', content: res.content });
        return res;
      };

      await sendTurn('đặt giúp tôi 2 vé sự kiện Vietnam acoustic');
      await sendTurn('Nguyễn Văn X, xxx@gmail.com\nNguyễn Văn Y, yyy@gmail.com');
      await sendTurn('đổi người tham dự Nguyễn Văn X thành Trần Thị Z, zzz@gmail.com');

      const r4 = await sendTurn('thêm 1 vé nữa, lấy lại thông tin người tham dự Nguyễn Văn X lúc nãy');
      const p4 = parseProposal(r4);
      expect(p4.quantity).toBe(3);
      expect(p4.isAttendeesComplete).toBe(true);
      expect(p4.attendees).toEqual([
        { name: 'Trần Thị Z', email: 'zzz@gmail.com' },
        { name: 'Nguyễn Văn Y', email: 'yyy@gmail.com' },
        { name: 'Nguyễn Văn X', email: 'xxx@gmail.com' }
      ]);
    });
  });

  describe('Tier switching ("đổi hạng ghế khác" / "đổi loại ghế khác") vs row/seat switching', () => {
    const setupMultiTierEvent = () => {
      const seatedEvent = buildUpcomingEvent({
        id: 'ev-acoustic-multi-tier',
        title: 'Vietnam Acoustic Nights 2029',
        slug: 'vietnam-acoustic-nights-2029',
        require_attendee_info: true,
        sessions: [
          { id: 'sess-acoustic-1', session_name: 'Acoustic Opening Night', start_time: FUTURE_START, end_time: FUTURE_END, seat_map_id: 'sm-1', has_seat_map: true }
        ],
        ticket_types: [
          { id: 'tt-std-unseated', name: 'Standard Pass', price: 50000, available_quantity: 120, is_seated: false, event_session_id: 'sess-acoustic-1' },
          { id: 'tt-gold', name: 'Khu vực Hạng A (Gold)', price: 50000, available_quantity: 50, is_seated: true, event_session_id: 'sess-acoustic-1' },
          { id: 'tt-econ', name: 'Khu vực Economy', price: 100000, available_quantity: 50, is_seated: true, event_session_id: 'sess-acoustic-1' },
          { id: 'tt-vip', name: 'Khu vực VIP', price: 200000, available_quantity: 40, is_seated: true, event_session_id: 'sess-acoustic-1' }
        ]
      });

      const makeTierSeats = (row, nums, tierId) => nums.map(num => ({
        id: `seat-${row}-${num}`,
        session_seat_id: `ss-${row}-${num}`,
        label: `${row}${num}`,
        row_label: row,
        seat_number: num,
        is_disabled: false,
        status: 'AVAILABLE',
        ticket_type_ids: [tierId]
      }));

      userService.getProfile.mockResolvedValue({
        id: 'user-cims',
        full_name: 'CIMS',
        email: 'cimscinema@gmail.com',
        phone: '0901234567'
      });
      eventsRepository.findPublicEvents.mockResolvedValue({ rows: [seatedEvent] });
      eventsService.getPublicEventDetail.mockResolvedValue(seatedEvent);
      eventsService.getSessionSeats.mockResolvedValue({
        seats: [
          ...makeTierSeats('A', [10, 11, 12, 13, 14, 15], 'tt-gold'),
          ...makeTierSeats('B', [10, 11, 12, 13, 14, 15], 'tt-gold'),
          ...makeTierSeats('E', [1, 2, 3, 4, 5, 6], 'tt-econ'),
          ...makeTierSeats('V', [1, 2, 3, 4, 5, 6], 'tt-vip'),
          ...makeTierSeats('W', [1, 2, 3, 4, 5, 6], 'tt-vip')
        ]
      });
      eventsService.holdSeats.mockResolvedValue({
        hold_expires_at: new Date(NOW + 15 * 60 * 1000).toISOString()
      });
      db.query.mockImplementation(async (sql) => {
        if (sql.includes('WHERE (e.id::text = $1 OR e.slug = $1)')) {
          return { rows: [seatedEvent] };
        }
        return { rows: [] };
      });
    };

    const parseProposal = (reply) => {
      const match = reply.content.match(/\[ACTION:BOOKING_PROPOSAL:([^\]]+)\]/);
      expect(match).toBeTruthy();
      return JSON.parse(decodeURIComponent(match[1]));
    };

    test('"đổi hạng ghế khác" and "đổi loại ghế khác" switch ticket tiers instead of switching rows or same-row seats', async () => {
      setupMultiTierEvent();
      const history = [];
      const sendTurn = async (msg) => {
        const res = await aiService.chat('user-cims', msg, [...history], {});
        history.push({ role: 'user', content: msg }, { role: 'assistant', content: res.content });
        return res;
      };

      const r1 = await sendTurn('đặt giúp tôi 4 vé sự kiện Vietnam acoustic');
      const p1 = parseProposal(r1);
      expect(p1.ticket_type_id).toBe('tt-gold');
      expect(p1.totalAmount).toBe(200000);

      // "đổi hạng ghế khác" must switch tier (Gold -> Economy), NOT row (A -> B in Gold)
      const r2 = await sendTurn('đổi hạng ghế khác');
      const p2 = parseProposal(r2);
      expect(p2.quantity).toBe(4);
      expect(p2.ticket_type_id).toBe('tt-econ');
      expect(p2.ticketTypeName).toBe('Khu vực Economy');
      expect(p2.totalAmount).toBe(400000);
      expect(p2.seats.every(s => s.row_label === 'E')).toBe(true);

      // "đổi loại ghế khác" must cycle to the next tier (Economy -> VIP), NOT stay in Economy
      const r3 = await sendTurn('đổi loại ghế khác');
      const p3 = parseProposal(r3);
      expect(p3.quantity).toBe(4);
      expect(p3.ticket_type_id).toBe('tt-vip');
      expect(p3.ticketTypeName).toBe('Khu vực VIP');
      expect(p3.totalAmount).toBe(800000);
      expect(p3.seats.every(s => s.row_label === 'V')).toBe(true);

      // "đổi hàng ghế khác" still changes row within the current tier (V -> W in VIP)
      const r4 = await sendTurn('đổi hàng ghế khác');
      const p4 = parseProposal(r4);
      expect(p4.ticket_type_id).toBe('tt-vip');
      expect(p4.seats.every(s => s.row_label === 'W')).toBe(true);

      // "đổi ghế khác" still changes seats within the same row W and same tier VIP
      const r5 = await sendTurn('đổi ghế khác');
      const p5 = parseProposal(r5);
      expect(p5.ticket_type_id).toBe('tt-vip');
      expect(p5.seats.every(s => s.row_label === 'W')).toBe(true);
      expect(p5.seats.map(s => s.label)).not.toEqual(p4.seats.map(s => s.label));
    });
  });

  describe('Chatbot dedicated fallback model isolation', () => {
    const openEndedQuery = 'Mình muốn tìm hoạt động phù hợp cho nhóm bạn thích không khí sôi động vào buổi tối với chi phí hợp lý, bạn phân tích và gợi ý lựa chọn tốt nhất trên hệ thống giúp mình nhé.';

    beforeEach(() => {
      eventsRepository.findPublicEvents.mockResolvedValue({ rows: [] });
      db.query.mockResolvedValue({ rows: [] });
      userService.getProfile.mockResolvedValue({
        id: 'user-cims',
        full_name: 'CIMS',
        email: 'cimscinema@gmail.com',
        phone: '0901234567'
      });
    });

    test('passes OLLAMA_CHAT_FALLBACK_MODEL instead of OLLAMA_FALLBACK_MODEL to ollamaClient.chat', async () => {
      const prevChatFb = process.env.OLLAMA_CHAT_FALLBACK_MODEL;
      const prevGenericFb = process.env.OLLAMA_FALLBACK_MODEL;
      process.env.OLLAMA_CHAT_FALLBACK_MODEL = 'eventhub-qwen3:latest';
      process.env.OLLAMA_FALLBACK_MODEL = 'qwen3-eventhub-Q4_K_M.gguf';
      ollamaClient.chat.mockResolvedValueOnce({
        content: 'Dạ Eve gợi ý bạn tham khảo các sự kiện phù hợp trên EventHub nhé.',
        tool_calls: []
      });

      try {
        await aiService.chat('user-cims', openEndedQuery, [], {});
        expect(ollamaClient.chat).toHaveBeenCalledTimes(1);
        const callOpts = ollamaClient.chat.mock.calls[0][1];
        expect(callOpts.fallbackModel).toBe('eventhub-qwen3:latest');
      } finally {
        if (prevChatFb === undefined) delete process.env.OLLAMA_CHAT_FALLBACK_MODEL;
        else process.env.OLLAMA_CHAT_FALLBACK_MODEL = prevChatFb;
        if (prevGenericFb === undefined) delete process.env.OLLAMA_FALLBACK_MODEL;
        else process.env.OLLAMA_FALLBACK_MODEL = prevGenericFb;
      }
    });

    test('passes fallbackModel: null when OLLAMA_CHAT_FALLBACK_MODEL is empty or points to an extractor model', async () => {
      const prevChatFb = process.env.OLLAMA_CHAT_FALLBACK_MODEL;
      const prevGenericFb = process.env.OLLAMA_FALLBACK_MODEL;
      process.env.OLLAMA_CHAT_FALLBACK_MODEL = 'qwen3-eventhub-Q4_K_M.gguf';
      process.env.OLLAMA_FALLBACK_MODEL = 'qwen3-eventhub-Q4_K_M.gguf';
      ollamaClient.chat.mockResolvedValueOnce({
        content: 'Dạ Eve gợi ý bạn tham khảo các sự kiện phù hợp trên EventHub nhé.',
        tool_calls: []
      });

      try {
        await aiService.chat('user-cims', openEndedQuery, [], {});
        expect(ollamaClient.chat).toHaveBeenCalledTimes(1);
        const callOpts = ollamaClient.chat.mock.calls[0][1];
        expect(callOpts.fallbackModel).toBeNull();
      } finally {
        if (prevChatFb === undefined) delete process.env.OLLAMA_CHAT_FALLBACK_MODEL;
        else process.env.OLLAMA_CHAT_FALLBACK_MODEL = prevChatFb;
        if (prevGenericFb === undefined) delete process.env.OLLAMA_FALLBACK_MODEL;
        else process.env.OLLAMA_FALLBACK_MODEL = prevGenericFb;
      }
    });
  });
});
