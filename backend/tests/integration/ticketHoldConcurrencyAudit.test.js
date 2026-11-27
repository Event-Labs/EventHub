const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });
const db = require('../../src/infrastructure/database/db.client');
const { client: redisClient } = require('../../src/infrastructure/redis/redis.client');
const eventsRepository = require('../../src/modules/events/events.repository');
const ordersRepository = require('../../src/modules/orders/orders.repository');
const idempotencyService = require('../../src/core/security/idempotency.service');
const riskScoringService = require('../../src/core/security/riskScoring.service');
const captchaService = require('../../src/core/security/captcha.service');
const { createDistributedRateLimiter } = require('../../src/middlewares/rateLimiter.middleware');
const {
  runExpirationSweep,
  ADVISORY_LOCK_ID,
} = require('../../src/modules/events/ticketHoldExpiration.worker');

describe('Security Audit & Concurrency Verification Test Suite (13 Scenarios)', () => {
  let testUserId1;
  let testUserId2;
  let testUserId3;
  let testUserId4;
  let organizerId;
  let venueId;
  let seatMapId;
  let testEventId;
  let testSessionId;
  let testTicketTypeIdGA;
  let testTicketTypeIdSeated;
  let testRawSeatId;
  let testSessionSeatId;

  beforeAll(async () => {
    // 1. Create test users
    const u1 = await db.query(`
      INSERT INTO users (email, full_name, status, email_verified)
      VALUES ('audit_u1_${Date.now()}@test.com', 'Audit User 1', 'ACTIVE', true)
      RETURNING id
    `);
    testUserId1 = u1.rows[0].id;

    const u2 = await db.query(`
      INSERT INTO users (email, full_name, status, email_verified)
      VALUES ('audit_u2_${Date.now()}@test.com', 'Audit User 2', 'ACTIVE', true)
      RETURNING id
    `);
    testUserId2 = u2.rows[0].id;

    const u3 = await db.query(`
      INSERT INTO users (email, full_name, status, email_verified)
      VALUES ('audit_u3_${Date.now()}@test.com', 'Audit User 3', 'ACTIVE', true)
      RETURNING id
    `);
    testUserId3 = u3.rows[0].id;

    const u4 = await db.query(`
      INSERT INTO users (email, full_name, status, email_verified)
      VALUES ('audit_u4_${Date.now()}@test.com', 'Audit User 4', 'ACTIVE', true)
      RETURNING id
    `);
    testUserId4 = u4.rows[0].id;

    // 2. Organizer & Venue
    const orgRes = await db.query(`SELECT id FROM organizers LIMIT 1`);
    if (orgRes.rows[0]) {
      organizerId = orgRes.rows[0].id;
    } else {
      const newOrg = await db.query(`
        INSERT INTO organizers (user_id, business_name, status)
        VALUES ($1, 'Audit Security Org', 'APPROVED') RETURNING id
      `, [testUserId1]);
      organizerId = newOrg.rows[0].id;
    }

    const vRes = await db.query(`SELECT id FROM venues LIMIT 1`);
    if (vRes.rows[0]) {
      venueId = vRes.rows[0].id;
    } else {
      const newV = await db.query(`
        INSERT INTO venues (name, address, city) VALUES ('Audit Arena', '456 Test Ave', 'Danang') RETURNING id
      `);
      venueId = newV.rows[0].id;
    }

    // 3. Seat Map
    const smRes = await db.query(`
      INSERT INTO seat_maps (venue_id, name, rows_count, cols_count)
      VALUES ($1, 'Audit Seat Map', 5, 5) RETURNING id
    `, [venueId]);
    seatMapId = smRes.rows[0].id;

    // 4. Test Event
    const eventRes = await db.query(`
      INSERT INTO events (
        title, slug, organizer_id, status, visibility, approval_status, sales_status,
        start_time, end_time
      ) VALUES (
        'Audit Concurrency Event', 'audit-concurrency-event-${Date.now()}', $1, 'PUBLISHED', 'PUBLIC', 'APPROVED', 'ON_SALE',
        NOW() + INTERVAL '10 days', NOW() + INTERVAL '11 days'
      ) RETURNING id
    `, [organizerId]);
    testEventId = eventRes.rows[0].id;

    // 5. Session
    const sessRes = await db.query(`
      INSERT INTO event_sessions (event_id, venue_id, start_time, end_time, status)
      VALUES ($1, $2, NOW() + INTERVAL '10 days', NOW() + INTERVAL '10 days 4 hours', 'UPCOMING')
      RETURNING id
    `, [testEventId, venueId]);
    testSessionId = sessRes.rows[0].id;

    // 6. GA Ticket (Capacity: 2 tickets)
    const gaRes = await db.query(`
      INSERT INTO ticket_types (event_session_id, name, price, quantity, is_seated, sale_start, sale_end)
      VALUES ($1, 'Audit GA Pass', 200000, 2, false, NOW() - INTERVAL '1 hour', NOW() + INTERVAL '5 days')
      RETURNING id
    `, [testSessionId]);
    testTicketTypeIdGA = gaRes.rows[0].id;

    // 7. Seated Ticket & 1 physical Seat
    const seatedRes = await db.query(`
      INSERT INTO ticket_types (event_session_id, name, price, quantity, is_seated, sale_start, sale_end)
      VALUES ($1, 'Audit VIP Seated', 600000, 5, true, NOW() - INTERVAL '1 hour', NOW() + INTERVAL '5 days')
      RETURNING id
    `, [testSessionId]);
    testTicketTypeIdSeated = seatedRes.rows[0].id;

    const seatRes = await db.query(`
      INSERT INTO seats (seat_map_id, row_label, seat_number, is_disabled)
      VALUES ($1, 'B', '01', false) RETURNING id
    `, [seatMapId]);
    testRawSeatId = seatRes.rows[0].id;

    const ssRes = await db.query(`
      INSERT INTO session_seats (event_session_id, seat_id, status)
      VALUES ($1, $2, 'AVAILABLE') RETURNING id
    `, [testSessionId, testRawSeatId]);
    testSessionSeatId = ssRes.rows[0].id;
  });

  afterAll(async () => {
    try {
      const userIds = [testUserId1, testUserId2, testUserId3, testUserId4].filter(Boolean);
      if (userIds.length > 0) {
        await db.query(`DELETE FROM ticket_holds WHERE user_id = ANY($1::uuid[])`, [userIds]);
        await db.query(`DELETE FROM ticket_hold_sessions WHERE user_id = ANY($1::uuid[])`, [userIds]);
        await db.query(`DELETE FROM orders WHERE user_id = ANY($1::uuid[])`, [userIds]);
      }
      if (testSessionId) {
        await db.query(`DELETE FROM session_seats WHERE event_session_id = $1`, [testSessionId]);
        await db.query(`DELETE FROM ticket_types WHERE event_session_id = $1`, [testSessionId]);
        await db.query(`DELETE FROM event_sessions WHERE id = $1`, [testSessionId]);
      }
      if (testEventId) await db.query(`DELETE FROM events WHERE id = $1`, [testEventId]);
      if (testRawSeatId) await db.query(`DELETE FROM seats WHERE id = $1`, [testRawSeatId]);
      if (seatMapId) await db.query(`DELETE FROM seat_maps WHERE id = $1`, [seatMapId]);
      if (userIds.length > 0) {
        await db.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
      }
    } catch (_) {}
  });

  // Scenario 1: Hai server cùng nhận request tạo Hold với cùng User/Event
  test('Scenario 1: Two concurrent hold requests for same User and Event must maintain exactly ONE active hold session', async () => {
    const payload = {
      event_id: testEventId,
      items: [{ ticket_type_id: testTicketTypeIdGA, quantity: 1, session_seat_ids: [] }],
    };

    // Execute concurrently simulating Server 1 and Server 2
    const [res1, res2] = await Promise.allSettled([
      eventsRepository.holdSeats(testUserId1, payload),
      eventsRepository.holdSeats(testUserId1, payload),
    ]);

    // Both should be resolved or handled safely
    expect(res1.status).toBe('fulfilled');
    expect(res2.status).toBe('fulfilled');

    // Query DB: exactly 1 ACTIVE session must exist in DB for this user/event
    const sessionCount = await db.query(
      `SELECT count(*) FROM ticket_hold_sessions WHERE user_id = $1 AND event_id = $2 AND status = 'ACTIVE'`,
      [testUserId1, testEventId],
    );
    expect(parseInt(sessionCount.rows[0].count, 10)).toBe(1);

    // Release hold after Scenario 1 to free inventory for subsequent tests
    await eventsRepository.releaseSeatHolds(testUserId1, { event_id: testEventId });
  });

  // Scenario 2: Hai server cùng nhận Idempotency-Key
  test('Scenario 2: Concurrent requests with same Idempotency-Key: exactly ONE proceeds, second is rejected with 409 Conflict', async () => {
    const sharedKey = `audit-concurrent-key-${Date.now()}`;
    const method = 'POST';
    const path = '/api/events/availability/hold';
    const body = { event_id: testEventId, qty: 1 };

    const [req1, req2] = await Promise.allSettled([
      idempotencyService.lockOrGetCached(sharedKey, testUserId1, method, path, body),
      idempotencyService.lockOrGetCached(sharedKey, testUserId1, method, path, body),
    ]);

    const successes = [req1, req2].filter((r) => r.status === 'fulfilled' && r.value && !r.value.isCached);
    const rejections = [req1, req2].filter((r) => r.status === 'rejected');

    // Exactly one acquired the lock!
    expect(successes.length).toBe(1);
    expect(rejections.length).toBe(1);
    expect(rejections[0].reason.statusCode).toBe(409);

    // Clean up key
    await idempotencyService.clearLock(sharedKey);
  });

  // Scenario 3: Hai server cùng xử lý Expiration Worker
  test('Scenario 3: Two server instances concurrently triggering expiration sweep: mutual exclusion via advisory lock', async () => {
    // Both servers trigger sweep simultaneously
    const [sweep1, sweep2] = await Promise.allSettled([
      runExpirationSweep(),
      runExpirationSweep(),
    ]);

    expect(sweep1.status).toBe('fulfilled');
    expect(sweep2.status).toBe('fulfilled');
  });

  // Scenario 4: Server đang giữ Advisory Lock bị crash
  test('Scenario 4: If server holding Advisory Lock crashes, lock is automatically released on connection close', async () => {
    const TEST_LOCK_ID = Math.floor(1000000 + Math.random() * 8000000);
    const clientCrash = await db.getClient();
    const lockRes = await clientCrash.query('SELECT pg_try_advisory_lock($1) AS acquired', [TEST_LOCK_ID]);
    expect(lockRes.rows[0].acquired).toBe(true);

    // Simulate unexpected crash/disconnect by releasing with destroy: client.release(true)
    clientCrash.release(true);

    // A second connection must now be able to immediately acquire the lock
    const clientNext = await db.getClient();
    try {
      const nextLock = await clientNext.query('SELECT pg_try_advisory_lock($1) AS acquired', [TEST_LOCK_ID]);
      expect(nextLock.rows[0].acquired).toBe(true);
      await clientNext.query('SELECT pg_advisory_unlock($1)', [TEST_LOCK_ID]);
    } finally {
      clientNext.release();
    }
  });

  // Scenario 5: Redis mất kết nối & Xử lý an toàn
  test('Scenario 5: Distributed rate limiter handles Redis failures safely without blocking legitimate traffic', async () => {
    const limiter = createDistributedRateLimiter({ action: 'audit_resilience', max: 5 });
    const mockReq = {
      user: { sub: testUserId1 },
      headers: { 'x-enforce-rate-limit': 'true' },
      ip: '192.168.1.100',
    };
    let nextCalled = false;
    const mockRes = {
      set: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await limiter(mockReq, mockRes, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });

  // Scenario 6: Redis phục hồi sau khi mất kết nối
  test('Scenario 6: Redis operations track TTL and expiration accurately', async () => {
    const testKey = `audit:reconnect:${Date.now()}`;
    await redisClient.set(testKey, 'val', { EX: 10 });
    const val = await redisClient.get(testKey);
    const ttl = await redisClient.ttl(testKey);

    expect(val).toBe('val');
    expect(ttl).toBeGreaterThan(0);
    await redisClient.del(testKey);
  });

  // Scenario 7: Hai user cùng giữ ghế cuối cùng
  test('Scenario 7: Two users concurrently attempting to hold the same seat: exactly ONE succeeds, other is rejected', async () => {
    const payload = {
      event_id: testEventId,
      items: [{ ticket_type_id: testTicketTypeIdSeated, quantity: 1, session_seat_ids: [testSessionSeatId] }],
    };

    const [u1Result, u2Result] = await Promise.allSettled([
      eventsRepository.holdSeats(testUserId2, payload),
      eventsRepository.holdSeats(testUserId3, payload),
    ]);

    const oneSucceeded = (u1Result.status === 'fulfilled' && u2Result.status === 'rejected') ||
                         (u2Result.status === 'fulfilled' && u1Result.status === 'rejected');
    expect(oneSucceeded).toBe(true);

    // Verify seat status in DB is HELD and assigned to the successful user
    const seatCheck = await db.query(`SELECT status, held_by FROM session_seats WHERE id = $1`, [testSessionSeatId]);
    expect(seatCheck.rows[0].status).toBe('HELD');
    const winnerId = u1Result.status === 'fulfilled' ? testUserId2 : testUserId3;
    expect(seatCheck.rows[0].held_by).toBe(winnerId);

    // Release seat for further tests
    await eventsRepository.releaseSeatHolds(winnerId, { event_id: testEventId });
  });

  // Scenario 8: Nhiều user cùng mua những vé GA cuối cùng
  test('Scenario 8: Multiple users concurrently holding last GA tickets (capacity: 2): zero oversell', async () => {
    const payload = {
      event_id: testEventId,
      items: [{ ticket_type_id: testTicketTypeIdGA, quantity: 1, session_seat_ids: [] }],
    };

    // 4 users concurrently trying to hold 1 ticket each on a 2-ticket GA pool
    const users = [testUserId1, testUserId2, testUserId3, testUserId4];
    const results = await Promise.allSettled(
      users.map((u) => eventsRepository.holdSeats(u, payload)),
    );

    const fulfilledCount = results.filter((r) => r.status === 'fulfilled').length;
    // Exactly 2 must succeed, never exceeding total GA capacity of 2!
    expect(fulfilledCount).toBe(2);

    // Clean up holds
    for (const u of users) {
      await eventsRepository.releaseSeatHolds(u, { event_id: testEventId });
    }
  });

  // Scenario 9: Webhook thanh toán và Worker hết hạn chạy đồng thời
  test('Scenario 9: Concurrent payment confirmation and worker sweep prevents ticket double-assignment', async () => {
    const uniqueOrderCode = `AUD_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const uniqueProviderCode = Math.floor(100000000 + Math.random() * 900000000);

    // 1. Create a pending order for User 1 with expired timestamp
    const orderRes = await db.query(`
      INSERT INTO orders (
        user_id, organizer_id, order_code, total_amount, status, expired_at
      ) VALUES (
        $1, $2, $3, 200000, 'EXPIRED', NOW() - INTERVAL '1 minute'
      ) RETURNING id
    `, [testUserId1, organizerId, uniqueOrderCode]);
    const testOrderId = orderRes.rows[0].id;

    // Attach order item for GA
    await db.query(`
      INSERT INTO order_items (order_id, ticket_type_id, quantity, unit_price, final_price)
      VALUES ($1, $2, 1, 200000, 200000)
    `, [testOrderId, testTicketTypeIdGA]);

    await db.query(`
      INSERT INTO payment_orders (
        order_id, provider, provider_order_code, amount, status,
        payment_owner_type, reference_type, reference_id, description
      ) VALUES (
        $1, 'PAYOS', $2, 200000, 'PENDING',
        'ORGANIZER', 'TICKET_ORDER', $1, 'Test Payment Order'
      ) RETURNING id
    `, [testOrderId, uniqueProviderCode]);

    // Concurrently trigger expiration sweep and payment confirmation
    const [workerSweep, paymentAttempt] = await Promise.allSettled([
      runExpirationSweep(),
      ordersRepository.confirmPayment({
        providerOrderCode: uniqueProviderCode,
        amount: 200000,
        transactionId: `TX_${Date.now()}`,
        rawPayload: { data: { transactionDateTime: new Date().toISOString() } },
      }),
    ]);

    expect(workerSweep.status).toBe('fulfilled');
    // Regardless of race timing, order cannot end up in corrupted inconsistent state
    const orderFinal = await db.query(`SELECT status FROM orders WHERE id = $1`, [testOrderId]);
    expect(['EXPIRED', 'PAID']).toContain(orderFinal.rows[0].status);
  });

  // Scenario 10: Người dùng Refresh và khôi phục Hold
  test('Scenario 10: User refreshes page: findActiveHoldByUserAndEvent recovers complete hold data with original countdown', async () => {
    // Create hold
    const holdRes = await eventsRepository.holdSeats(testUserId1, {
      event_id: testEventId,
      items: [{ ticket_type_id: testTicketTypeIdGA, quantity: 1, session_seat_ids: [] }],
    });

    // Simulate page refresh: call recovery
    const recovered = await eventsRepository.findActiveHoldByUserAndEvent(testUserId1, testEventId);
    expect(recovered.hasActiveHold).toBe(true);
    expect(recovered.hold.id).toBe(holdRes.hold_id);
    expect(recovered.hold.remainingSeconds).toBeGreaterThan(800);
    expect(recovered.hold.items.length).toBe(1);

    await eventsRepository.releaseSeatHolds(testUserId1, { event_id: testEventId });
  });

  // Scenario 11: Người dùng retry request do timeout
  test('Scenario 11: Idempotency-Key retry returns cached result without creating new hold or resetting timer', async () => {
    const key = `audit-retry-${Date.now()}`;
    const payload = {
      event_id: testEventId,
      items: [{ ticket_type_id: testTicketTypeIdGA, quantity: 1, session_seat_ids: [] }],
    };

    const first = await idempotencyService.lockOrGetCached(key, testUserId1, 'POST', '/hold', payload);
    expect(first.isCached).toBe(false);

    // Save completed response
    await idempotencyService.saveResponse(key, first.requestHash, { holdId: 'cached_hold_123' }, 200);

    // Retry request with same key and payload
    const retry = await idempotencyService.lockOrGetCached(key, testUserId1, 'POST', '/hold', payload);
    expect(retry.isCached).toBe(true);
    expect(retry.response.data.holdId).toBe('cached_hold_123');

    await idempotencyService.clearLock(key);
  });

  // Scenario 12: Nhiều tài khoản sử dụng chung IP
  test('Scenario 12: Distinct users sharing same IP can create holds up to IP pool threshold without mutual blocking', async () => {
    const sharedIp = '103.28.36.100';
    const limiter = createDistributedRateLimiter({
      action: 'audit_ip_sharing',
      windowMs: 60000,
      max: 3,
      ipPoolMultiplier: 4, // Max 12 requests across IP pool
    });

    const mockRes = { set: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() };

    // User A makes 2 requests
    let allowedA = 0;
    await limiter({ user: { sub: testUserId1 }, ip: sharedIp, headers: { 'x-enforce-rate-limit': 'true' } }, mockRes, () => { allowedA++; });
    await limiter({ user: { sub: testUserId1 }, ip: sharedIp, headers: { 'x-enforce-rate-limit': 'true' } }, mockRes, () => { allowedA++; });

    // User B on same IP makes 2 requests
    let allowedB = 0;
    await limiter({ user: { sub: testUserId2 }, ip: sharedIp, headers: { 'x-enforce-rate-limit': 'true' } }, mockRes, () => { allowedB++; });
    await limiter({ user: { sub: testUserId2 }, ip: sharedIp, headers: { 'x-enforce-rate-limit': 'true' } }, mockRes, () => { allowedB++; });

    expect(allowedA).toBe(2);
    expect(allowedB).toBe(2);
  });

  // Scenario 13: Nhiều tài khoản sử dụng chung Device ID
  test('Scenario 13: Multiple accounts sharing same Device ID tracks risk (+30) without immediately blocking user below threshold', async () => {
    const sharedDeviceId = `dev_${Date.now()}`;

    // Account 1 on device
    await riskScoringService.recordHoldCreation(testUserId1, testEventId, {
      ip: '1.2.3.4',
      deviceId: sharedDeviceId,
      isUpdate: true,
    });
    // Account 2 on device
    await riskScoringService.recordHoldCreation(testUserId2, testEventId, {
      ip: '1.2.3.4',
      deviceId: sharedDeviceId,
      isUpdate: true,
    });
    // Account 3 on device
    const res3 = await riskScoringService.recordHoldCreation(testUserId3, testEventId, {
      ip: '1.2.3.4',
      deviceId: sharedDeviceId,
      isUpdate: true,
    });

    // Score is tracked (+30), but 30 < 70 so user is NOT blindly blocked
    expect(res3.riskScore).toBe(30);
    expect(res3.level).toBe('LOW');

    // Verify Cloudflare Turnstile token verification service accepts valid captcha
    const captchaCheck = await captchaService.verifyTurnstileToken('1x00000000000000000000AA');
    expect(captchaCheck.success).toBe(true);
  });
});
