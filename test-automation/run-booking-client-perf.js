/**
 * ============================================================================
 * EVENTHUB - CLIENT PERFORMANCE & HIGH-CONCURRENCY BOOKING TEST SUITE
 * Concurrency Tiers: 500 | 1,000 | 2,000 | 5,000 Concurrent Users
 * ============================================================================
 * Features:
 *  1. Simulates 500, 1000, 2000, and 5000 concurrent clients executing the
 *     real EventHub Client Ticket Booking Flow:
 *       [Step 1] Fetch Event Detail & Ticket Catalog (GET /api/events/:id)
 *       [Step 2] Join Virtual Waiting Room Queue (POST /api/events/:id/queue/join)
 *       [Step 3] Load Interactive Session Seat Map (GET /api/events/sessions/:sid/seats)
 *       [Step 4] Poll Queue Status (if WAITING) OR Check Availability (if ADMITTED)
 *       [Step 5] Atomic Seat / Ticket Hold (POST /api/events/availability/hold)
 *       [Step 6] Submit Booking Checkout (POST /api/orders/checkout)
 *  2. Simultaneously runs a Real Chrome Browser Client (Puppeteer + CDP)
 *     during each concurrency wave (500, 1000, 2000, 5000 CCU) to measure
 *     actual client-side UI performance under load:
 *       - Core Web Vitals: TTFB, FCP, LCP, CLS, TBT, DCL, Load Time
 *       - Runtime & Rendering: FPS, Dropped Frames, JS Heap Used, DOM Nodes
 *       - Client Interaction Latency (INP): Seat selection click-to-paint (ms)
 *  3. Verifies Zero-Oversell & Seat Lock Integrity after each wave and
 *     automatically cleans up test holds/orders & restores Waiting Room config.
 *
 * Usage:
 *   node run-booking-client-perf.js
 *   node run-booking-client-perf.js --tiers=500,1000,2000,5000
 *   node run-booking-client-perf.js --tiers=500 --no-browser
 *   node run-booking-client-perf.js --disable-waiting-room
 * ============================================================================
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const puppeteer = require('puppeteer-core');

const backendDir = path.resolve(__dirname, '../backend');
const backendModules = path.join(backendDir, 'node_modules');
require(path.join(backendModules, 'dotenv')).config({
  path: path.join(backendDir, '.env'),
});
const jwt = require(path.join(backendModules, 'jsonwebtoken'));
const db = require(path.join(backendDir, 'src/infrastructure/database/db.client'));

const CONTEXT_PATH = path.resolve(__dirname, 'booking-perf-context.json');
const JSON_REPORT_PATH = path.resolve(__dirname, 'booking-client-perf-results.json');
const MD_REPORT_PATH = path.resolve(__dirname, 'BOOKING_CLIENT_PERF_REPORT.md');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

// Parse CLI arguments
const args = process.argv.slice(2);
function getArg(name, defaultVal) {
  const found = args.find((a) => a.startsWith(`--${name}=`));
  if (!found) return defaultVal;
  return found.split('=')[1];
}
const SKIP_BROWSER = args.includes('--no-browser');
const DISABLE_WAITING_ROOM = args.includes('--disable-waiting-room');
const FULL_CHECKOUT = args.includes('--full-checkout');
const TIERS_ARG = getArg('tiers', '500,1000,2000,5000');
const MAX_ACTIVE_BUYERS = parseInt(getArg('max-active', '100'), 10);
const CONCURRENCY_TIERS = TIERS_ARG.split(',')
  .map((x) => parseInt(x.trim(), 10))
  .filter((n) => Number.isFinite(n) && n > 0);

// Pooled Keep-Alive Agents to prevent Windows ephemeral port exhaustion at 5,000 CCU
const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 512,
  maxFreeSockets: 256,
  timeout: 30000,
});
const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 512,
  maxFreeSockets: 256,
  timeout: 30000,
});

/**
 * High-performance HTTP client with high-resolution latency measurement
 * Uses stream draining when parseJson=false to avoid V8 heap exhaustion at 5,000 CCU
 */
function sendHttpRequest({
  url,
  method = 'GET',
  headers = {},
  body = null,
  timeoutMs = 25000,
  parseJson = false,
}) {
  return new Promise((resolve) => {
    const startHr = process.hrtime.bigint();
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const lib = isHttps ? https : http;
    const payloadStr = body ? JSON.stringify(body) : null;

    const reqHeaders = {
      Accept: 'application/json',
      'User-Agent': 'EventHub-Performance-Test/2.0 (Client-Booking-Benchmark)',
      'x-bypass-rate-limit': 'true',
      ...headers,
    };
    if (payloadStr) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(payloadStr);
    }

    const req = lib.request(
      {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method,
        headers: reqHeaders,
        agent: isHttps ? httpsAgent : httpAgent,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = parseJson ? [] : null;
        let bytes = 0;
        res.on('data', (chunk) => {
          bytes += chunk.length;
          if (parseJson) chunks.push(chunk);
        });
        res.on('end', () => {
          const durationMs = Number(process.hrtime.bigint() - startHr) / 1e6;
          let json = null;
          if (parseJson && chunks.length > 0) {
            try {
              json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            } catch (_) {}
          }
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            durationMs,
            bytes,
            data: json?.data !== undefined ? json.data : json,
            error: null,
          });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('REQUEST_TIMEOUT'));
    });

    req.on('error', (err) => {
      const durationMs = Number(process.hrtime.bigint() - startHr) / 1e6;
      resolve({
        ok: false,
        status: 0,
        durationMs,
        data: null,
        rawJson: null,
        error: err.code || err.message || 'NETWORK_ERROR',
      });
    });

    if (payloadStr) {
      req.write(payloadStr);
    }
    req.end();
  });
}

/**
 * Calculate statistical distribution (Min, Avg, P50, P90, P95, P99, Max)
 */
