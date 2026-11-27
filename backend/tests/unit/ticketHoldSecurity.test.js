const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

const db = require('../../src/infrastructure/database/db.client');
const eventsRepository = require('../../src/modules/events/events.repository');
const eventsService = require('../../src/modules/events/events.service');
const idempotencyService = require('../../src/core/security/idempotency.service');
const riskScoringService = require('../../src/core/security/riskScoring.service');
const { runExpirationSweep, ADVISORY_LOCK_ID } = require('../../src/modules/events/ticketHoldExpiration.worker');
const { createDistributedRateLimiter } = require('../../src/middlewares/rateLimiter.middleware');
const { client: redisClient } = require('../../src/infrastructure/redis/redis.client');

describe('EventHub Ticket Hold Security & Inventory Protection', () => {
  let testUserId1;
  let testUserId2;
  let testEventId1;
  let testEventId2;
  let testSessionId1;
  let testSessionId2;
  let testTicketTypeIdGA;
  let testTicketTypeIdSeated;
  let testSeatId1;
  let testSeatId2;
  let testSeatMapId;
  let testRawSeatId1;
  let testRawSeatId2;

  beforeAll(async () => {
    // Create test user 1
    const userRes1 = await db.query(`
      INSERT INTO users (email, full_name, status, email_verified)
      VALUES ('test_hold_sec_1@example.com', 'Test Hold User 1', 'ACTIVE', true)
      RETURNING id
    `);
    testUserId1 = userRes1.rows[0].id;

    // Create test user 2
    const userRes2 = await db.query(`
      INSERT INTO users (email, full_name, status, email_verified)
      VALUES ('test_hold_sec_2@example.com', 'Test Hold User 2', 'ACTIVE', true)
      RETURNING id
    `);
    testUserId2 = userRes2.rows[0].id;

    // Get an existing organizer or create one
    let organizerId;
    const orgRes = await db.query(`SELECT id FROM organizers LIMIT 1`);
    if (orgRes.rows[0]) {
      organizerId = orgRes.rows[0].id;
    } else {
      const newOrg = await db.query(`
        INSERT INTO organizers (user_id, business_name, status)
        VALUES ($1, 'Test Security Org', 'APPROVED')
        RETURNING id
      `, [testUserId1]);
      organizerId = newOrg.rows[0].id;
    }

    // Create or get venue
    let venueId;
    const vRes = await db.query(`SELECT id FROM venues LIMIT 1`);
    if (vRes.rows[0]) {
      venueId = vRes.rows[0].id;
    } else {
      const newV = await db.query(`
        INSERT INTO venues (name, address, city) VALUES ('Security Test Arena', '123 Test St', 'Hanoi') RETURNING id
      `);
      venueId = newV.rows[0].id;
    }

    // Create test event 1
    const eventRes1 = await db.query(`
      INSERT INTO events (
        title, slug, organizer_id, status, visibility, approval_status, sales_status,
        start_time, end_time
      ) VALUES (
        'Security Test Concert A', 'sec-test-concert-a', $1, 'PUBLISHED', 'PUBLIC', 'APPROVED', 'ON_SALE',
        NOW() + INTERVAL '5 days', NOW() + INTERVAL '6 days'
      ) RETURNING id
    `, [organizerId]);
    testEventId1 = eventRes1.rows[0].id;

    // Create test event 2
    const eventRes2 = await db.query(`
      INSERT INTO events (
        title, slug, organizer_id, status, visibility, approval_status, sales_status,
        start_time, end_time
      ) VALUES (
        'Security Test Concert B', 'sec-test-concert-b', $1, 'PUBLISHED', 'PUBLIC', 'APPROVED', 'ON_SALE',
        NOW() + INTERVAL '7 days', NOW() + INTERVAL '8 days'
      ) RETURNING id
    `, [organizerId]);
    testEventId2 = eventRes2.rows[0].id;

    // Create event sessions with venue_id
    const sessRes1 = await db.query(`
      INSERT INTO event_sessions (event_id, venue_id, start_time, end_time, status)
      VALUES ($1, $2, NOW() + INTERVAL '5 days', NOW() + INTERVAL '5 days 4 hours', 'UPCOMING')
      RETURNING id
    `, [testEventId1, venueId]);
    testSessionId1 = sessRes1.rows[0].id;

    const sessRes2 = await db.query(`
      INSERT INTO event_sessions (event_id, venue_id, start_time, end_time, status)
      VALUES ($1, $2, NOW() + INTERVAL '7 days', NOW() + INTERVAL '7 days 4 hours', 'UPCOMING')
      RETURNING id
    `, [testEventId2, venueId]);
    testSessionId2 = sessRes2.rows[0].id;

    // Create General Admission ticket type (Total: 5 tickets)
    const ttGaRes = await db.query(`
      INSERT INTO ticket_types (event_session_id, name, price, quantity, is_seated, sale_start, sale_end)
      VALUES ($1, 'GA General Pass', 100000, 5, false, NOW() - INTERVAL '1 hour', NOW() + INTERVAL '3 days')
      RETURNING id
    `, [testSessionId1]);
    testTicketTypeIdGA = ttGaRes.rows[0].id;

    // Create Seated ticket type
    const ttSeatedRes = await db.query(`
      INSERT INTO ticket_types (event_session_id, name, price, quantity, is_seated, sale_start, sale_end)
      VALUES ($1, 'VIP Seated', 500000, 10, true, NOW() - INTERVAL '1 hour', NOW() + INTERVAL '3 days')
      RETURNING id
    `, [testSessionId1]);
    testTicketTypeIdSeated = ttSeatedRes.rows[0].id;

    // Create unique seat map for this test
    const newSm = await db.query(`
      INSERT INTO seat_maps (venue_id, name, rows_count, cols_count)
      VALUES ($1, $2, 10, 10)
      RETURNING id
    `, [venueId, `Security Test Map ${Date.now()}`]);
    testSeatMapId = newSm.rows[0].id;

    // Create seats for seated test
    const s1Res = await db.query(`
      INSERT INTO seats (seat_map_id, row_label, seat_number, is_disabled)
      VALUES ($1, 'A', '01', false) RETURNING id
    `, [testSeatMapId]);
    testRawSeatId1 = s1Res.rows[0].id;

    const s2Res = await db.query(`
      INSERT INTO seats (seat_map_id, row_label, seat_number, is_disabled)
      VALUES ($1, 'A', '02', false) RETURNING id
    `, [testSeatMapId]);
    testRawSeatId2 = s2Res.rows[0].id;

    // Create session_seats
    const ss1 = await db.query(`
      INSERT INTO session_seats (event_session_id, seat_id, status)
      VALUES ($1, $2, 'AVAILABLE') RETURNING id
    `, [testSessionId1, testRawSeatId1]);
    testSeatId1 = ss1.rows[0].id;

    const ss2 = await db.query(`
      INSERT INTO session_seats (event_session_id, seat_id, status)
      VALUES ($1, $2, 'AVAILABLE') RETURNING id
    `, [testSessionId1, testRawSeatId2]);
    testSeatId2 = ss2.rows[0].id;
  });

  afterAll(async () => {
    // Cleanup test data
    if (testUserId1 || testUserId2) {
      await db.query(`DELETE FROM ticket_holds WHERE user_id IN ($1, $2)`, [testUserId1, testUserId2]);
      await db.query(`DELETE FROM ticket_hold_sessions WHERE user_id IN ($1, $2)`, [testUserId1, testUserId2]);
    }
    if (testSessionId1) {
      await db.query(`DELETE FROM session_seats WHERE event_session_id = $1`, [testSessionId1]);
      await db.query(`DELETE FROM ticket_types WHERE event_session_id = $1`, [testSessionId1]);
      await db.query(`DELETE FROM event_sessions WHERE id = $1`, [testSessionId1]);
    }
    if (testSessionId2) {
      await db.query(`DELETE FROM event_sessions WHERE id = $1`, [testSessionId2]);
    }
    if (testEventId1) await db.query(`DELETE FROM events WHERE id = $1`, [testEventId1]);
    if (testEventId2) await db.query(`DELETE FROM events WHERE id = $1`, [testEventId2]);
    if (testRawSeatId1 || testRawSeatId2) {
      await db.query(`DELETE FROM seats WHERE id IN ($1, $2)`, [testRawSeatId1, testRawSeatId2]);
    }
    if (testSeatMapId) {
      await db.query(`DELETE FROM seat_maps WHERE id = $1`, [testSeatMapId]);
    }
    if (testUserId1) await db.query(`DELETE FROM users WHERE id = $1`, [testUserId1]);
    if (testUserId2) await db.query(`DELETE FROM users WHERE id = $1`, [testUserId2]);
  });

  describe('1. Active Hold Management & Single Active Hold Constraint (Section 3)', () => {
    it('should successfully create an ACTIVE hold session with 15-minute expiration', async () => {
      const payload = {
        event_id: testEventId1,
        items: [
          {
            ticket_type_id: testTicketTypeIdGA,
            quantity: 2,
            session_seat_ids: [],
          },
        ],
      };

      const result = await eventsRepository.holdSeats(testUserId1, payload);
      expect(result).toBeDefined();
      expect(result.hold_id).toBeDefined();
      expect(result.hold_expires_at).toBeDefined();
      expect(result.hold_seconds).toBeGreaterThan(800);

      // Verify in DB that ticket_hold_sessions has exactly 1 ACTIVE session
      const sessions = await db.query(
        `SELECT * FROM ticket_hold_sessions WHERE user_id = $1 AND event_id = $2 AND status = 'ACTIVE'`,
        [testUserId1, testEventId1],
      );
      expect(sessions.rows.length).toBe(1);
    });

    it('should return the existing active hold without creating a new independent session if payload matches', async () => {
      const payload = {
        event_id: testEventId1,
        items: [
          {
            ticket_type_id: testTicketTypeIdGA,
            quantity: 2,
            session_seat_ids: [],
          },
        ],
      };

      const result = await eventsRepository.holdSeats(testUserId1, payload);
      expect(result.is_existing_hold).toBe(true);

      const sessions = await db.query(
        `SELECT COUNT(*)::int AS count FROM ticket_hold_sessions WHERE user_id = $1 AND event_id = $2 AND status = 'ACTIVE'`,
        [testUserId1, testEventId1],
      );
      expect(sessions.rows[0].count).toBe(1);
    });

    it('should safely update hold session without extending original expiration when selection changes', async () => {
      const initialHold = await eventsRepository.findActiveHoldByUserAndEvent(testUserId1, testEventId1);
      const originalExpiresAt = new Date(initialHold.hold.expiresAt).getTime();

      const updatePayload = {
        event_id: testEventId1,
        items: [
          {
            ticket_type_id: testTicketTypeIdGA,
            quantity: 3,
            session_seat_ids: [],
          },
        ],
      };

      const updated = await eventsRepository.holdSeats(testUserId1, updatePayload);
      expect(updated.hold_id).toBe(initialHold.hold.id);

      // Verify expires_at did NOT extend to a fresh 15m
      const updatedExpiresAt = new Date(updated.hold_expires_at).getTime();
      expect(Math.abs(updatedExpiresAt - originalExpiresAt)).toBeLessThan(2000); // within same second
    });

    it('should allow user to hold tickets on a different event simultaneously', async () => {
      // Create a ticket type on Event 2
      const tt2Res = await db.query(`
        INSERT INTO ticket_types (event_session_id, name, price, quantity, is_seated, sale_start, sale_end)
        VALUES ($1, 'Event 2 Ticket', 200000, 10, false, NOW() - INTERVAL '1 hour', NOW() + INTERVAL '3 days')
        RETURNING id
      `, [testSessionId2]);
      const tt2Id = tt2Res.rows[0].id;

      const payloadEvent2 = {
        event_id: testEventId2,
        items: [{ ticket_type_id: tt2Id, quantity: 1, session_seat_ids: [] }],
      };

      const resultEvent2 = await eventsRepository.holdSeats(testUserId1, payloadEvent2);
      expect(resultEvent2.hold_id).toBeDefined();

      // User now has active hold in Event 1 AND Event 2
      const allActive = await db.query(
        `SELECT event_id FROM ticket_hold_sessions WHERE user_id = $1 AND status = 'ACTIVE'`,
        [testUserId1],
      );
      expect(allActive.rows.length).toBe(2);

      // Cleanup event 2 hold
      await eventsRepository.releaseSeatHolds(testUserId1, { event_id: testEventId2 });
    });
  });

  describe('2. Active Hold Recovery API & Data Restoration (Section 4)', () => {
    it('should retrieve complete active hold data via findActiveHoldByUserAndEvent', async () => {
      const activeData = await eventsRepository.findActiveHoldByUserAndEvent(testUserId1, testEventId1);
      expect(activeData.hasActiveHold).toBe(true);
      expect(activeData.hold).toBeDefined();
      expect(activeData.hold.eventId).toBe(testEventId1);
      expect(activeData.hold.remainingSeconds).toBeGreaterThan(0);
      expect(activeData.hold.remainingItems.length).toBeGreaterThan(0);
      expect(activeData.hold.items.length).toBeGreaterThan(0);
    });

    it('should return hasActiveHold: false if user has no hold for requested event', async () => {
      const noHold = await eventsRepository.findActiveHoldByUserAndEvent(testUserId2, testEventId2);
      expect(noHold.hasActiveHold).toBe(false);
    });

    it('should release hold and return released_count when user explicitly cancels hold', async () => {
      const releaseRes = await eventsRepository.releaseSeatHolds(testUserId1, { event_id: testEventId1 });
      expect(releaseRes).toBeDefined();

      const activeAfterRelease = await eventsRepository.findActiveHoldByUserAndEvent(testUserId1, testEventId1);
      expect(activeAfterRelease.hasActiveHold).toBe(false);
    });
  });

  describe('3. Inventory Protection & Race Condition Prevention (Section 9)', () => {
    it('should prevent two users from holding the same seat simultaneously', async () => {
      // User 1 holds seat 1
      const payloadUser1 = {
        event_id: testEventId1,
        items: [
          {
            ticket_type_id: testTicketTypeIdSeated,
            quantity: 1,
            session_seat_ids: [testSeatId1],
          },
        ],
      };
      const holdUser1 = await eventsRepository.holdSeats(testUserId1, payloadUser1);
      expect(holdUser1.seats.length).toBe(1);

      // User 2 attempts to hold the same seat 1 -> must throw 409 conflict
      const payloadUser2 = {
        event_id: testEventId1,
        items: [
          {
            ticket_type_id: testTicketTypeIdSeated,
            quantity: 1,
            session_seat_ids: [testSeatId1],
          },
        ],
      };

      await expect(eventsRepository.holdSeats(testUserId2, payloadUser2)).rejects.toThrow(
        /ghế bạn chọn vừa có người đặt/i,
      );

      // Cleanup User 1 hold
      await eventsRepository.releaseSeatHolds(testUserId1, { event_id: testEventId1 });
    });

    it('should prevent overselling General Admission tickets beyond total capacity', async () => {
      // Total quantity of testTicketTypeIdGA is 5
      // User 1 holds 3 tickets
      await eventsRepository.holdSeats(testUserId1, {
        event_id: testEventId1,
        items: [{ ticket_type_id: testTicketTypeIdGA, quantity: 3, session_seat_ids: [] }],
      });

      // User 2 attempts to hold 3 tickets (3 + 3 = 6 > 5) -> must throw 409
      await expect(
        eventsRepository.holdSeats(testUserId2, {
          event_id: testEventId1,
          items: [{ ticket_type_id: testTicketTypeIdGA, quantity: 3, session_seat_ids: [] }],
        }),
      ).rejects.toThrow(/chỉ còn 2 vé khả dụng/i);

      // Cleanup
      await eventsRepository.releaseSeatHolds(testUserId1, { event_id: testEventId1 });
    });
  });

  describe('4. Idempotency Key Handling (Section 10)', () => {
    it('should return cached response for duplicate request with same Idempotency-Key and payload', async () => {
      const testKey = `test-idem-key-${Date.now()}`;
      const payload = { test: 'payload_123', eventId: testEventId1 };

      const firstCheck = await idempotencyService.lockOrGetCached(testKey, testUserId1, 'POST', '/events/hold', payload);
      expect(firstCheck.isCached).toBe(false);

      const fakeResponse = { holdId: 'fake-hold-id', success: true };
      await idempotencyService.saveResponse(testKey, firstCheck.requestHash, fakeResponse, 200);

      // Second request with same key and payload
      const secondCheck = await idempotencyService.lockOrGetCached(testKey, testUserId1, 'POST', '/events/hold', payload);
      expect(secondCheck.isCached).toBe(true);
      expect(secondCheck.response.data).toEqual(fakeResponse);

      await idempotencyService.clearLock(testKey);
    });

    it('should throw 400 Bad Request if same Idempotency-Key is reused with different payload', async () => {
      const testKey = `test-idem-mismatch-${Date.now()}`;
      const payloadA = { action: 'hold', items: [1] };
      const payloadB = { action: 'hold', items: [2] };

      const checkA = await idempotencyService.lockOrGetCached(testKey, testUserId1, 'POST', '/events/hold', payloadA);
      await idempotencyService.saveResponse(testKey, checkA.requestHash, { ok: true });

      // Request with different payload
      await expect(
        idempotencyService.lockOrGetCached(testKey, testUserId1, 'POST', '/events/hold', payloadB),
      ).rejects.toThrow(/Idempotency-Key đã được sử dụng với nội dung yêu cầu khác/i);

      await idempotencyService.clearLock(testKey);
    });
  });

  describe('5. Distributed Rate Limiting & Risk Scoring (Section 5 & 6)', () => {
    it('should return HTTP 429 when distributed rate limit threshold is exceeded', async () => {
      const limiter = createDistributedRateLimiter({
        action: 'test_action',
        windowMs: 60000,
        max: 2,
        message: 'Rate limit test exceeded',
      });

      const mockReq = {
        headers: { 'x-enforce-rate-limit': 'true' },
        user: { sub: `user_${Date.now()}` },
        ip: '127.0.0.1',
      };
      let statusResult = 200;
      const mockRes = {
        set: jest.fn(),
        status: (s) => {
          statusResult = s;
          return { json: jest.fn() };
        },
      };

      // Call 1
      await limiter(mockReq, mockRes, () => {});
      expect(statusResult).toBe(200);

      // Call 2
      await limiter(mockReq, mockRes, () => {});
      expect(statusResult).toBe(200);

      // Call 3 (exceeds limit 2)
      await limiter(mockReq, mockRes, () => {});
      expect(statusResult).toBe(429);
      expect(mockRes.set).toHaveBeenCalledWith('Retry-After', expect.any(String));
    });

    it('should track consecutive hold cancellations and record risk signals', async () => {
      const riskUser = testUserId2;
      await riskScoringService.recordHoldCancellation(riskUser, testEventId1, { ip: '1.2.3.4' });
      await riskScoringService.recordHoldCancellation(riskUser, testEventId1, { ip: '1.2.3.4' });
      await riskScoringService.recordHoldCancellation(riskUser, testEventId1, { ip: '1.2.3.4' });

      const log = await db.query(
        `SELECT action, risk_score FROM security_activity_logs WHERE details->>'cancelCount' = '3' ORDER BY created_at DESC LIMIT 1`,
      );
      expect(log.rows.length).toBe(1);
      expect(log.rows[0].action).toBe('CANCEL_HOLD');
      expect(log.rows[0].risk_score).toBe(20);
    });
  });

  describe('6. Background Expiration Worker & Cross-Server Mutual Exclusion (Section 8)', () => {
    it('should successfully run expiration sweep and expire stale holds', async () => {
      // Insert an expired hold session directly into DB
      const expSession = await db.query(`
        INSERT INTO ticket_hold_sessions (user_id, event_id, status, expires_at)
        VALUES ($1, $2, 'ACTIVE', NOW() - INTERVAL '1 minute')
        RETURNING id
      `, [testUserId1, testEventId1]);

      const expHold = await db.query(`
        INSERT INTO ticket_holds (user_id, event_id, hold_id, ticket_type_id, quantity, expires_at, status)
        VALUES ($1, $2, $3, $4, 1, NOW() - INTERVAL '1 minute', 'ACTIVE')
        RETURNING id
      `, [testUserId1, testEventId1, expSession.rows[0].id, testTicketTypeIdGA]);

      // Run expiration sweep
      await runExpirationSweep();

      // Verify that the session and ticket_holds transitioned to EXPIRED
      const checkSession = await db.query(`SELECT status FROM ticket_hold_sessions WHERE id = $1`, [expSession.rows[0].id]);
      expect(checkSession.rows[0].status).toBe('EXPIRED');

      const checkHold = await db.query(`SELECT status FROM ticket_holds WHERE id = $1`, [expHold.rows[0].id]);
      expect(checkHold.rows[0].status).toBe('EXPIRED');
    });

    it('should be idempotent when executed multiple times consecutively', async () => {
      // Running sweep second time should complete safely with zero side effects
      await expect(runExpirationSweep()).resolves.not.toThrow();
    });
  });
});
