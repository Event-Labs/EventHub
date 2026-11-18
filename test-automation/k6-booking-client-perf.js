/**
 * ============================================================================
 * EVENTHUB - K6 HIGH-CONCURRENCY CLIENT BOOKING PERFORMANCE SCRIPT
 * Target Concurrency Tiers: 500 | 1,000 | 2,000 | 5,000 Concurrent Users (VUs)
 * ============================================================================
 * Usage with Grafana k6:
 *   1. Run all 4 stages (500 -> 1000 -> 2000 -> 5000 VUs):
 *      k6 run k6-booking-client-perf.js
 *
 *   2. Run a specific concurrency spike (e.g. 500, 1000, 2000, or 5000 VUs):
 *      k6 run -e PROFILE=spike -e TARGET_VUS=500  k6-booking-client-perf.js
 *      k6 run -e PROFILE=spike -e TARGET_VUS=1000 k6-booking-client-perf.js
 *      k6 run -e PROFILE=spike -e TARGET_VUS=2000 k6-booking-client-perf.js
 *      k6 run -e PROFILE=spike -e TARGET_VUS=5000 k6-booking-client-perf.js
 * ============================================================================
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

// Load pre-generated Event, Seat Map, and Customer JWT Pool from setup-booking-perf-data.js
const contextRaw = open('./booking-perf-context.json');
const CONTEXT = JSON.parse(contextRaw);

const PROFILE = (__ENV.PROFILE || 'stepped').toLowerCase();
const TARGET_VUS = parseInt(__ENV.TARGET_VUS || '500', 10);
const ENABLE_CHECKOUT = (__ENV.ENABLE_CHECKOUT || 'sample').toLowerCase(); // 'sample' | 'all' | 'none'

// Custom Client Booking Metrics
const clientFrontendLoadMs = new Trend('client_frontend_load_ms', true);
const clientEventDetailMs = new Trend('client_event_detail_ms', true);
const clientWaitingRoomMs = new Trend('client_waiting_room_ms', true);
const clientSeatMapLoadMs = new Trend('client_seatmap_load_ms', true);
const clientAvailabilityCheckMs = new Trend('client_availability_check_ms', true);
const clientSeatHoldMs = new Trend('client_seat_hold_ms', true);
const clientOrderCheckoutMs = new Trend('client_order_checkout_ms', true);
const clientE2EBookingMs = new Trend('client_e2e_booking_ms', true);

const seatHoldSuccessCounter = new Counter('seat_hold_success_total');
const seatContentionCounter = new Counter('seat_contention_409_400_total');
const waitingRoomQueuedCounter = new Counter('waiting_room_queued_total');
const orderCheckoutSuccessCounter = new Counter('order_checkout_success_total');
const unexpectedServerErrorRate = new Rate('unexpected_5xx_error_rate');

export const options = {
  scenarios:
    PROFILE === 'spike'
      ? {
          booking_flash_rush: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
              { duration: '5s', target: TARGET_VUS },  // Instant flash-sale rush to TARGET_VUS (500/1000/2000/5000)
              { duration: '15s', target: TARGET_VUS }, // Sustain concurrent booking load
              { duration: '5s', target: 0 },           // Ramp down
            ],
            gracefulRampDown: '5s',
          },
        }
      : {
          // Stepped progression across all 4 required tiers: 500 -> 1000 -> 2000 -> 5000 VUs
          booking_tier_500_to_5000: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
              // Tier 1: 500 Concurrent Users
              { duration: '5s', target: 500 },
              { duration: '10s', target: 500 },
              // Tier 2: 1,000 Concurrent Users
              { duration: '5s', target: 1000 },
              { duration: '10s', target: 1000 },
              // Tier 3: 2,000 Concurrent Users
              { duration: '5s', target: 2000 },
              { duration: '10s', target: 2000 },
              // Tier 4: 5,000 Concurrent Users
              { duration: '8s', target: 5000 },
              { duration: '12s', target: 5000 },
              // Cool down
              { duration: '5s', target: 0 },
            ],
            gracefulRampDown: '5s',
          },
        },
  thresholds: {
    unexpected_5xx_error_rate: ['rate<0.05'], // Server 5xx error rate < 5% even at 5,000 CCU
    client_event_detail_ms: ['p(95)<3000'],
    client_seatmap_load_ms: ['p(95)<3000'],
    client_availability_check_ms: ['p(95)<4000'],
    client_seat_hold_ms: ['p(95)<5000'],
  },
  discardResponseBodies: false,
};

export default function () {
  const vuId = __VU;
  const iter = __ITER;
  const uniqueIndex = vuId + iter * 5000;

  const apiBase = (CONTEXT.apiBaseUrl || 'http://localhost:3000/api').replace(/\/$/, '');
  const frontendBase = (CONTEXT.frontendBaseUrl || 'http://localhost:5173').replace(/\/$/, '');
  const eventId = CONTEXT.event.eventId;
  const sessionId = CONTEXT.event.sessionId;
  const seatPool = CONTEXT.sampleAvailableSeats || [];
  const ticketTypes = CONTEXT.ticketTypes || [];
  const defaultTicketType = ticketTypes[0];

  // Rotate across real Customer JWT tokens from tokenPool
  const authProfile = CONTEXT.tokenPool[uniqueIndex % CONTEXT.tokenPool.length];
  const publicHeaders = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'User-Agent': 'k6/EventHub-Performance-Test',
    'x-bypass-rate-limit': 'true',
    'x-virtual-client-id': `k6-vu-${vuId}-iter-${iter}`,
  };
  const authHeaders = Object.assign({}, publicHeaders, {
    Authorization: `Bearer ${authProfile.token}`,
  });

  // Select target seat (30% hot seat contention, 70% distributed across available seats)
  let chosenSeat = null;
  if (seatPool.length > 0) {
    if (uniqueIndex % 10 < 3) {
      chosenSeat = seatPool[uniqueIndex % Math.min(40, seatPool.length)];
    } else {
      chosenSeat = seatPool[uniqueIndex % seatPool.length];
    }
  }

  let targetTicketTypeId = defaultTicketType.id;
  if (
    chosenSeat &&
    chosenSeat.mapped_ticket_type_ids &&
    chosenSeat.mapped_ticket_type_ids.length > 0
  ) {
    targetTicketTypeId = chosenSeat.mapped_ticket_type_ids[0];
  }

  const bookingItems = [
    {
      ticket_type_id: targetTicketTypeId,
      quantity: 1,
      session_seat_ids: chosenSeat ? [chosenSeat.session_seat_id] : [],
    },
  ];

  const flowStart = Date.now();

  group('01_Client_Load_Frontend_And_Event_Detail', () => {
    // Load Frontend Booking Route HTML shell
    const feRes = http.get(`${frontendBase}/booking/seats?eventId=${eventId}`, {
      headers: { 'User-Agent': 'k6/EventHub-Performance-Test' },
      tags: { step: '01_frontend_html' },
    });
    clientFrontendLoadMs.add(feRes.timings.duration);

    // Fetch Event Detail API (Public cached endpoint)
    const evRes = http.get(`${apiBase}/events/${eventId}`, {
      headers: publicHeaders,
      tags: { step: '01_event_detail_api' },
    });
    clientEventDetailMs.add(evRes.timings.duration);
    unexpectedServerErrorRate.add(evRes.status >= 500 || evRes.status === 0);

    check(evRes, {
      'Event Detail status is 200': (r) => r.status === 200,
    });
  });

  let bookingToken = null;
  let queueSessionId = null;
  let isAdmittedToBook = false;

  group('02_Client_Virtual_Waiting_Room_Join', () => {
    const joinRes = http.post(
      `${apiBase}/events/${eventId}/queue/join`,
      JSON.stringify({ session_id: null }),
      { headers: publicHeaders, tags: { step: '02_waiting_room_join' } }
    );
    clientWaitingRoomMs.add(joinRes.timings.duration);
    unexpectedServerErrorRate.add(joinRes.status >= 500 || joinRes.status === 0);

    if (joinRes.status === 200) {
      try {
        const body = joinRes.json();
        const data = body.data || body;
        bookingToken = data.booking_token || null;
        queueSessionId = data.session_id || null;
        if (
          data.status === 'DIRECT_ACCESS' ||
          data.status === 'ACTIVE' ||
          data.status === 'ADMITTED'
        ) {
          isAdmittedToBook = true;
        } else if (data.status === 'WAITING' || data.status === 'QUEUED') {
          waitingRoomQueuedCounter.add(1);
        }
      } catch (_) {}
    }

    if (bookingToken) {
      authHeaders['x-booking-token'] = bookingToken;
    }
  });

  group('03_Client_Load_Interactive_Seat_Map', () => {
    const seatsRes = http.get(`${apiBase}/events/sessions/${sessionId}/seats`, {
      headers: publicHeaders,
      tags: { step: '03_seat_map_load' },
    });
    clientSeatMapLoadMs.add(seatsRes.timings.duration);
    unexpectedServerErrorRate.add(seatsRes.status >= 500 || seatsRes.status === 0);

    check(seatsRes, {
      'Seat Map status is 200': (r) => r.status === 200,
    });
  });

  // If queued in Virtual Waiting Room, poll queue status
  if (!isAdmittedToBook && queueSessionId) {
    group('04_Client_Poll_Waiting_Room_Status', () => {
      const pollRes = http.get(
        `${apiBase}/events/${eventId}/queue/status?sessionId=${encodeURIComponent(queueSessionId)}`,
        { headers: publicHeaders, tags: { step: '04_queue_poll' } }
      );
      unexpectedServerErrorRate.add(pollRes.status >= 500 || pollRes.status === 0);
    });
    clientE2EBookingMs.add(Date.now() - flowStart);
    sleep(0.2);
    return;
  }

  group('04_Client_Check_Ticket_Availability', () => {
    const checkRes = http.post(
      `${apiBase}/events/availability/check`,
      JSON.stringify({
        event_id: eventId,
        items: bookingItems,
      }),
      { headers: authHeaders, tags: { step: '04_availability_check' } }
    );
    clientAvailabilityCheckMs.add(checkRes.timings.duration);
    unexpectedServerErrorRate.add(checkRes.status >= 500 || checkRes.status === 0);

    check(checkRes, {
      'Availability check status is 200': (r) => r.status === 200,
    });
  });

  let holdSucceeded = false;

  group('05_Client_Hold_Seat_Atomic_Lock', () => {
    const holdRes = http.post(
      `${apiBase}/events/availability/hold`,
      JSON.stringify({
        event_id: eventId,
        items: bookingItems,
      }),
      { headers: authHeaders, tags: { step: '05_hold_seat' } }
    );
    clientSeatHoldMs.add(holdRes.timings.duration);
    unexpectedServerErrorRate.add(holdRes.status >= 500 || holdRes.status === 0);

    if (holdRes.status === 200) {
      holdSucceeded = true;
      seatHoldSuccessCounter.add(1);
    } else if (holdRes.status === 400 || holdRes.status === 409) {
      seatContentionCounter.add(1);
    }

    check(holdRes, {
      'Hold Seat handled cleanly (200 Held or 400/409 Contention or 403 Queue)': (r) =>
        [200, 400, 403, 409].includes(r.status),
    });
  });

  // Step 6: Order Checkout (Sampled or All)
  const shouldCheckout =
    ENABLE_CHECKOUT === 'all' || (ENABLE_CHECKOUT === 'sample' && vuId <= 20 && iter === 0);

  if (holdSucceeded && shouldCheckout) {
    group('06_Client_Submit_Booking_Checkout', () => {
      const idempotencyKey = `k6-${vuId}-${iter}-${Date.now()}`;
      const checkoutHeaders = Object.assign({}, authHeaders, {
        'Idempotency-Key': idempotencyKey,
      });

      const checkoutRes = http.post(
        `${apiBase}/orders/checkout`,
        JSON.stringify({
          idempotency_key: idempotencyKey,
          event_id: eventId,
          buyer_name: `K6 Client ${vuId}`,
          buyer_email: `perf.vu.${vuId}@eventhub.test`,
          buyer_phone: `09${String(10000000 + (vuId % 89999999)).slice(0, 8)}`,
          event_terms_accepted: true,
          attendees: [
            {
              ticket_type_id: targetTicketTypeId,
              session_seat_id: chosenSeat ? chosenSeat.session_seat_id : null,
              name: `K6 Attendee ${vuId}`,
              email: `perf.vu.${vuId}@eventhub.test`,
            },
          ],
          items: bookingItems,
        }),
        { headers: checkoutHeaders, tags: { step: '06_order_checkout' } }
      );

      clientOrderCheckoutMs.add(checkoutRes.timings.duration);
      if (checkoutRes.status === 201 || checkoutRes.status === 200) {
        orderCheckoutSuccessCounter.add(1);
      }
      unexpectedServerErrorRate.add(checkoutRes.status >= 500 && checkoutRes.status !== 502);
    });
  }

  clientE2EBookingMs.add(Date.now() - flowStart);
  sleep(0.2);
}

export function handleSummary(data) {
  return {
    'k6-booking-summary.json': JSON.stringify(data, null, 2),
  };
}