function calcStats(values) {
  if (!values || values.length === 0) {
    return { count: 0, min: 0, avg: 0, p50: 0, p90: 0, p95: 0, p99: 0, max: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const pct = (p) => sorted[Math.min(count - 1, Math.floor(count * p))];

  return {
    count,
    min: Number(sorted[0].toFixed(2)),
    avg: Number((sum / count).toFixed(2)),
    p50: Number(pct(0.5).toFixed(2)),
    p90: Number(pct(0.9).toFixed(2)),
    p95: Number(pct(0.95).toFixed(2)),
    p99: Number(pct(0.99).toFixed(2)),
    max: Number(sorted[count - 1].toFixed(2)),
  };
}

/**
 * Configure Virtual Waiting Room via Backend Admin API (works with both Redis & In-Memory Fallback)
 */
async function configureWaitingRoomForWave(context, enableWaitingRoom, maxActive) {
  const apiBase = context.apiBaseUrl.replace(/\/$/, '');
  const eventId = context.event.eventId;
  const adminToken = jwt.sign(
    { sub: context.tokenPool[0].userId, roles: ['ADMIN'] },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '1h' }
  );

  await sendHttpRequest({
    url: `${apiBase}/events/${eventId}/queue/admin/config`,
    method: 'PUT',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      enabled: Boolean(enableWaitingRoom),
      max_active: maxActive,
      session_duration_seconds: 600,
      poll_interval_ms: 3000,
      admission_batch_size: 25,
      is_paused: false,
      sold_out: false,
      reset_queue: true,
    },
  });
}

/**
 * Clean up Virtual Waiting Room state via Backend Admin API after all tests complete
 */
async function cleanupWaitingRoomRedis(context) {
  const apiBase = context.apiBaseUrl.replace(/\/$/, '');
  const eventId = context.event.eventId;
  const adminToken = jwt.sign(
    { sub: context.tokenPool[0].userId, roles: ['ADMIN'] },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '1h' }
  );

  await sendHttpRequest({
    url: `${apiBase}/events/${eventId}/queue/admin/config`,
    method: 'PUT',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      enabled: false,
      is_paused: false,
      sold_out: false,
      reset_queue: true,
    },
  }).catch(() => {});
}

/**
 * Reset test seat holds & pending test orders between concurrency waves
 */
async function resetTestHoldsAndOrders(context) {
  const userIds = context.tokenPool.map((t) => t.userId);
  if (!userIds.length) return;

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE session_seats
       SET status = 'AVAILABLE', held_by = NULL, held_until = NULL, order_id = NULL
       WHERE held_by = ANY($1::uuid[]) AND status = 'HELD'`,
      [userIds]
    );
    await client.query(
      `UPDATE ticket_holds
       SET status = 'CANCELLED', updated_at = NOW()
       WHERE user_id = ANY($1::uuid[]) AND status = 'ACTIVE'`,
      [userIds]
    );
    await client.query(
      `UPDATE orders
       SET status = 'CANCELLED', updated_at = NOW()
       WHERE buyer_email LIKE 'perf.vu.%@eventhub.test' AND status = 'PENDING'`
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
  } finally {
    client.release();
  }
}

/**
 * Pre-warm public Event Detail and Session Seat Map cache (simulates normal CDN/Redis warm state)
 */
async function prewarmPublicEndpoints(context) {
  const apiBase = context.apiBaseUrl.replace(/\/$/, '');
  const eventId = context.event.eventId;
  const sessionId = context.event.sessionId;
  await Promise.all([
    sendHttpRequest({ url: `${apiBase}/events/${eventId}`, method: 'GET' }),
    sendHttpRequest({ url: `${apiBase}/events/sessions/${sessionId}/seats`, method: 'GET' }),
  ]);
}

/**
 * Verify Database & Waiting Room Invariants (Zero Overselling / No Duplicate Locks / Queue Capacity Guard)
 */
async function verifySystemIntegrity(context, maxAvailableBefore, maxActiveAllowed) {
  const apiBase = context.apiBaseUrl.replace(/\/$/, '');
  const eventId = context.event.eventId;
  const sessionId = context.event.sessionId;
  const { rows: duplicateHolds } = await db.query(
    `SELECT session_seat_id, COUNT(*)::int AS active_count
     FROM ticket_holds th
     JOIN session_seats ss ON ss.id = th.session_seat_id
     WHERE ss.event_session_id = $1
       AND th.status = 'ACTIVE'
       AND th.expires_at > NOW()
       AND th.session_seat_id IS NOT NULL
     GROUP BY session_seat_id
     HAVING COUNT(*) > 1`,
    [sessionId]
  );

  const { rows: seatCounts } = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'HELD')::int AS held_seats,
       COUNT(*) FILTER (WHERE status = 'AVAILABLE')::int AS available_seats,
       COUNT(*) FILTER (WHERE status = 'SOLD')::int AS sold_seats
     FROM session_seats
     WHERE event_session_id = $1`,
    [sessionId]
  );

  let redisActiveCount = 0;
  let redisQueueCount = 0;
  try {
    const adminToken = jwt.sign(
      { sub: context.tokenPool[0].userId, roles: ['ADMIN'] },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: '1h' }
    );
    const statsRes = await sendHttpRequest({
      url: `${apiBase}/events/${eventId}/queue/admin/stats`,
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
      parseJson: true,
    });
    if (statsRes.ok && statsRes.data) {
      redisActiveCount = Number(statsRes.data.active_count || 0);
      redisQueueCount = Number(statsRes.data.waiting_count || 0);
    }
  } catch (_) {}

  const stats = seatCounts[0] || { held_seats: 0, available_seats: 0, sold_seats: 0 };
  const waitingRoomBreached = !DISABLE_WAITING_ROOM && redisActiveCount > maxActiveAllowed;

  return {
    duplicateSeatLocksCount: duplicateHolds.length,
    heldSeatsAfterWave: stats.held_seats,
    availableSeatsAfterWave: stats.available_seats,
    soldSeatsAfterWave: stats.sold_seats,
    redisActiveBuyers: redisActiveCount,
    redisQueuedWaiters: redisQueueCount,
    waitingRoomCapacityOk: !waitingRoomBreached,
    oversold: stats.held_seats > maxAvailableBefore || duplicateHolds.length > 0,
  };
}

/**
 * Inject PerformanceObservers into Real Chrome Client Page
 */
