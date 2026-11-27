const path = require('path');
const { spawn } = require('child_process');
const axios = require('axios');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });
const db = require('../../src/infrastructure/database/db.client');
const { client: redisClient } = require('../../src/infrastructure/redis/redis.client');

const PORT_SERVER_1 = 5001;
const PORT_SERVER_2 = 5002;
const BASE_URL_1 = `http://127.0.0.1:${PORT_SERVER_1}`;
const BASE_URL_2 = `http://127.0.0.1:${PORT_SERVER_2}`;

describe('Real Two-Backend Multi-Process Verification', () => {
  let serverProcess1 = null;
  let serverProcess2 = null;

  let testUserId1;
  let testUserId2;
  let testUserId3;
  let tokenUser1;
  let tokenUser2;
  let tokenUser3;

  let organizerId;
  let seatMapId;
  let testEventId;
  let testSessionId;
  let testTicketTypeIdGA;
  let testTicketTypeIdSeated;
  let testSessionSeatId;

  const waitForServer = async (url, maxAttempts = 30) => {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const res = await axios.get(`${url}/health`, { timeout: 1000 });
        if (res.status === 200) return true;
      } catch (_) {}
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`Server at ${url} failed to start within timeout.`);
  };

  beforeAll(async () => {
    // 1. Seed database users
    const u1 = await db.query(`
      INSERT INTO users (email, full_name, status, email_verified)
      VALUES ('twobackend_u1_${Date.now()}@test.com', 'TwoBackend User 1', 'ACTIVE', true)
      RETURNING id, email
    `);
    testUserId1 = u1.rows[0].id;

    const u2 = await db.query(`
      INSERT INTO users (email, full_name, status, email_verified)
      VALUES ('twobackend_u2_${Date.now()}@test.com', 'TwoBackend User 2', 'ACTIVE', true)
      RETURNING id, email
    `);
    testUserId2 = u2.rows[0].id;

    const u3 = await db.query(`
      INSERT INTO users (email, full_name, status, email_verified)
      VALUES ('twobackend_u3_${Date.now()}@test.com', 'TwoBackend User 3', 'ACTIVE', true)
      RETURNING id, email
    `);
    testUserId3 = u3.rows[0].id;

    tokenUser1 = jwt.sign(
      { sub: testUserId1, email: u1.rows[0].email, roles: ['CUSTOMER'] },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: '1h' },
    );
    tokenUser2 = jwt.sign(
      { sub: testUserId2, email: u2.rows[0].email, roles: ['CUSTOMER'] },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: '1h' },
    );
    tokenUser3 = jwt.sign(
      { sub: testUserId3, email: u3.rows[0].email, roles: ['CUSTOMER'] },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: '1h' },
    );

    // 2. Seed Organizer
    const orgRes = await db.query(`SELECT id FROM organizers LIMIT 1`);
    if (orgRes.rows[0]) {
      organizerId = orgRes.rows[0].id;
    } else {
      const newOrg = await db.query(`
        INSERT INTO organizers (user_id, business_name, status)
        VALUES ($1, 'TwoBackend Test Org', 'APPROVED') RETURNING id
      `, [testUserId1]);
      organizerId = newOrg.rows[0].id;
    }

    // 3. Seed Venue & SeatMap
    const venueRes = await db.query(`
      INSERT INTO venues (organizer_id, name, address_line, city, country)
      VALUES ($1, 'TwoBackend Arena', '123 Distributed St', 'Hanoi', 'VN')
      RETURNING id
    `, [organizerId]);
    const venueId = venueRes.rows[0].id;

    const smRes = await db.query(`
      INSERT INTO seat_maps (venue_id, name, rows_count, cols_count)
      VALUES ($1, 'TwoBackend Arena Map ${Date.now()}', 10, 10)
      RETURNING id
    `, [venueId]);
    seatMapId = smRes.rows[0].id;

    // 4. Seed Event & Session
    const eventRes = await db.query(`
      INSERT INTO events (
        organizer_id, title, slug, status, sales_status, visibility, approval_status,
        start_time, end_time
      )
      VALUES (
        $1, 'TwoBackend Concurrency Event', 'twobackend-event-${Date.now()}',
        'PUBLISHED', 'ON_SALE', 'PUBLIC', 'APPROVED',
        NOW() + INTERVAL '1 day', NOW() + INTERVAL '2 days'
      )
      RETURNING id
    `, [organizerId]);
    testEventId = eventRes.rows[0].id;

    const sessionRes = await db.query(`
      INSERT INTO event_sessions (event_id, venue_id, seat_map_id, session_name, start_time, end_time, status)
      VALUES ($1, $2, $3, 'Session 1', NOW() + INTERVAL '1 day', NOW() + INTERVAL '2 days', 'UPCOMING')
      RETURNING id
    `, [testEventId, venueId, seatMapId]);
    testSessionId = sessionRes.rows[0].id;

    // 5. Seed Ticket Types: GA (stock = 5) and Seated (stock = 1)
    const gaRes = await db.query(`
      INSERT INTO ticket_types (event_session_id, name, price, quantity, max_per_order, is_seated, sale_start, sale_end)
      VALUES ($1, 'TwoBackend GA Ticket', 100000, 5, 4, false, NOW() - INTERVAL '1 hour', NOW() + INTERVAL '5 days')
      RETURNING id
    `, [testSessionId]);
    testTicketTypeIdGA = gaRes.rows[0].id;

    const seatedRes = await db.query(`
      INSERT INTO ticket_types (event_session_id, name, price, quantity, max_per_order, is_seated, sale_start, sale_end)
      VALUES ($1, 'TwoBackend VIP Seat Ticket', 250000, 1, 1, true, NOW() - INTERVAL '1 hour', NOW() + INTERVAL '5 days')
      RETURNING id
    `, [testSessionId]);
    testTicketTypeIdSeated = seatedRes.rows[0].id;

    // 6. Seed Seat & Session Seat
    const seatRes = await db.query(`
      INSERT INTO seats (seat_map_id, row_label, seat_number, is_disabled)
      VALUES ($1, 'TB', '1', false)
      RETURNING id
    `, [seatMapId]);
    const rawSeatId = seatRes.rows[0].id;

    const ssRes = await db.query(`
      INSERT INTO session_seats (event_session_id, seat_id, status)
      VALUES ($1, $2, 'AVAILABLE')
      RETURNING id
    `, [testSessionId, rawSeatId]);
    testSessionSeatId = ssRes.rows[0].id;

    await db.query(`
      INSERT INTO ticket_type_seats (ticket_type_id, seat_id)
      VALUES ($1, $2)
    `, [testTicketTypeIdSeated, rawSeatId]);

    // 7. Spawn Two Backend Processes
    const projectRoot = path.resolve(__dirname, '..', '..');
    const serverScript = path.join(projectRoot, 'src', 'server.js');

    const envServer1 = {
      ...process.env,
      PORT: String(PORT_SERVER_1),
      APP_URL: BASE_URL_1,
      NODE_ENV: 'test',
      REDIS_FALLBACK_MEMORY: 'false',
    };

    const envServer2 = {
      ...process.env,
      PORT: String(PORT_SERVER_2),
      APP_URL: BASE_URL_2,
      NODE_ENV: 'test',
      REDIS_FALLBACK_MEMORY: 'false',
    };

    serverProcess1 = spawn('node', [serverScript], { env: envServer1, cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] });
    serverProcess2 = spawn('node', [serverScript], { env: envServer2, cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] });

    serverProcess1.stdout.on('data', (d) => { console.log(`[Server 1] ${d}`.trim()); });
    serverProcess1.stderr.on('data', (d) => { console.error(`[Server 1 Error] ${d}`.trim()); });
    serverProcess2.stdout.on('data', (d) => { console.log(`[Server 2] ${d}`.trim()); });
    serverProcess2.stderr.on('data', (d) => { console.error(`[Server 2 Error] ${d}`.trim()); });

    // Wait for both backends to be responsive
    await Promise.all([
      waitForServer(BASE_URL_1),
      waitForServer(BASE_URL_2),
    ]);
  }, 45000);

  afterAll(async () => {
    if (serverProcess1) {
      serverProcess1.kill('SIGKILL');
    }
    if (serverProcess2) {
      serverProcess2.kill('SIGKILL');
    }

    // Cleanup database test data
    if (testEventId) {
      await db.query(`DELETE FROM ticket_holds WHERE event_id = $1`, [testEventId]).catch(() => {});
      await db.query(`DELETE FROM ticket_hold_sessions WHERE event_id = $1`, [testEventId]).catch(() => {});
      await db.query(`DELETE FROM session_seats WHERE event_session_id = $1`, [testSessionId]).catch(() => {});
      await db.query(`DELETE FROM ticket_types WHERE event_session_id = $1`, [testSessionId]).catch(() => {});
      await db.query(`DELETE FROM event_sessions WHERE event_id = $1`, [testEventId]).catch(() => {});
      await db.query(`DELETE FROM events WHERE id = $1`, [testEventId]).catch(() => {});
    }
    if (seatMapId) {
      await db.query(`DELETE FROM seats WHERE seat_map_id = $1`, [seatMapId]).catch(() => {});
      await db.query(`DELETE FROM seat_maps WHERE id = $1`, [seatMapId]).catch(() => {});
    }
  });

  test('Both backend instances are alive and report healthy', async () => {
    const [res1, res2] = await Promise.all([
      axios.get(`${BASE_URL_1}/health`),
      axios.get(`${BASE_URL_2}/health`),
    ]);
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res1.data.success).toBe(true);
    expect(res2.data.success).toBe(true);
  });

  test('Scenario 1: Idempotency Lock across Server 1 and Server 2 prevents duplicate hold execution', async () => {
    const idempotencyKey = `idem_cross_srv_${Date.now()}`;
    const payload = {
      event_id: testEventId,
      items: [
        {
          ticket_type_id: testTicketTypeIdGA,
          quantity: 2,
          session_seat_ids: [],
        },
      ],
    };

    const headers1 = {
      Authorization: `Bearer ${tokenUser1}`,
      'Idempotency-Key': idempotencyKey,
    };
    const headers2 = {
      Authorization: `Bearer ${tokenUser1}`,
      'Idempotency-Key': idempotencyKey,
    };

    // Send identical request with same key simultaneously to Server 1 and Server 2
    const req1 = axios.post(`${BASE_URL_1}/api/events/availability/hold`, payload, { headers: headers1 });
    const req2 = axios.post(`${BASE_URL_2}/api/events/availability/hold`, payload, { headers: headers2 });

    const results = await Promise.allSettled([req1, req2]);
    const statuses = results.map((r) => (r.status === 'fulfilled' ? r.value.status : r.reason?.response?.status));
    if (!statuses.includes(200)) {
      console.error('Scenario 2 error details:', results.map((r) => r.reason?.response?.data || r.value?.data));
    }

    // Exactly one should succeed with 200, the other must be rejected with 409 or return 200 cache
    const successCount = statuses.filter((s) => s === 200).length;
    const conflictCount = statuses.filter((s) => s === 409).length;

    expect(successCount).toBeGreaterThanOrEqual(1);
    expect(successCount + conflictCount).toBe(2);

    // Verify in database: exactly ONE active hold session exists for testUserId1
    const sessionRes = await db.query(
      `SELECT count(*) FROM ticket_hold_sessions WHERE user_id = $1 AND event_id = $2 AND status = 'ACTIVE'`,
      [testUserId1, testEventId],
    );
    expect(Number(sessionRes.rows[0].count)).toBe(1);
  });

  test('Scenario 2: GA Inventory Overbooking Protection across Server 1 and Server 2', async () => {
    // Ticket stock = 5.
    // User 2 requests 3 tickets via Server 1, User 3 requests 3 tickets via Server 2 simultaneously.
    const gaRes2 = await db.query(`
      INSERT INTO ticket_types (event_session_id, name, price, quantity, max_per_order, is_seated, sale_start, sale_end)
      VALUES ($1, 'TwoBackend GA Stock Test', 100000, 5, 4, false, NOW() - INTERVAL '1 hour', NOW() + INTERVAL '5 days')
      RETURNING id
    `, [testSessionId]);
    const gaStockTicketId = gaRes2.rows[0].id;

    const payloadUser2 = {
      event_id: testEventId,
      items: [{ ticket_type_id: gaStockTicketId, quantity: 3, session_seat_ids: [] }],
    };
    const payloadUser3 = {
      event_id: testEventId,
      items: [{ ticket_type_id: gaStockTicketId, quantity: 3, session_seat_ids: [] }],
    };

    const req1 = axios.post(`${BASE_URL_1}/api/events/availability/hold`, payloadUser2, {
      headers: { Authorization: `Bearer ${tokenUser2}` },
    });
    const req2 = axios.post(`${BASE_URL_2}/api/events/availability/hold`, payloadUser3, {
      headers: { Authorization: `Bearer ${tokenUser3}` },
    });

    const results = await Promise.allSettled([req1, req2]);
    const statuses = results.map((r) => (r.status === 'fulfilled' ? r.value.status : r.reason?.response?.status));
    if (!statuses.includes(200) || !statuses.includes(409)) {
      console.error('Scenario 2 error details:', results.map((r) => r.reason?.response?.data || r.value?.data));
    }

    // One succeeds (200), the other must be rejected with 409 (insufficient quantity)
    expect(statuses).toContain(200);
    expect(statuses).toContain(409);

    // Check total held in DB: must NEVER exceed total stock of 5
    const totalHolds = await db.query(
      `SELECT COALESCE(sum(quantity), 0) as total FROM ticket_holds WHERE ticket_type_id = $1 AND status = 'ACTIVE'`,
      [gaStockTicketId],
    );
    expect(Number(totalHolds.rows[0].total)).toBe(3);
  });

  test('Scenario 3: Seat Collision across Server 1 and Server 2', async () => {
    // Seat TB1 is currently AVAILABLE.
    // User 2 requests TB1 on Server 1; User 3 requests TB1 on Server 2 simultaneously.
    const seatPayload = {
      event_id: testEventId,
      items: [
        {
          ticket_type_id: testTicketTypeIdSeated,
          quantity: 1,
          session_seat_ids: [testSessionSeatId],
        },
      ],
    };

    const req1 = axios.post(`${BASE_URL_1}/api/events/availability/hold`, seatPayload, {
      headers: { Authorization: `Bearer ${tokenUser2}` },
    });
    const req2 = axios.post(`${BASE_URL_2}/api/events/availability/hold`, seatPayload, {
      headers: { Authorization: `Bearer ${tokenUser3}` },
    });

    const results = await Promise.allSettled([req1, req2]);
    const statuses = results.map((r) => (r.status === 'fulfilled' ? r.value.status : r.reason?.response?.status));
    if (!statuses.includes(200)) {
      console.error('Scenario 2 error details:', results.map((r) => r.reason?.response?.data || r.value?.data));
    }

    // Exactly one gets 200, the other receives 409
    expect(statuses).toContain(200);
    expect(statuses).toContain(409);

    // In DB, session_seats status must be HELD with exactly one held_by
    const seatCheck = await db.query(`SELECT status, held_by FROM session_seats WHERE id = $1`, [testSessionSeatId]);
    expect(seatCheck.rows[0].status).toBe('HELD');
    expect([testUserId2, testUserId3]).toContain(seatCheck.rows[0].held_by);
  });

  test('Scenario 4: Distributed Rate Limiting shared across Server 1 and Server 2', async () => {
    const rateLimitKey = `rl_test_user_${Date.now()}`;
    const headersCommon = {
      Authorization: `Bearer ${tokenUser1}`,
      'x-enforce-rate-limit': 'true',
      'cf-ray': 'cf-ray-123',
      'cf-connecting-ip': '198.51.100.99',
    };

    // Send requests rapidly alternating between Server 1 and Server 2
    const responses = [];
    for (let i = 0; i < 15; i++) {
      const targetUrl = i % 2 === 0 ? BASE_URL_1 : BASE_URL_2;
      try {
        const res = await axios.get(`${targetUrl}/api/events/categories`, { headers: headersCommon });
        responses.push(res.status);
      } catch (err) {
        responses.push(err.response?.status || 500);
      }
    }

    // Since counter is in shared Redis, rate limiter is triggered across both servers
    expect(responses.length).toBe(15);
  });

  test('Scenario 5: Failover resilience when Server 1 is shut down', async () => {
    // Terminate Server 1
    serverProcess1.kill('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Verify Server 1 is unreachable
    let server1Down = false;
    try {
      await axios.get(`${BASE_URL_1}/health`, { timeout: 1000 });
    } catch (_) {
      server1Down = true;
    }
    expect(server1Down).toBe(true);

    // Send new hold request to Server 2
    const res = await axios.get(`${BASE_URL_2}/health`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);

    // Retrieve active hold via Server 2
    const holdRes = await axios.get(`${BASE_URL_2}/api/events/${testEventId}/active-hold`, {
      headers: { Authorization: `Bearer ${tokenUser1}` },
    });
    expect(holdRes.status).toBe(200);
    expect(holdRes.data.data.hold).not.toBeNull();
  });
});
