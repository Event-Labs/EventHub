const subscriptionGuard = require('./subscriptionGuard.service');
const db = require('../../infrastructure/database/db.client');
const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');

jest.mock('../../infrastructure/database/db.client');

describe('SubscriptionGuardService', () => {
  const organizerId = 'org-123';
  const eventId = 'event-456';

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('assertActivePlan', () => {
    it('throws 403 SUBSCRIPTION_REQUIRED when no active plan exists', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      await expect(subscriptionGuard.assertActivePlan(organizerId)).rejects.toMatchObject({
        statusCode: 403,
        errorCode: ErrorCodes.SUBSCRIPTION_REQUIRED,
      });
    });

    it('returns plan when active subscription exists', async () => {
      const mockPlan = { id: 'plan-1', name: 'Chuyên Nghiệp', ai_report_enabled: true };
      db.query.mockResolvedValueOnce({ rows: [mockPlan] });

      const plan = await subscriptionGuard.assertActivePlan(organizerId);
      expect(plan).toEqual(mockPlan);
    });
  });

  describe('assertAiEventCreationAllowed', () => {
    it('throws 403 when ai_event_creation_enabled is false', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{ id: 'plan-free', name: 'Free', ai_event_creation_enabled: false }],
      });

      await expect(
        subscriptionGuard.assertAiEventCreationAllowed(organizerId),
      ).rejects.toMatchObject({
        statusCode: 403,
        errorCode: ErrorCodes.AUTH_FORBIDDEN,
      });
    });

    it('succeeds when ai_event_creation_enabled is true', async () => {
      const mockPlan = { id: 'plan-pro', name: 'Pro', ai_event_creation_enabled: true };
      db.query.mockResolvedValueOnce({ rows: [mockPlan] });

      const result = await subscriptionGuard.assertAiEventCreationAllowed(organizerId);
      expect(result).toEqual(mockPlan);
    });
  });

  describe('assertAiSeatMapAllowed', () => {
    it('throws 403 when ai_seat_map_enabled is false', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{ id: 'plan-starter', name: 'Khởi Nghiệp', ai_seat_map_enabled: false }],
      });

      await expect(
        subscriptionGuard.assertAiSeatMapAllowed(organizerId),
      ).rejects.toMatchObject({
        statusCode: 403,
        errorCode: ErrorCodes.AUTH_FORBIDDEN,
      });
    });

    it('succeeds when ai_seat_map_enabled is true', async () => {
      const mockPlan = { id: 'plan-ent', name: 'Doanh Nghiệp', ai_seat_map_enabled: true };
      db.query.mockResolvedValueOnce({ rows: [mockPlan] });

      const result = await subscriptionGuard.assertAiSeatMapAllowed(organizerId);
      expect(result).toEqual(mockPlan);
    });
  });

  describe('assertAiReportAllowed', () => {
    it('throws 403 when ai_report_enabled is false', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{ id: 'plan-starter', name: 'Khởi Nghiệp', ai_report_enabled: false }],
      });

      await expect(
        subscriptionGuard.assertAiReportAllowed(organizerId),
      ).rejects.toMatchObject({
        statusCode: 403,
        errorCode: ErrorCodes.AUTH_FORBIDDEN,
      });
    });

    it('succeeds when ai_report_enabled is true', async () => {
      const mockPlan = { id: 'plan-pro', name: 'Chuyên Nghiệp', ai_report_enabled: true };
      db.query.mockResolvedValueOnce({ rows: [mockPlan] });

      const result = await subscriptionGuard.assertAiReportAllowed(organizerId);
      expect(result).toEqual(mockPlan);
    });
  });

  describe('assertAttendeeExportAllowed', () => {
    it('throws 403 when attendee_export_enabled is false', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{ id: 'plan-free', name: 'Free', attendee_export_enabled: false }],
      });

      await expect(
        subscriptionGuard.assertAttendeeExportAllowed(organizerId),
      ).rejects.toMatchObject({
        statusCode: 403,
        errorCode: ErrorCodes.AUTH_FORBIDDEN,
      });
    });

    it('succeeds when attendee_export_enabled is true', async () => {
      const mockPlan = { id: 'plan-starter', name: 'Khởi Nghiệp', attendee_export_enabled: true };
      db.query.mockResolvedValueOnce({ rows: [mockPlan] });

      const result = await subscriptionGuard.assertAttendeeExportAllowed(organizerId);
      expect(result).toEqual(mockPlan);
    });
  });

  describe('assertManualCheckinAllowed & isManualCheckinAllowed', () => {
    it('throws 403 when manual_checkin_enabled is false', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{ id: 'plan-free', name: 'Free', manual_checkin_enabled: false }],
      });

      await expect(
        subscriptionGuard.assertManualCheckinAllowed(organizerId),
      ).rejects.toMatchObject({
        statusCode: 403,
        errorCode: ErrorCodes.AUTH_FORBIDDEN,
      });
    });

    it('succeeds when manual_checkin_enabled is true', async () => {
      const mockPlan = { id: 'plan-starter', name: 'Khởi Nghiệp', manual_checkin_enabled: true };
      db.query.mockResolvedValueOnce({ rows: [mockPlan] });

      const result = await subscriptionGuard.assertManualCheckinAllowed(organizerId);
      expect(result).toEqual(mockPlan);
    });

    it('isManualCheckinAllowed returns boolean correctly', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{ id: 'plan-starter', name: 'Khởi Nghiệp', manual_checkin_enabled: true }],
      });
      expect(await subscriptionGuard.isManualCheckinAllowed(organizerId)).toBe(true);

      db.query.mockResolvedValueOnce({
        rows: [{ id: 'plan-free', name: 'Free', manual_checkin_enabled: false }],
      });
      expect(await subscriptionGuard.isManualCheckinAllowed(organizerId)).toBe(false);

      db.query.mockResolvedValueOnce({ rows: [] });
      expect(await subscriptionGuard.isManualCheckinAllowed(organizerId)).toBe(false);
    });
  });

  describe('assertAnalyticsAllowed & assertAdvancedAnalyticsAllowed', () => {
    it('throws 403 when analytics_enabled is false', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{ id: 'plan-free', name: 'Free', analytics_enabled: false }],
      });

      await expect(
        subscriptionGuard.assertAnalyticsAllowed(organizerId),
      ).rejects.toMatchObject({
        statusCode: 403,
        errorCode: ErrorCodes.AUTH_FORBIDDEN,
      });
    });

    it('throws 403 when advanced_analytics_enabled is false', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{ id: 'plan-starter', name: 'Khởi Nghiệp', advanced_analytics_enabled: false }],
      });

      await expect(
        subscriptionGuard.assertAdvancedAnalyticsAllowed(organizerId),
      ).rejects.toMatchObject({
        statusCode: 403,
        errorCode: ErrorCodes.AUTH_FORBIDDEN,
      });
    });
  });

  describe('assertSeatMapCreationAllowed', () => {
    it('throws 403 when seat_map_enabled is false', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{ id: 'plan-free', name: 'Free', seat_map_enabled: false }],
      });

      await expect(
        subscriptionGuard.assertSeatMapCreationAllowed(organizerId),
      ).rejects.toMatchObject({
        statusCode: 403,
        errorCode: ErrorCodes.AUTH_FORBIDDEN,
      });
    });

    it('succeeds when seat_map_enabled is true', async () => {
      const mockPlan = { id: 'plan-starter', name: 'Khởi Nghiệp', seat_map_enabled: true };
      db.query.mockResolvedValueOnce({ rows: [mockPlan] });

      const result = await subscriptionGuard.assertSeatMapCreationAllowed(organizerId);
      expect(result).toEqual(mockPlan);
    });
  });

  describe('assertEventSubmitAllowed', () => {
    const mockPlan = {
      id: 'plan-starter',
      name: 'Khởi Nghiệp',
      max_active_events: 5,
      max_ticket_types_per_event: 4,
      max_tickets_per_event: 500,
      max_staff_per_event: 10,
      max_promo_codes_per_event: 5,
      promo_code_enabled: true,
      seat_map_enabled: true,
    };

    it('throws 400 when event ticket capacity exceeds max_tickets_per_event', async () => {
      db.query
        // 1. getActivePlanByOrganizerId
        .mockResolvedValueOnce({ rows: [mockPlan] })
        // 2. getOrganizerUsage (organizer total)
        .mockResolvedValueOnce({
          rows: [{ active_events: 1, ticket_types: 2, ticket_capacity: 200, staff_count: 2, promo_codes: 1, seat_map_sessions: 0 }],
        })
        // 3. getOrganizerUsage (event specific)
        .mockResolvedValueOnce({
          rows: [{ active_events: 1, ticket_types: 2, ticket_capacity: 600, staff_count: 2, promo_codes: 1, seat_map_sessions: 0 }],
        })
        // 4. check event status query
        .mockResolvedValueOnce({ rows: [{ status: 'DRAFT' }] });

      await expect(
        subscriptionGuard.assertEventSubmitAllowed(organizerId, eventId),
      ).rejects.toMatchObject({
        statusCode: 400,
        errorCode: ErrorCodes.INVALID_INPUT,
      });
    });

    it('throws 400 when seat_map_sessions > 0 and plan.seat_map_enabled is false', async () => {
      const noSeatMapPlan = { ...mockPlan, seat_map_enabled: false };
      db.query
        .mockResolvedValueOnce({ rows: [noSeatMapPlan] })
        .mockResolvedValueOnce({
          rows: [{ active_events: 1, ticket_types: 2, ticket_capacity: 200, staff_count: 2, promo_codes: 1, seat_map_sessions: 1 }],
        })
        .mockResolvedValueOnce({
          rows: [{ active_events: 1, ticket_types: 2, ticket_capacity: 200, staff_count: 2, promo_codes: 1, seat_map_sessions: 1 }],
        })
        .mockResolvedValueOnce({ rows: [{ status: 'DRAFT' }] });

      await expect(
        subscriptionGuard.assertEventSubmitAllowed(organizerId, eventId),
      ).rejects.toMatchObject({
        statusCode: 400,
        errorCode: ErrorCodes.INVALID_INPUT,
      });
    });

    it('succeeds when all usages are within limits', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [mockPlan] })
        .mockResolvedValueOnce({
          rows: [{ active_events: 1, ticket_types: 2, ticket_capacity: 200, staff_count: 2, promo_codes: 1, seat_map_sessions: 1 }],
        })
        .mockResolvedValueOnce({
          rows: [{ active_events: 1, ticket_types: 2, ticket_capacity: 200, staff_count: 2, promo_codes: 1, seat_map_sessions: 1 }],
        })
        .mockResolvedValueOnce({ rows: [{ status: 'DRAFT' }] });

      const res = await subscriptionGuard.assertEventSubmitAllowed(organizerId, eventId);
      expect(res.plan).toEqual(mockPlan);
    });
  });
});