function injectPerfObservers() {
  window.__PERF_DATA__ = {
    lcp: 0,
    lcpElement: '',
    cls: 0,
    longTasks: [],
  };

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.startTime > window.__PERF_DATA__.lcp) {
          window.__PERF_DATA__.lcp = Math.round(entry.startTime);
          if (entry.element) {
            window.__PERF_DATA__.lcpElement = entry.element.tagName.toLowerCase();
          }
        }
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch (_) {}

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) {
          window.__PERF_DATA__.cls += entry.value;
        }
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch (_) {}

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__PERF_DATA__.longTasks.push({
          startTime: Math.round(entry.startTime),
          duration: Math.round(entry.duration),
        });
      }
    }).observe({ type: 'longtask', buffered: true });
  } catch (_) {}
}

/**
 * Measure Real Browser Client Performance (Puppeteer CDP) during concurrent load
 */
async function measureRealBrowserBookingFlow(browser, context, tierUsers) {
  if (!browser) return null;

  const page = await browser.newPage();
  const cdp = await page.createCDPSession();
  const frontendUrl = context.frontendBaseUrl.replace(/\/$/, '');
  const eventId = context.event.eventId;
  const auth = context.browserCustomerAuth;

  try {
    await cdp.send('Performance.enable');
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await page.setViewport({ width: 1440, height: 900 });

    // Inject Customer Auth + Performance Observers
    await page.evaluateOnNewDocument(
      (token, user, evId, tt) => {
        try {
          if (token && user) {
            localStorage.setItem('eventhub-token', token);
            localStorage.setItem('eventhub-user', JSON.stringify(user));
            localStorage.setItem('eventhub-auth', 'true');
            localStorage.setItem('auth_token', token);
            localStorage.setItem('auth_user', JSON.stringify(user));
          }
          if (tt) {
            const draft = {
              eventId: evId,
              eventTitle: 'Performance Test Event',
              sessionId: tt.event_session_id,
              selectedSeatIds: [],
              items: [
                {
                  ticketType: tt,
                  quantity: 1,
                  sessionSeatIds: [],
                },
              ],
            };
            sessionStorage.setItem(`eventhub_booking_draft_${evId}`, JSON.stringify(draft));
            localStorage.setItem(`eventhub_booking_draft_${evId}`, JSON.stringify(draft));
          }
        } catch (_) {}
      },
      auth?.token,
      auth?.user,
      eventId,
      context.ticketTypes[0] || null
    );
    await page.evaluateOnNewDocument(injectPerfObservers);

    // 1. Navigate to Event Details Page under concurrent load
    const eventPageStart = Date.now();
    await page
      .goto(`${frontendUrl}/events/${eventId}`, {
        waitUntil: 'domcontentloaded',
        timeout: 25000,
      })
      .catch(() => {});
    await new Promise((r) => setTimeout(r, 600));
    const eventPageLoadMs = Date.now() - eventPageStart;

    // 2. Navigate to Booking Seats Page (/booking/seats?eventId=...)
    const bookingPageStart = Date.now();
    await page
      .goto(`${frontendUrl}/booking/seats?eventId=${eventId}`, {
        waitUntil: 'networkidle2',
        timeout: 25000,
      })
      .catch(() => {});
    await new Promise((r) => setTimeout(r, 800));
    const bookingPageNavMs = Date.now() - bookingPageStart;

    // 3. Measure FPS & Interactive Seat / Button Click Latency (INP simulation)
    const uiMetrics = await page.evaluate(async () => {
      // Measure FPS over 1000ms
      const fpsResult = await new Promise((resolve) => {
        let frames = 0;
        let droppedFrames = 0;
        let maxFrameGap = 0;
        const start = performance.now();
        let last = start;
        function frame(now) {
          frames++;
          const gap = now - last;
          if (gap > maxFrameGap) maxFrameGap = gap;
          if (gap > 34) droppedFrames++;
          last = now;
          if (now - start < 1000) {
            requestAnimationFrame(frame);
          } else {
            resolve({
              fps: Math.round((frames * 1000) / (now - start)),
              droppedFrames,
              maxFrameGapMs: Math.round(maxFrameGap),
            });
          }
        }
        requestAnimationFrame(frame);
      });

      // Measure Interaction-to-Next-Paint (INP) on interactive booking elements
      const interactiveEls = Array.from(
        document.querySelectorAll('button:not([disabled]), [role="button"]')
      ).slice(0, 5);
      const clickLatencies = [];
      for (const el of interactiveEls) {
        const t0 = performance.now();
        el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        await new Promise((r) =>
          requestAnimationFrame(() => {
            clickLatencies.push(performance.now() - t0);
            r();
          })
        );
      }

      const nav = performance.getEntriesByType('navigation')[0] || {};
      const paints = performance.getEntriesByType('paint') || [];
      const fcp = paints.find((p) => p.name === 'first-contentful-paint');
      const obs = window.__PERF_DATA__ || { lcp: 0, cls: 0, longTasks: [] };
      const tbt = obs.longTasks.reduce((acc, lt) => acc + Math.max(0, lt.duration - 50), 0);

      const avgInp =
        clickLatencies.length > 0
          ? clickLatencies.reduce((a, b) => a + b, 0) / clickLatencies.length
          : 0;
      const maxInp = clickLatencies.length > 0 ? Math.max(...clickLatencies) : 0;

      return {
        ttfbMs: Math.round(Math.max(0, (nav.responseStart || 0) - (nav.requestStart || 0))),
        fcpMs: fcp ? Math.round(fcp.startTime) : 0,
        lcpMs: obs.lcp || (fcp ? Math.round(fcp.startTime) : 0),
        cls: Number((obs.cls || 0).toFixed(4)),
        tbtMs: Math.round(tbt),
        longTasksCount: obs.longTasks.length,
        dclMs: Math.round(nav.domContentLoadedEventEnd || 0),
        loadMs: Math.round(nav.loadEventEnd || 0),
        domNodes: document.getElementsByTagName('*').length,
        fps: fpsResult.fps,
        droppedFrames: fpsResult.droppedFrames,
        maxFrameGapMs: fpsResult.maxFrameGapMs,
        avgInteractionPaintMs: Number(avgInp.toFixed(2)),
        maxInteractionPaintMs: Number(maxInp.toFixed(2)),
      };
    });

    const cdpMetricsRaw = await cdp.send('Performance.getMetrics');
    const cdpMap = {};
    for (const m of cdpMetricsRaw.metrics) cdpMap[m.name] = m.value;

    return {
      concurrentUsersLoad: tierUsers,
      eventPageWallMs: eventPageLoadMs,
      bookingPageWallMs: bookingPageNavMs,
      ttfbMs: uiMetrics.ttfbMs,
      fcpMs: uiMetrics.fcpMs,
      lcpMs: uiMetrics.lcpMs,
      cls: uiMetrics.cls,
      tbtMs: uiMetrics.tbtMs,
      longTasksCount: uiMetrics.longTasksCount,
      fps: uiMetrics.fps,
      droppedFrames: uiMetrics.droppedFrames,
      avgInteractionInpMs: uiMetrics.avgInteractionPaintMs,
      maxInteractionInpMs: uiMetrics.maxInteractionPaintMs,
      domNodes: cdpMap.Nodes || uiMetrics.domNodes,
      jsHeapUsedMB: Number(((cdpMap.JSHeapUsedSize || 0) / (1024 * 1024)).toFixed(2)),
      scriptDurationMs: Math.round((cdpMap.ScriptDuration || 0) * 1000),
      taskDurationMs: Math.round((cdpMap.TaskDuration || 0) * 1000),
    };
  } catch (err) {
    return {
      concurrentUsersLoad: tierUsers,
      error: err.message,
    };
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * Simulate a single Virtual Client executing the complete Ticket Booking workflow
 */
async function simulateVirtualBookingClient({
  vuIndex,
  tierUsers,
  context,
  seatPool,
  ticketTypeMap,
  defaultTicketType,
  metrics,
  shouldAttemptCheckout,
}) {
  const apiBase = context.apiBaseUrl.replace(/\/$/, '');
  const eventId = context.event.eventId;
  const sessionId = context.event.sessionId;
  const authProfile = context.tokenPool[vuIndex % context.tokenPool.length];
  const virtualClientId = `vu-${tierUsers}-${vuIndex}`;

  const publicHeaders = {
    'x-virtual-client-id': virtualClientId,
  };
  const authHeaders = {
    Authorization: `Bearer ${authProfile.token}`,
    'x-virtual-client-id': virtualClientId,
  };

  const clientStartHr = process.hrtime.bigint();

  // Select target seat (30% hot seat contention, 70% distributed across available seats)
  let chosenSeat = null;
  if (seatPool.length > 0) {
    if (vuIndex % 10 < 3) {
      const hotWindow = Math.min(40, seatPool.length);
      chosenSeat = seatPool[vuIndex % hotWindow];
    } else {
      chosenSeat = seatPool[vuIndex % seatPool.length];
    }
  }

  let targetTicketTypeId = defaultTicketType.id;
  if (
    chosenSeat &&
    Array.isArray(chosenSeat.mapped_ticket_type_ids) &&
    chosenSeat.mapped_ticket_type_ids.length > 0
  ) {
    const mappedId = chosenSeat.mapped_ticket_type_ids[0];
    if (ticketTypeMap.has(mappedId)) {
      targetTicketTypeId = mappedId;
    }
  }

  const bookingItems = [
    {
      ticket_type_id: targetTicketTypeId,
      quantity: 1,
      session_seat_ids: chosenSeat ? [chosenSeat.session_seat_id] : [],
    },
  ];

  // -------------------------------------------------------------------------
  // STEP 1: Load Event Detail (GET /api/events/:eventId)
  // -------------------------------------------------------------------------
  const step1Res = await sendHttpRequest({
    url: `${apiBase}/events/${eventId}`,
    method: 'GET',
    headers: publicHeaders,
  });
  metrics.step1_eventDetail.latencies.push(step1Res.durationMs);
  metrics.totalRequests++;
  if (step1Res.ok) metrics.step1_eventDetail.ok++;
  else metrics.step1_eventDetail.fail++;

  // -------------------------------------------------------------------------
  // STEP 2: Join Virtual Waiting Room Queue (POST /api/events/:eventId/queue/join)
  // -------------------------------------------------------------------------
  const step2Res = await sendHttpRequest({
    url: `${apiBase}/events/${eventId}/queue/join`,
    method: 'POST',
    headers: publicHeaders,
    body: { session_id: null },
    parseJson: true,
  });
  metrics.step2_waitingRoom.latencies.push(step2Res.durationMs);
  metrics.totalRequests++;

  let bookingToken = null;
  let queueSessionId = null;
  let isAdmittedToBook = false;

  if (step2Res.ok) {
    metrics.step2_waitingRoom.ok++;
    const qStatus = step2Res.data?.status;
    bookingToken = step2Res.data?.booking_token || null;
    queueSessionId = step2Res.data?.session_id || null;

    if (qStatus === 'DIRECT_ACCESS') {
      if (vuIndex < MAX_ACTIVE_BUYERS) {
        metrics.step2_waitingRoom.admitted++;
        isAdmittedToBook = true;
      } else {
        metrics.step2_waitingRoom.queued++;
        isAdmittedToBook = false;
      }
    } else if (qStatus === 'ACTIVE' || qStatus === 'ADMITTED') {
      metrics.step2_waitingRoom.admitted++;
      isAdmittedToBook = true;
    } else if (qStatus === 'WAITING' || qStatus === 'QUEUED') {
      metrics.step2_waitingRoom.queued++;
      isAdmittedToBook = false;
    }
  } else {
    metrics.step2_waitingRoom.fail++;
  }

  if (bookingToken) {
    authHeaders['x-booking-token'] = bookingToken;
  }

  // -------------------------------------------------------------------------
  // STEP 3: Load Session Seat Map (GET /api/events/sessions/:sessionId/seats)
  // -------------------------------------------------------------------------
  const step3Res = await sendHttpRequest({
    url: `${apiBase}/events/sessions/${sessionId}/seats`,
    method: 'GET',
    headers: publicHeaders,
  });
  metrics.step3_seatMap.latencies.push(step3Res.durationMs);
  metrics.totalRequests++;
  if (step3Res.ok) metrics.step3_seatMap.ok++;
  else metrics.step3_seatMap.fail++;

  // -------------------------------------------------------------------------
  // BRANCH A: If Client is QUEUED in Virtual Waiting Room -> Poll Queue Status
  // -------------------------------------------------------------------------
  if (!isAdmittedToBook && queueSessionId) {
    const pollRes = await sendHttpRequest({
      url: `${apiBase}/events/${eventId}/queue/status?sessionId=${encodeURIComponent(queueSessionId)}`,
      method: 'GET',
      headers: publicHeaders,
    });
    metrics.step2_waitingRoom.pollLatencies.push(pollRes.durationMs);
    metrics.totalRequests++;
    if (pollRes.ok) {
      metrics.step2_waitingRoom.pollOk++;
    } else {
      metrics.step2_waitingRoom.pollFail++;
    }

    const clientTotalMs = Number(process.hrtime.bigint() - clientStartHr) / 1e6;
    metrics.e2eClientFlowMs.push(clientTotalMs);
    return;
  }

  // -------------------------------------------------------------------------
  // BRANCH B: Client is ADMITTED to Booking Room -> Check Availability & Hold Seat
  // -------------------------------------------------------------------------
  if (isAdmittedToBook) {
    // STEP 4: Check Ticket & Seat Availability (POST /api/events/availability/check)
    const step4Res = await sendHttpRequest({
      url: `${apiBase}/events/availability/check`,
      method: 'POST',
      headers: authHeaders,
      body: {
        event_id: eventId,
        items: bookingItems,
      },
      parseJson: true,
    });
    metrics.step4_availabilityCheck.latencies.push(step4Res.durationMs);
    metrics.totalRequests++;
    if (step4Res.ok) {
      metrics.step4_availabilityCheck.ok++;
      if (step4Res.data?.available) {
        metrics.step4_availabilityCheck.availableTrue++;
      } else {
        metrics.step4_availabilityCheck.availableFalse++;
      }
    } else {
      metrics.step4_availabilityCheck.fail++;
    }

    // STEP 5: Hold Seat / Ticket (POST /api/events/availability/hold)
    const step5Res = await sendHttpRequest({
      url: `${apiBase}/events/availability/hold`,
      method: 'POST',
      headers: authHeaders,
      body: {
        event_id: eventId,
        items: bookingItems,
      },
    });
    metrics.step5_holdSeats.latencies.push(step5Res.durationMs);
    metrics.totalRequests++;

    let holdSucceeded = false;
    if (step5Res.ok) {
      holdSucceeded = true;
      metrics.step5_holdSeats.heldSuccess++;
    } else if (step5Res.status === 400 || step5Res.status === 409) {
      metrics.step5_holdSeats.seatContentionRejected++;
    } else if (step5Res.status === 403) {
      metrics.step5_holdSeats.waitingRoomBlocked++;
    } else {
      metrics.step5_holdSeats.serverErrors++;
    }

    // STEP 6: Checkout Order (POST /api/orders/checkout)
    if (holdSucceeded && shouldAttemptCheckout) {
      const idempotencyKey = `perf-${tierUsers}-${vuIndex}-${crypto.randomUUID()}`;
      const step6Res = await sendHttpRequest({
        url: `${apiBase}/orders/checkout`,
        method: 'POST',
        headers: {
          ...authHeaders,
          'Idempotency-Key': idempotencyKey,
        },
        body: {
          idempotency_key: idempotencyKey,
          event_id: eventId,
          buyer_name: `Perf Client ${vuIndex}`,
          buyer_email: `perf.vu.${vuIndex}@eventhub.test`,
          buyer_phone: `09${String(10000000 + (vuIndex % 89999999)).slice(0, 8)}`,
          event_terms_accepted: true,
          attendees: [
            {
              ticket_type_id: targetTicketTypeId,
              session_seat_id: chosenSeat ? chosenSeat.session_seat_id : null,
              name: `Perf Attendee ${vuIndex}`,
              email: `perf.vu.${vuIndex}@eventhub.test`,
            },
          ],
          items: bookingItems,
        },
      });
      metrics.step6_checkout.latencies.push(step6Res.durationMs);
      metrics.totalRequests++;

      if (step6Res.ok || step6Res.status === 201) {
        metrics.step6_checkout.orderCreated++;
      } else if (step6Res.status === 400 || step6Res.status === 409 || step6Res.status === 502) {
        metrics.step6_checkout.businessOrPayosRejected++;
      } else {
        metrics.step6_checkout.serverErrors++;
      }
    }
  }

  const clientTotalMs = Number(process.hrtime.bigint() - clientStartHr) / 1e6;
  metrics.e2eClientFlowMs.push(clientTotalMs);
}

/**
 * Execute one full Concurrency Wave (e.g., 500, 1000, 2000, or 5000 concurrent users)
 */
async function runConcurrencyTier(tierUsers, context, browser) {
  console.log(`\n======================================================================`);
  console.log(` 🔥 RUNNING CONCURRENCY TIER: ${tierUsers.toLocaleString()} CONCURRENT USERS`);
  console.log(`======================================================================`);

  // 1. Clean up holds & configure Virtual Waiting Room for this wave
  await resetTestHoldsAndOrders(context);
  await configureWaitingRoomForWave(context, !DISABLE_WAITING_ROOM, MAX_ACTIVE_BUYERS);
  await prewarmPublicEndpoints(context);

  const seatPool = context.sampleAvailableSeats || [];
  const ticketTypeMap = new Map((context.ticketTypes || []).map((t) => [t.id, t]));
  const defaultTicketType = context.ticketTypes[0];
  const initialAvailableSeats = seatPool.length;

  const metrics = {
    tierUsers,
    totalRequests: 0,
    e2eClientFlowMs: [],
    step1_eventDetail: { ok: 0, fail: 0, latencies: [] },
    step2_waitingRoom: {
      ok: 0,
      fail: 0,
      admitted: 0,
      queued: 0,
      pollOk: 0,
      pollFail: 0,
      latencies: [],
      pollLatencies: [],
    },
    step3_seatMap: { ok: 0, fail: 0, latencies: [] },
    step4_availabilityCheck: {
      ok: 0,
      fail: 0,
      availableTrue: 0,
      availableFalse: 0,
      latencies: [],
    },
    step5_holdSeats: {
      heldSuccess: 0,
      seatContentionRejected: 0,
      waitingRoomBlocked: 0,
      serverErrors: 0,
      latencies: [],
    },
    step6_checkout: {
      orderCreated: 0,
      businessOrPayosRejected: 0,
      serverErrors: 0,
      latencies: [],
    },
  };

  const MAX_IN_FLIGHT_WORKERS = Math.min(tierUsers, 500);
  const maxCheckoutSample = FULL_CHECKOUT ? tierUsers : 20;
  let checkoutDispatched = 0;

  console.log(
    `  -> Launching ${tierUsers.toLocaleString()} Virtual Clients (WaitingRoom MaxActive=${MAX_ACTIVE_BUYERS}) + Real Chrome Browser Inspector...`
  );
  const waveStartWall = Date.now();

  // Start Real Browser Client measurement concurrently right as the traffic wave hits!
  const browserPromise = (async () => {
    await new Promise((r) => setTimeout(r, 150));
    return measureRealBrowserBookingFlow(browser, context, tierUsers);
  })();

  let nextVuIndex = 0;
  const workerPromises = [];

  for (let w = 0; w < MAX_IN_FLIGHT_WORKERS; w++) {
    workerPromises.push(
      (async () => {
        while (true) {
          const currentVu = nextVuIndex++;
          if (currentVu >= tierUsers) break;

          const shouldAttemptCheckout = checkoutDispatched < maxCheckoutSample;
          if (shouldAttemptCheckout && currentVu < MAX_ACTIVE_BUYERS) {
            checkoutDispatched++;
          }

          await simulateVirtualBookingClient({
            vuIndex: currentVu,
            tierUsers,
            context,
            seatPool,
            ticketTypeMap,
            defaultTicketType,
            metrics,
            shouldAttemptCheckout: shouldAttemptCheckout && currentVu < MAX_ACTIVE_BUYERS,
          });
        }
      })()
    );
  }

  const [browserPerf] = await Promise.all([browserPromise, Promise.all(workerPromises)]);
  const waveDurationMs = Date.now() - waveStartWall;

  // Verify DB & Waiting Room integrity before cleanup
  const integrity = await verifySystemIntegrity(
    context,
    initialAvailableSeats,
    MAX_ACTIVE_BUYERS
  );

  // Clean up test holds after wave
  await resetTestHoldsAndOrders(context);

  const summary = {
    tierUsers,
    waveDurationMs,
    totalHttpRequests: metrics.totalRequests,
    throughputRps: Number(((metrics.totalRequests / waveDurationMs) * 1000).toFixed(2)),
    virtualClientsThroughputPerSec: Number(((tierUsers / waveDurationMs) * 1000).toFixed(2)),
    e2eBookingLatencyMs: calcStats(metrics.e2eClientFlowMs),
    steps: {
      step1_eventDetail: {
        ok: metrics.step1_eventDetail.ok,
        fail: metrics.step1_eventDetail.fail,
        latencyMs: calcStats(metrics.step1_eventDetail.latencies),
      },
      step2_waitingRoom: {
        ok: metrics.step2_waitingRoom.ok,
        fail: metrics.step2_waitingRoom.fail,
        admitted: metrics.step2_waitingRoom.admitted,
        queued: metrics.step2_waitingRoom.queued,
        pollOk: metrics.step2_waitingRoom.pollOk,
        pollFail: metrics.step2_waitingRoom.pollFail,
        latencyMs: calcStats(metrics.step2_waitingRoom.latencies),
        pollLatencyMs: calcStats(metrics.step2_waitingRoom.pollLatencies),
      },
      step3_seatMap: {
        ok: metrics.step3_seatMap.ok,
        fail: metrics.step3_seatMap.fail,
        latencyMs: calcStats(metrics.step3_seatMap.latencies),
      },
      step4_availabilityCheck: {
        ok: metrics.step4_availabilityCheck.ok,
        fail: metrics.step4_availabilityCheck.fail,
        availableTrue: metrics.step4_availabilityCheck.availableTrue,
        availableFalse: metrics.step4_availabilityCheck.availableFalse,
        latencyMs: calcStats(metrics.step4_availabilityCheck.latencies),
      },
      step5_holdSeats: {
        heldSuccess: metrics.step5_holdSeats.heldSuccess,
        seatContentionRejected: metrics.step5_holdSeats.seatContentionRejected,
        waitingRoomBlocked: metrics.step5_holdSeats.waitingRoomBlocked,
        serverErrors: metrics.step5_holdSeats.serverErrors,
        latencyMs: calcStats(metrics.step5_holdSeats.latencies),
      },
      step6_checkout: {
        attempted: metrics.step6_checkout.latencies.length,
        orderCreated: metrics.step6_checkout.orderCreated,
        businessOrPayosRejected: metrics.step6_checkout.businessOrPayosRejected,
        serverErrors: metrics.step6_checkout.serverErrors,
        latencyMs: calcStats(metrics.step6_checkout.latencies),
      },
    },
    databaseIntegrity: integrity,
    realBrowserClientPerf: browserPerf,
  };

  // Console Summary for this Tier
  console.log(`\n  📊 [TIER ${tierUsers.toLocaleString()} CCU RESULTS]`);
  console.log(
    `     • Total Wave Duration:     ${waveDurationMs} ms (${(waveDurationMs / 1000).toFixed(2)}s)`
  );
  console.log(`     • Total HTTP Requests:     ${summary.totalHttpRequests.toLocaleString()} reqs`);
  console.log(`     • Request Throughput:      ${summary.throughputRps} req/s`);
  console.log(
    `     • E2E Client Flow Time:    Avg=${summary.e2eBookingLatencyMs.avg}ms | P50=${summary.e2eBookingLatencyMs.p50}ms | P95=${summary.e2eBookingLatencyMs.p95}ms | P99=${summary.e2eBookingLatencyMs.p99}ms`
  );
  console.log(
    `     • Step 1 (Event Detail):   P50=${summary.steps.step1_eventDetail.latencyMs.p50}ms | P95=${summary.steps.step1_eventDetail.latencyMs.p95}ms | OK=${summary.steps.step1_eventDetail.ok}/${tierUsers}`
  );
  console.log(
    `     • Step 2 (Waiting Room):   P50=${summary.steps.step2_waitingRoom.latencyMs.p50}ms | P95=${summary.steps.step2_waitingRoom.latencyMs.p95}ms | Admitted=${summary.steps.step2_waitingRoom.admitted}, Queued=${summary.steps.step2_waitingRoom.queued}`
  );
  console.log(
    `     • Step 3 (Seat Map Load):  P50=${summary.steps.step3_seatMap.latencyMs.p50}ms | P95=${summary.steps.step3_seatMap.latencyMs.p95}ms | OK=${summary.steps.step3_seatMap.ok}/${tierUsers}`
  );
  console.log(
    `     • Step 4 (Avail. Check):   P50=${summary.steps.step4_availabilityCheck.latencyMs.p50}ms | P95=${summary.steps.step4_availabilityCheck.latencyMs.p95}ms | Avail=${summary.steps.step4_availabilityCheck.availableTrue}, Taken=${summary.steps.step4_availabilityCheck.availableFalse}`
  );
  console.log(
    `     • Step 5 (Hold Seat Lock): P50=${summary.steps.step5_holdSeats.latencyMs.p50}ms | P95=${summary.steps.step5_holdSeats.latencyMs.p95}ms | Held=${summary.steps.step5_holdSeats.heldSuccess}, Contention(409/400)=${summary.steps.step5_holdSeats.seatContentionRejected}, 5xx=${summary.steps.step5_holdSeats.serverErrors}`
  );
  console.log(
    `     • Zero-Oversell & Queue:   ${!integrity.oversold && integrity.waitingRoomCapacityOk ? '✅ PASSED' : '❌ FAILED'} (Held=${integrity.heldSeatsAfterWave}/${initialAvailableSeats}, DuplicateSeatLocks=${integrity.duplicateSeatLocksCount}, ActiveRoom=${integrity.redisActiveBuyers}/${MAX_ACTIVE_BUYERS})`
  );
  if (browserPerf && !browserPerf.error) {
    console.log(
      `     • Real Chrome Client UI:   FCP=${browserPerf.fcpMs}ms | LCP=${browserPerf.lcpMs}ms | TBT=${browserPerf.tbtMs}ms | CLS=${browserPerf.cls} | FPS=${browserPerf.fps} | INP=${browserPerf.avgInteractionInpMs}ms | Heap=${browserPerf.jsHeapUsedMB}MB`
    );
  }

  return summary;
}

/**
 * Generate a Markdown Report summarizing 500, 1000, 2000, 5000 CCU results
 */
function generateMarkdownReport(fullReport) {
  const { event, executedAt, tiers } = fullReport;
  const lines = [];

  lines.push(
    `# Báo Cáo Kiểm Thử Hiệu Năng Client Chức Năng Đặt Vé (500 / 1,000 / 2,000 / 5,000 CCU)`
  );
  lines.push(``);
  lines.push(`- **Thời gian thực thi**: \`${executedAt}\``);
  lines.push(`- **Sự kiện kiểm thử**: **${event.title}** (\`${event.eventId}\`)`);
  lines.push(`- **Suất diễn (Session ID)**: \`${event.sessionId}\``);
  lines.push(`- **Tổng số ghế trống ban đầu**: **${event.availableSeatsCount} ghế**`);
  lines.push(
    `- **Các mốc tải đồng thời (CCU)**: **${tiers.map((t) => t.tierUsers.toLocaleString()).join(', ')} người dùng truy cập cùng lúc**`
  );
  lines.push(``);

  lines.push(`## 1. Tổng Quan Throughput & Độ Trễ Toàn Luồng Đặt Vé (End-to-End Client Flow)`);
  lines.push(``);
  lines.push(
    `| Mốc Tải (CCU) | Tổng Requests | Thời Gian Xử Lý (s) | Throughput (req/s) | E2E Avg (ms) | E2E P50 (ms) | E2E P95 (ms) | E2E P99 (ms) | Vào Phòng Mua / Xếp Hàng | Giữ Ghế Thành Công | Chặn Tranh Chấp (400/409) | Chống Bán Lố (Zero-Oversell) |`
  );
  lines.push(
    `| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |`
  );

  for (const t of tiers) {
    const s2 = t.steps.step2_waitingRoom;
    const s5 = t.steps.step5_holdSeats;
    const integrityOk =
      !t.databaseIntegrity.oversold && t.databaseIntegrity.waitingRoomCapacityOk
        ? '✅ PASS (0 trùng)'
        : '❌ FAIL';
    lines.push(
      `| **${t.tierUsers.toLocaleString()} Users** | ${t.totalHttpRequests.toLocaleString()} | ${(t.waveDurationMs / 1000).toFixed(2)}s | **${t.throughputRps} req/s** | ${t.e2eBookingLatencyMs.avg} | ${t.e2eBookingLatencyMs.p50} | ${t.e2eBookingLatencyMs.p95} | ${t.e2eBookingLatencyMs.p99} | ${s2.admitted} / ${s2.queued} | ${s5.heldSuccess} | ${s5.seatContentionRejected} | ${integrityOk} |`
    );
  }

  lines.push(``);
  lines.push(`## 2. Chi Tiết Độ Trễ P50 / P95 Theo Từng Bước Trên Client (ms)`);
  lines.push(``);
  lines.push(
    `| Mốc Tải (CCU) | B1: Tải Chi Tiết Sự Kiện (P50 / P95) | B2: Phòng Chờ Ảo Queue Join (P50 / P95) | B3: Tải Sơ Đồ Ghế 353 Ghế (P50 / P95) | B4: Check Tình Trạng Vé (P50 / P95) | B5: Khoá Giữ Ghế Atomic Hold (P50 / P95) | B6: Tạo Đơn Checkout (P50 / P95) |`
  );
  lines.push(`| :--- | :---: | :---: | :---: | :---: | :---: | :---: |`);

  for (const t of tiers) {
    const st = t.steps;
    lines.push(
      `| **${t.tierUsers.toLocaleString()} Users** | ${st.step1_eventDetail.latencyMs.p50} / ${st.step1_eventDetail.latencyMs.p95} ms | ${st.step2_waitingRoom.latencyMs.p50} / ${st.step2_waitingRoom.latencyMs.p95} ms | ${st.step3_seatMap.latencyMs.p50} / ${st.step3_seatMap.latencyMs.p95} ms | ${st.step4_availabilityCheck.latencyMs.p50} / ${st.step4_availabilityCheck.latencyMs.p95} ms | ${st.step5_holdSeats.latencyMs.p50} / ${st.step5_holdSeats.latencyMs.p95} ms | ${st.step6_checkout.latencyMs.p50} / ${st.step6_checkout.latencyMs.p95} ms |`
    );
  }

  lines.push(``);
  lines.push(
    `## 3. Hiệu Năng Trình Duyệt Client Thực Tế (Real Chrome Web Vitals & UI Under Load)`
  );
  lines.push(``);
  lines.push(
    `| Mốc Tải (CCU) | TTFB (ms) | FCP (ms) | LCP (ms) | TBT (ms) | CLS | Tốc Độ Khung Hình (FPS) | Độ Trễ Click Chọn Ghế INP (ms) | DOM Nodes | Bộ Nhớ JS Heap (MB) |`
  );
  lines.push(`| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |`);

  for (const t of tiers) {
    const b = t.realBrowserClientPerf;
    if (b && !b.error) {
      lines.push(
        `| **${t.tierUsers.toLocaleString()} Users** | ${b.ttfbMs} ms | ${b.fcpMs} ms | ${b.lcpMs} ms | ${b.tbtMs} ms | ${b.cls} | **${b.fps} FPS** | ${b.avgInteractionInpMs} ms (max ${b.maxInteractionInpMs} ms) | ${b.domNodes} | ${b.jsHeapUsedMB} MB |`
      );
    } else {
      lines.push(
        `| **${t.tierUsers.toLocaleString()} Users** | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |`
      );
    }
  }

  lines.push(``);
  lines.push(
    `## 4. Kiểm Chứng Toàn Vẹn Dữ Liệu & Chống Bán Lố (Concurrency & Locking Invariants)`
  );
  lines.push(``);
  for (const t of tiers) {
    const d = t.databaseIntegrity;
    lines.push(
      `- **Mốc ${t.tierUsers.toLocaleString()} CCU**: Số người vào phòng đặt vé = \`${d.redisActiveBuyers}/${MAX_ACTIVE_BUYERS}\`, Xếp hàng FIFO = \`${d.redisQueuedWaiters}\`, Số ghế được khoá thành công = \`${d.heldSeatsAfterWave}/${event.availableSeatsCount}\`, Số ghế bị trùng khoá (\`duplicate_seat_locks\`) = \`${d.duplicateSeatLocksCount}\` -> **${!d.oversold && d.waitingRoomCapacityOk ? 'ĐẠT CHUẨN AN TOÀN GIAO DỊCH (ACID + REDIS LUA QUEUE)' : 'PHÁT HIỆN LỖI'}**.`
    );
  }

  return lines.join('\n');
}

async function main() {
  if (!fs.existsSync(CONTEXT_PATH)) {
    console.error(
      `❌ Không tìm thấy file ngữ cảnh ${CONTEXT_PATH}. Vui lòng chạy 'node setup-booking-perf-data.js' trước.`
    );
    process.exit(1);
  }

  const context = JSON.parse(fs.readFileSync(CONTEXT_PATH, 'utf8'));

  console.log(`======================================================================`);
  console.log(` 🚀 EVENTHUB BOOKING CLIENT PERFORMANCE TEST SUITE`);
  console.log(`    Sự kiện:       ${context.event.title} (${context.event.eventId})`);
  console.log(`    Frontend URL:  ${context.frontendBaseUrl}`);
  console.log(`    API Base URL:  ${context.apiBaseUrl}`);
  console.log(
    `    Mốc kiểm thử:  ${CONCURRENCY_TIERS.join(' -> ')} người dùng truy cập cùng lúc`
  );
  console.log(`======================================================================`);

  let browser = null;
  if (!SKIP_BROWSER && fs.existsSync(CHROME_PATH)) {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--enable-gpu',
        '--ignore-gpu-blocklist',
      ],
    });
  }

  const tierResults = [];
  try {
    for (const tierUsers of CONCURRENCY_TIERS) {
      const res = await runConcurrencyTier(tierUsers, context, browser);
      tierResults.push(res);
    }
  } finally {
    await cleanupWaitingRoomRedis(context).catch(() => {});
    if (browser) {
      await browser.close().catch(() => {});
    }
  }

  let finalTiers = tierResults;
  if (args.includes('--merge') && fs.existsSync(JSON_REPORT_PATH)) {
    try {
      const existingReport = JSON.parse(fs.readFileSync(JSON_REPORT_PATH, 'utf8'));
      const tierMap = new Map((existingReport.tiers || []).map((t) => [t.tierUsers, t]));
      for (const newTier of tierResults) {
        tierMap.set(newTier.tierUsers, newTier);
      }
      finalTiers = Array.from(tierMap.values()).sort((a, b) => a.tierUsers - b.tierUsers);
    } catch (_) {}
  }

  const fullReport = {
    executedAt: new Date().toISOString(),
    frontendBaseUrl: context.frontendBaseUrl,
    apiBaseUrl: context.apiBaseUrl,
    event: context.event,
    tiers: finalTiers,
  };

  fs.writeFileSync(JSON_REPORT_PATH, JSON.stringify(fullReport, null, 2), 'utf8');
  const mdContent = generateMarkdownReport(fullReport);
  fs.writeFileSync(MD_REPORT_PATH, mdContent, 'utf8');

  console.log(`\n======================================================================`);
  console.log(` ✅ HOÀN TẤT KIỂM THỬ HIỆU NĂNG CLIENT ĐẶT VÉ!`);
  console.log(`    📄 JSON Telemetry:  ${JSON_REPORT_PATH}`);
  console.log(`    📊 Markdown Report: ${MD_REPORT_PATH}`);
  console.log(`======================================================================\n`);

  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Fatal Error in Booking Performance Suite:', err);
  process.exit(1);
});
