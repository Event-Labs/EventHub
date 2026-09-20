const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const crypto = require('crypto');
const authRepository = require('../auth/auth.repository');
const authService = require('../auth/auth.service');
const organizerEventsRepository = require('./organizerEvents.repository');
const organizerPaymentsRepository = require('../organizer-payments/organizerPayments.repository');
const subscriptionGuard = require('../organizer-subscriptions/subscriptionGuard.service');
const { validateRefundRules } = require('../refunds/refundPolicyHelper');

const ORGANIZER_PROFILE_OTP_KEY = 'organizer_profile_sensitive_otp';
const ORGANIZER_PROFILE_ACCESS_KEY = 'organizer_profile_sensitive_access';
const ORGANIZER_PROFILE_ACCESS_SECONDS = 10 * 60;
const SENSITIVE_PROFILE_FIELDS = [
  'tax_code',
  'legal_document_url',
  'business_license_url',
  'legal_representative_name',
  'legal_representative_position',
  'legal_representative_id_url',
  'authorization_letter_url',
  'individual_full_name',
  'individual_identity_number',
  'individual_id_front_url',
  'individual_id_back_url',
  'individual_selfie_url',
  'individual_tax_code',
];

function redactSensitiveProfileFields(record) {
  if (!record) return record;
  const safe = { ...record };
  SENSITIVE_PROFILE_FIELDS.forEach((field) => {
    if (field in safe) safe[field] = null;
  });
  return safe;
}

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
      max_tickets_per_order: Number.isInteger(Number(seatingRulesRaw.max_tickets_per_order)) && Number(seatingRulesRaw.max_tickets_per_order) > 0
        ? Number(seatingRulesRaw.max_tickets_per_order)
        : 10,
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
      max_tickets_per_order: Number.isInteger(Number(input.max_tickets_per_order)) && Number(input.max_tickets_per_order) > 0
        ? Math.min(Math.max(1, Number(input.max_tickets_per_order)), 100)
        : 10,
    };
  }
  if (data.require_attendee_info !== undefined) {
    data.require_attendee_info = Boolean(data.require_attendee_info);
  }
  if (data.refund_policy !== undefined) {
    const input =
      typeof data.refund_policy === 'string'
        ? JSON.parse(data.refund_policy)
        : data.refund_policy || {};
    const allowRefund = Boolean(input.allow_refund);
    if (!allowRefund) {
      data.refund_policy = {
        ...input,
        allow_refund: false,
        refund_rules: [],
        refund_notes: typeof input.refund_notes === 'string' ? input.refund_notes.trim() : '',
      };
    } else {
      const validation = validateRefundRules(input.refund_rules);
      if (!validation.isValid) {
        throw new AppError(validation.error || 'Cấu hình quy tắc hoàn vé không hợp lệ', 400, ErrorCodes.INVALID_INPUT);
      }
      data.refund_policy = {
        ...input,
        allow_refund: true,
        refund_rules: validation.rules,
        refund_notes: typeof input.refund_notes === 'string' ? input.refund_notes.trim() : '',
      };
    }
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

function toVietnamDateString(dateInput) {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

function assertValidSessionTimes(startTime, endTime, validatePast = true) {
  if (!startTime || !endTime) {
    throw new AppError('Thời gian bắt đầu và kết thúc là bắt buộc.', 400, ErrorCodes.INVALID_INPUT);
  }
  const startDate = new Date(startTime);
  const endDate = new Date(endTime);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    throw new AppError('Thời gian bắt đầu hoặc kết thúc không hợp lệ.', 400, ErrorCodes.INVALID_INPUT);
  }
  if (startDate >= endDate) {
    throw new AppError('Thời gian kết thúc phải diễn ra sau thời gian bắt đầu.', 400, ErrorCodes.INVALID_INPUT);
  }
  if (toVietnamDateString(startDate) !== toVietnamDateString(endDate)) {
    throw new AppError('Mỗi phiên sự kiện phải bắt đầu và kết thúc trong cùng một ngày.', 400, ErrorCodes.INVALID_INPUT);
  }
  if (validatePast && startDate.getTime() < Date.now() - 60000) {
    throw new AppError('Thời gian bắt đầu sự kiện không được ở trong quá khứ.', 400, ErrorCodes.INVALID_INPUT);
  }
}

function assertNoOverlappingSessions(sessions) {
  if (!Array.isArray(sessions) || sessions.length <= 1) return;
  for (let i = 0; i < sessions.length; i++) {
    const sA = sessions[i];
    const startA = new Date(sA.start_time).getTime();
    const endA = new Date(sA.end_time).getTime();
    if (isNaN(startA) || isNaN(endA)) continue;

    for (let j = i + 1; j < sessions.length; j++) {
      const sB = sessions[j];
      const startB = new Date(sB.start_time).getTime();
      const endB = new Date(sB.end_time).getTime();
      if (isNaN(startB) || isNaN(endB)) continue;

      if (startA < endB && startB < endA) {
        const nameA = sA.session_name || `Phiên ${i + 1}`;
        const nameB = sB.session_name || `Phiên ${j + 1}`;
        throw new AppError(
          `Phiên "${nameA}" và phiên "${nameB}" bị trùng lặp thời gian. Các phiên sự kiện không được diễn ra đồng thời.`,
          400,
          ErrorCodes.INVALID_INPUT
        );
      }
    }
  }
}

const EDIT_LOCK_WINDOW_MS = 48 * 60 * 60 * 1000;
const SOLD_EVENT_CRITICAL_FIELDS = new Set([
  'start_time', 'end_time', 'seating_rules', 'require_attendee_info',
]);
const SOLD_TICKET_IMMUTABLE_FIELDS = new Set([
  'name', 'description', 'price', 'sale_start', 'sale_end', 'is_seated',
]);

function hasChanged(current, next) {
  if (next === undefined) return false;
  if (current instanceof Date || next instanceof Date) {
    return new Date(current).getTime() !== new Date(next).getTime();
  }
  const timestampPattern = /^\d{4}-\d{2}-\d{2}T/;
  if (timestampPattern.test(String(current || '')) && timestampPattern.test(String(next || ''))) {
    return new Date(current).getTime() !== new Date(next).getTime();
  }
  if (current && typeof current === 'object') return JSON.stringify(current) !== JSON.stringify(next);
  return String(current ?? '') !== String(next ?? '');
}

function buildEditPermissions(context, now = Date.now()) {
  const startAt = context?.start_time ? new Date(context.start_time).getTime() : null;
  const hoursUntilStart = startAt === null ? null : (startAt - now) / (60 * 60 * 1000);
  return {
    can_edit: true,
    is_time_locked: false,
    has_paid_tickets: false,
    paid_tickets: Number(context?.paid_tickets || 0),
    hours_until_start: hoursUntilStart,
    lock_window_hours: 0,
    event_status: context?.status || null,
  };
}

class OrganizerEventsService {
  async assertProfileTwoFactorEnabled(userId) {
    const user = await authRepository.findUserById(userId);
    if (!user) {
      throw new AppError('User not found', 404, ErrorCodes.AUTH_USER_NOT_FOUND);
    }
    if (!user.two_factor_enabled) {
      throw new AppError(
        'Two-factor authentication is required to view the organizer profile',
        403,
        ErrorCodes.TWO_FACTOR_REQUIRED,
      );
    }
    return user;
  }

  async hasSensitiveProfileAccess(userId, accessToken) {
    if (!accessToken) return null;
    const access = await authRepository.getOtpChallenge(ORGANIZER_PROFILE_ACCESS_KEY, accessToken);
    if (!access || access.userId !== userId || new Date(access.expiresAt).getTime() <= Date.now()) {
      return null;
    }
    return access;
  }

  async getOrganizerProfileForView(userId, accessToken) {
    await this.assertProfileTwoFactorEnabled(userId);
    const profile = await this.getActiveOrganizerProfile(userId);
    const access = await this.hasSensitiveProfileAccess(userId, accessToken);
    const sensitiveAccess = {
      unlocked: Boolean(access),
      expires_at: access?.expiresAt || null,
    };

    if (access) return { ...profile, sensitive_access: sensitiveAccess };

    return {
      ...redactSensitiveProfileFields(profile),
      source_request: redactSensitiveProfileFields(profile.source_request),
      request_history: (profile.request_history || []).map(redactSensitiveProfileFields),
      sensitive_access: sensitiveAccess,
    };
  }

  async startSensitiveProfileAccess(userId) {
    const user = await this.assertProfileTwoFactorEnabled(userId);
    await this.getActiveOrganizerProfile(userId);
    return authService.createOtpChallenge(ORGANIZER_PROFILE_OTP_KEY, {
      userId,
      email: user.email,
      subject: 'Ma OTP xem ho so xac minh Organizer EventHub',
    });
  }

  async verifySensitiveProfileAccess(userId, challengeId, otp) {
    const user = await this.assertProfileTwoFactorEnabled(userId);
    const challenge = await authService.consumeOtpChallenge(ORGANIZER_PROFILE_OTP_KEY, challengeId, otp);
    if (challenge.userId !== userId) {
      throw new AppError('Ma OTP khong hop le', 403, ErrorCodes.AUTH_FORBIDDEN);
    }

    const accessToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + ORGANIZER_PROFILE_ACCESS_SECONDS * 1000);
    await authRepository.saveOtpChallenge(ORGANIZER_PROFILE_ACCESS_KEY, accessToken, {
      userId,
      email: user.email,
      expiresAt: expiresAt.toISOString(),
    }, expiresAt);

    return { accessToken, expiresAt: expiresAt.toISOString() };
  }

  async getEditContext(eventId) {
    const context = await organizerEventsRepository.findEventEditContext(eventId);
    return { context, permissions: buildEditPermissions(context) };
  }

  assertNotTimeLocked(permissions) {
    // Edit restrictions removed: allow editing anytime
  }

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

  async updateActiveOrganizerProfile(userId, payload = {}, accessToken = null) {
    await this.assertProfileTwoFactorEnabled(userId);
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
    return this.getOrganizerProfileForView(userId, accessToken);
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
    const mapped = mapEvent(event);
    const { permissions } = await this.getEditContext(eventId);
    mapped.edit_permissions = permissions;
    return mapped;
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
    const currentEvent = await this.assertOwnsEvent(organizerId, eventId);
    const { context, permissions } = await this.getEditContext(eventId);
    this.assertNotTimeLocked(permissions);

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
      'require_attendee_info',
      'start_time',
      'end_time',
    ].forEach((key) => {
      if (data[key] !== undefined) eventFields[key] = data[key];
    });

    if (Object.keys(eventFields).length) {
      await organizerEventsRepository.updateEvent(eventId, organizerId, eventFields);
    }

    if (Array.isArray(data.sessions)) {
      assertNoOverlappingSessions(data.sessions);
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
        const existingSession = session.id ? existingSessions.find((item) => item.id === session.id) : null;
        const isNewOrChangedStartTime =
          !existingSession ||
          new Date(existingSession.start_time).getTime() !== new Date(session.start_time).getTime();

        assertValidSessionTimes(session.start_time, session.end_time, isNewOrChangedStartTime);
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

    // Business Rule: Thời điểm nộp duyệt sự kiện phải cách thời điểm bắt đầu sự kiện tối thiểu 72 giờ (Lead Time >= 72h)
    const validSessionStarts = (fullEvent.sessions || [])
      .map((s) => new Date(s.start_time).getTime())
      .filter((time) => !Number.isNaN(time));

    if (validSessionStarts.length > 0) {
      const earliestStart = Math.min(...validSessionStarts);
      const leadTimeMs = earliestStart - Date.now();
      const requiredLeadTimeMs = 72 * 60 * 60 * 1000;

      if (leadTimeMs < requiredLeadTimeMs) {
        const hoursLeft = Math.max(0, Math.round((leadTimeMs / (60 * 60 * 1000)) * 10) / 10);
        throw new AppError(
          `Sự kiện phải được nộp duyệt trước thời điểm bắt đầu tối thiểu 72 giờ (hiện tại còn ${hoursLeft} giờ). Vui lòng điều chỉnh lịch trình sự kiện để đảm bảo thời gian xét duyệt.`,
          400,
          'EVENT_SUBMIT_LEAD_TIME_INSUFFICIENT',
          { lead_time_hours: hoursLeft, required_hours: 72 }
        );
      }
    }

    const hasPaidTickets = fullEvent.ticket_types.some((tt) => Number(tt.price) > 0);
    if (hasPaidTickets) {
      const channel = await organizerPaymentsRepository.findChannelByOrganizerId(organizerId);
      if (!channel || channel.status !== 'ACTIVE') {
        throw new AppError('Bạn cần cấu hình kênh thanh toán PayOS trước khi mở bán vé cho sự kiện này.', 400, 'PAYOS_NOT_CONFIGURED');
      }
    }

    await subscriptionGuard.assertEventSubmitAllowed(organizerId, eventId);

    const event = await organizerEventsRepository.submitEvent(eventId, organizerId);
    if (!event) {
      throw new AppError('Event cannot be submitted', 400, ErrorCodes.INVALID_INPUT);
    }
    return mapEvent(event);
  }

  async publishEvent(userId, eventId) {
    const organizerId = await this.resolveOrganizerId(userId);
    await this.assertOwnsEvent(organizerId, eventId);
    await subscriptionGuard.assertPublishAllowed(organizerId);

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
    const { permissions } = await this.getEditContext(eventId);
    this.assertNotTimeLocked(permissions);

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

    const { permissions } = await this.getEditContext(eventId);
    this.assertNotTimeLocked(permissions);

    if (payload.venue_id) {
      await this.assertVenueAccessible(organizerId, payload.venue_id);
    }
    if (payload.start_time || payload.end_time) {
      const startTime = payload.start_time || session.start_time;
      const endTime = payload.end_time || session.end_time;
      const isChanged = Boolean(
        payload.start_time &&
          new Date(payload.start_time).getTime() !== new Date(session.start_time).getTime(),
      );
      assertValidSessionTimes(startTime, endTime, isChanged);
    }

    const updated = await organizerEventsRepository.updateSession(sessionId, eventId, payload);
    await organizerEventsRepository.syncEventTimesFromSessions(eventId);
    return updated;
  }

  async deleteSession(userId, eventId, sessionId) {
    const organizerId = await this.resolveOrganizerId(userId);
    await this.assertOwnsEvent(organizerId, eventId);
    const { permissions } = await this.getEditContext(eventId);
    this.assertNotTimeLocked(permissions);

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
    const { permissions } = await this.getEditContext(eventId);
    this.assertNotTimeLocked(permissions);

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
    const { permissions } = await this.getEditContext(eventId);
    this.assertNotTimeLocked(permissions);

    const updated = await organizerEventsRepository.updateTicketType(ticketTypeId, sessionId, payload);
    return updated;
  }

  async deleteTicketType(userId, eventId, sessionId, ticketTypeId) {
    const organizerId = await this.resolveOrganizerId(userId);
    await this.assertOwnsEvent(organizerId, eventId);
    const { permissions } = await this.getEditContext(eventId);
    this.assertNotTimeLocked(permissions);

    const deleted = await organizerEventsRepository.deleteTicketType(ticketTypeId, sessionId);
    if (!deleted) {
      throw new AppError('Ticket type not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    return { deleted: true };
  }

  async assignZoneTicketTypes(userId, eventId, sessionId, assignments) {
    const organizerId = await this.resolveOrganizerId(userId);
    await this.assertOwnsEvent(organizerId, eventId);
    const { permissions } = await this.getEditContext(eventId);
    this.assertNotTimeLocked(permissions);

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

  async getLatestAiContentGeneration(userId, _eventId) {
    const organizer = await organizerEventsRepository.findOrganizerByUserId(userId);
    if (!organizer) {
      throw new AppError('Organizer profile not found', 403, ErrorCodes.AUTH_FORBIDDEN);
    }
    return null;
  }

  async generateAiEventContent(userId, payload = {}) {
    const organizer = await organizerEventsRepository.findOrganizerByUserId(userId);
    if (!organizer) {
      throw new AppError('Organizer profile not found', 403, ErrorCodes.AUTH_FORBIDDEN);
    }

    const {
      topic = '',
      category_name = '',
      target_audience = '',
      key_highlights = '',
      tone = 'Chuyên nghiệp',
      event_id = null,
    } = payload;

    if (!topic || !topic.trim()) {
      throw new AppError('Chủ đề hoặc tên ý tưởng sự kiện là bắt buộc', 400, ErrorCodes.INVALID_INPUT);
    }

    const cleanTopic = topic.trim();
    const audienceText = target_audience?.trim()
      ? `dành riêng cho ${target_audience.trim()}`
      : 'dành cho tất cả khách tham dự quan tâm';
    const highlightText = key_highlights?.trim() ? ` Điểm nhấn: ${key_highlights.trim()}.` : '';

    const suggested_titles = [
      `${cleanTopic}: Khám Phá & Đột Phá 2026`,
      `Hội Tụ Đam Mê - ${cleanTopic}`,
      `Đại Hội ${cleanTopic} & Trải Nghiệm Đỉnh Cao`,
    ];

    const short_description = `Chào mừng bạn đến với ${cleanTopic} ${audienceText}.${highlightText}`.slice(0, 160);

    const content_html = `<p><strong>Chào mừng bạn đến với sự kiện ${cleanTopic}!</strong></p>
<p>Sự kiện mang đến không gian trải nghiệm đẳng cấp ${audienceText}. Đây là cơ hội tuyệt vời để giao lưu, học hỏi và kết nối những giá trị mới.</p>
<br/>
<p><strong>🌟 Hoạt động và Điểm nhấn nổi bật:</strong></p>
<ul>
  <li><strong>Chương trình chính:</strong> Trình diễn, chia sẻ kiến thức chuyên sâu và giao lưu trực tiếp.</li>
  <li><strong>Khách mời đặc biệt:</strong> ${key_highlights || 'Các chuyên gia, nghệ sĩ và diễn giả có tầm ảnh hưởng.'}</li>
  <li><strong>Trải nghiệm độc quyền:</strong> Khu vực tương tác, nhận quà lưu niệm và networking dành riêng cho người tham gia.</li>
</ul>
<br/>
<p><strong>📋 Thông tin quan trọng:</strong></p>
<ul>
  <li>Vui lòng mang theo mã vé QR khi đến cổng check-in.</li>
  <li>Tuân thủ quy định và hướng dẫn của Ban tổ chức trong suốt thời gian diễn ra sự kiện.</li>
</ul>`;

    const words = cleanTopic.split(/\s+/).filter((w) => w.length > 2);
    const tags = Array.from(
      new Set([category_name || 'Sự kiện', 'EventHub', '2026', ...words.slice(0, 3)]),
    ).filter(Boolean);

    const generatedContent = {
      suggested_titles,
      selected_title: suggested_titles[0],
      short_description,
      content_html,
      tags,
    };

    const promptData = {
      topic: cleanTopic,
      category_name,
      target_audience,
      key_highlights,
      tone,
    };

    return {
      organizer_id: organizer.id,
      event_id: event_id || null,
      prompt_data: promptData,
      generated_content: generatedContent,
    };
  }
}

module.exports = new OrganizerEventsService();


