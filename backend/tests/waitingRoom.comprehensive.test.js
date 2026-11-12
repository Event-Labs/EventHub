const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { client: redis, connectRedis } = require('../src/infrastructure/redis/redis.client');
const waitingRoomService = require('../src/modules/waiting-room/waitingRoom.service');
const admissionWorker = require('../src/modules/waiting-room/waitingRoom.worker');
const WAITING_ROOM_CONSTANTS = require('../src/modules/waiting-room/waitingRoom.constants');
const LUA_SCRIPTS = require('../src/modules/waiting-room/waitingRoom.lua');

const { STATES, KEYS } = WAITING_ROOM_CONSTANTS;

describe('Virtual Waiting Room Comprehensive Test Suite', () => {
  const testEventId = '00000000-0000-4000-8000-000000000001';

  beforeAll(async () => {
    await connectRedis();
  });

  beforeEach(async () => {
    // Clean up test keys in Redis
    if (redis.isOpen) {
      await redis.del(KEYS.QUEUE(testEventId));
      await redis.del(KEYS.ACTIVE(testEventId));
      await redis.del(KEYS.ACTIVE_EXPIRY(testEventId));
      await redis.del(KEYS.META(testEventId));
      await redis.sRem(KEYS.ACTIVE_EVENTS_SET, testEventId);

      // Initialize test event meta
      await redis.hSet(KEYS.META(testEventId), {
        initialized: '1',
        enabled: '1',
        max_active: '5', // Small capacity for concurrency testing
        session_duration_seconds: '600',
        poll_interval_ms: '1000',
        admission_batch_size: '2',
        is_paused: '0',
        sold_out: '0',
        title: 'Test Concert 2026',
      });
      await redis.sAdd(KEYS.ACTIVE_EVENTS_SET, testEventId);
    }
  });

  afterAll(async () => {
    admissionWorker.stop();
    if (redis.isOpen) {
      await redis.del(KEYS.QUEUE(testEventId));
      await redis.del(KEYS.ACTIVE(testEventId));
      await redis.del(KEYS.ACTIVE_EXPIRY(testEventId));
      await redis.del(KEYS.META(testEventId));
      await redis.sRem(KEYS.ACTIVE_EVENTS_SET, testEventId);
    }
  });

  test('TEST 1: Immediate Admission when Active slots are available', async () => {
    const res = await waitingRoomService.joinQueue({
      eventId: testEventId,
      userId: 'user-001',
    });

    expect(res.status).toBe(STATES.ACTIVE);
    expect(res.booking_token).toBeDefined();
    expect(res.session_id).toBeDefined();

    // Verify token exists and is valid
    const validation = await waitingRoomService.validateBookingToken(
      res.booking_token,
      testEventId,
      'user-001'
    );
    expect(validation.valid).toBe(true);
    expect(validation.payload.session_id).toBe(res.session_id);
  });

  test('TEST 2: Fair FIFO Queue Placement when Capacity is Full', async () => {
    // Fill up all 5 active slots
    const admittedSessions = [];
    for (let i = 0; i < 5; i++) {
      const res = await waitingRoomService.joinQueue({
        eventId: testEventId,
        userId: `user-active-${i}`,
      });
      expect(res.status).toBe(STATES.ACTIVE);
      admittedSessions.push(res);
    }

    // Now active count is 5 (MAX_ACTIVE). Next user must be queued!
    const queuedUser1 = await waitingRoomService.joinQueue({
      eventId: testEventId,
      userId: 'user-waiting-1',
    });
    expect(queuedUser1.status).toBe(STATES.WAITING);
    expect(queuedUser1.position).toBe(0); // 0 people ahead of them!

    const queuedUser2 = await waitingRoomService.joinQueue({
      eventId: testEventId,
      userId: 'user-waiting-2',
    });
    expect(queuedUser2.status).toBe(STATES.WAITING);
    expect(queuedUser2.position).toBe(1); // 1 person ahead!

    const queuedUser3 = await waitingRoomService.joinQueue({
      eventId: testEventId,
      userId: 'user-waiting-3',
    });
    expect(queuedUser3.status).toBe(STATES.WAITING);
    expect(queuedUser3.position).toBe(2); // 2 people ahead!
  });

  test('TEST 3: Session Recovery on Page Refresh (Idempotent)', async () => {
    // Fill capacity
    for (let i = 0; i < 5; i++) {
      await waitingRoomService.joinQueue({
        eventId: testEventId,
        userId: `user-active-${i}`,
      });
    }

    // User joins queue
    const firstJoin = await waitingRoomService.joinQueue({
      eventId: testEventId,
      userId: 'user-test-recovery',
    });
    expect(firstJoin.status).toBe(STATES.WAITING);
    const assignedSessionId = firstJoin.session_id;
    const initialPos = firstJoin.position;

    // Simulate page refresh: Client calls joinQueue with existingSessionId
    const secondJoin = await waitingRoomService.joinQueue({
      eventId: testEventId,
      userId: 'user-test-recovery',
      existingSessionId: assignedSessionId,
    });

    expect(secondJoin.session_id).toBe(assignedSessionId);
    expect(secondJoin.status).toBe(STATES.WAITING);
    expect(secondJoin.position).toBe(initialPos); // Position is preserved!
  });

  test('TEST 4: Atomic Admission Worker releases slot to next waiting user', async () => {
    // Fill capacity with 5 users
    const admitted = [];
    for (let i = 0; i < 5; i++) {
      const res = await waitingRoomService.joinQueue({
        eventId: testEventId,
        userId: `user-${i}`,
      });
      admitted.push(res);
    }

    // Add 1 user to waiting queue
    const queued = await waitingRoomService.joinQueue({
      eventId: testEventId,
      userId: 'user-waiting-next',
    });
    expect(queued.status).toBe(STATES.WAITING);

    // Release 1 active slot (e.g. user completes checkout or leaves)
    await waitingRoomService.releaseActiveSlot({
      eventId: testEventId,
      sessionId: admitted[0].session_id,
      token: admitted[0].booking_token,
    });

    // Run admission worker tick
    await admissionWorker.processEventAdmission(testEventId);

    // The queued user should now be admitted!
    const statusCheck = await waitingRoomService.getQueueStatus({
      eventId: testEventId,
      sessionId: queued.session_id,
    });

    expect(statusCheck.status).toBe(STATES.ACTIVE);
    expect(statusCheck.booking_token).toBeDefined();

    // Verify token validity
    const val = await waitingRoomService.validateBookingToken(
      statusCheck.booking_token,
      testEventId
    );
    expect(val.valid).toBe(true);
  });

  test('TEST 5: Capacity constraint is NEVER breached under concurrent load', async () => {
    // Send 50 concurrent join requests
    const promises = [];
    for (let i = 0; i < 50; i++) {
      promises.push(
        waitingRoomService.joinQueue({
          eventId: testEventId,
          userId: `concurrent-user-${i}`,
        })
      );
    }

    const results = await Promise.all(promises);
    const activeResults = results.filter((r) => r.status === STATES.ACTIVE);
    const queuedResults = results.filter((r) => r.status === STATES.WAITING);

    // MAX_ACTIVE is 5. Exactly 5 must be ACTIVE, rest 45 must be QUEUED!
    expect(activeResults.length).toBe(5);
    expect(queuedResults.length).toBe(45);

    // Verify Redis Active set size
    const activeCountInRedis = await redis.hLen(KEYS.ACTIVE(testEventId));
    expect(activeCountInRedis).toBe(5);
  });

  test('TEST 6: Token Rejection for Mismatched Event or Tampered Token', async () => {
    const res = await waitingRoomService.joinQueue({
      eventId: testEventId,
      userId: 'valid-user',
    });

    // Valid check
    const validCheck = await waitingRoomService.validateBookingToken(
      res.booking_token,
      testEventId,
      'valid-user'
    );
    expect(validCheck.valid).toBe(true);

    // Check with wrong eventId (Token Hijacking prevention)
    const wrongEventCheck = await waitingRoomService.validateBookingToken(
      res.booking_token,
      '00000000-0000-4000-8000-999999999999',
      'valid-user'
    );
    expect(wrongEventCheck.valid).toBe(false);

    // Check with fake/tampered token
    const fakeTokenCheck = await waitingRoomService.validateBookingToken(
      'fake_token_1234567890abcdef',
      testEventId,
      'valid-user'
    );
    expect(fakeTokenCheck.valid).toBe(false);
  });
});

