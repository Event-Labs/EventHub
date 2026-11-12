const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { client: redis, connectRedis } = require('../src/infrastructure/redis/redis.client');
const waitingRoomService = require('../src/modules/waiting-room/waitingRoom.service');
const admissionWorker = require('../src/modules/waiting-room/waitingRoom.worker');
const WAITING_ROOM_CONSTANTS = require('../src/modules/waiting-room/waitingRoom.constants');

const { KEYS, STATES } = WAITING_ROOM_CONSTANTS;

async function runBenchmark() {
  console.log('====================================================');
  console.log(' VIRTUAL WAITING ROOM HIGH CONCURRENCY BENCHMARK');
  console.log('====================================================\n');

  await connectRedis();

  const testEventId = '11111111-2222-4333-8444-555555555555';
  const MAX_ACTIVE = 50;
  const TOTAL_USERS = 500; // 500 concurrent virtual users
  const BATCH_SIZE = 10;

  // Setup test event in Redis
  await redis.del(KEYS.QUEUE(testEventId));
  await redis.del(KEYS.ACTIVE(testEventId));
  await redis.del(KEYS.ACTIVE_EXPIRY(testEventId));
  await redis.del(KEYS.META(testEventId));

  await redis.hSet(KEYS.META(testEventId), {
    initialized: '1',
    enabled: '1',
    max_active: String(MAX_ACTIVE),
    session_duration_seconds: '600',
    poll_interval_ms: '1000',
    admission_batch_size: String(BATCH_SIZE),
    is_paused: '0',
    sold_out: '0',
    title: 'BIGBANG 2026 WORLD TOUR IN HANOI',
  });
  await redis.sAdd(KEYS.ACTIVE_EVENTS_SET, testEventId);

  console.log(`[Config] MAX_ACTIVE Capacity: ${MAX_ACTIVE}`);
  console.log(`[Config] Total Virtual Users: ${TOTAL_USERS}`);
  console.log(`[Config] Worker Admission Batch Size: ${BATCH_SIZE}\n`);

  console.log(`🚀 [Phase 1] Simulating ${TOTAL_USERS} users rushing into Waiting Room concurrently...`);

  const startTime = Date.now();
  const latencies = [];
  let errorCount = 0;

  const joinPromises = [];
  for (let i = 0; i < TOTAL_USERS; i++) {
    const userIndex = i;
    joinPromises.push(
      (async () => {
        const reqStart = Date.now();
        try {
          const res = await waitingRoomService.joinQueue({
            eventId: testEventId,
            userId: `vu-${userIndex}`,
            existingSessionId: null,
          });
          const reqDuration = Date.now() - reqStart;
          latencies.push(reqDuration);
          return res;
        } catch (err) {
          errorCount++;
          return null;
        }
      })()
    );
  }

  const results = await Promise.all(joinPromises);
  const totalDuration = Date.now() - startTime;

  const activeCount = results.filter((r) => r && r.status === STATES.ACTIVE).length;
  const queuedCount = results.filter((r) => r && r.status === STATES.WAITING).length;

  latencies.sort((a, b) => a - b);
  const avgLatency = (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2);
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;
  const rps = ((TOTAL_USERS / totalDuration) * 1000).toFixed(2);

  console.log('\n📊 --- BENCHMARK RESULTS: QUEUE ADMISSION RUSH ---');
  console.log(`Total Requests:         ${TOTAL_USERS}`);
  console.log(`Total Time Taken:       ${totalDuration} ms`);
  console.log(`Throughput:             ${rps} requests/second`);
  console.log(`Average Latency:        ${avgLatency} ms`);
  console.log(`p95 Latency:            ${p95} ms`);
  console.log(`p99 Latency:            ${p99} ms`);
  console.log(`Error Rate:             ${((errorCount / TOTAL_USERS) * 100).toFixed(2)}% (${errorCount}/${TOTAL_USERS})`);
  console.log(`Directly Admitted:      ${activeCount} (Expected: exactly ${MAX_ACTIVE})`);
  console.log(`Placed in FIFO Queue:   ${queuedCount} (Expected: exactly ${TOTAL_USERS - MAX_ACTIVE})`);

  // Verify Redis internal counts
  const redisActiveCount = await redis.hLen(KEYS.ACTIVE(testEventId));
  const redisQueueLength = await redis.zCard(KEYS.QUEUE(testEventId));
  console.log(`Redis Active Set:       ${redisActiveCount}`);
  console.log(`Redis Queue ZSet:       ${redisQueueLength}`);

  const capacityBreached = redisActiveCount > MAX_ACTIVE;
  console.log(`Capacity Invariant OK:  ${!capacityBreached ? '✅ PASSED (No Oversubscription)' : '❌ FAILED'}`);

  console.log('\n🚀 [Phase 2] Simulating Admission Worker Ticks as Active users finish checkout...');
  let admittedViaWorker = 0;

  // Release 20 active slots
  const activeKeys = await redis.hKeys(KEYS.ACTIVE(testEventId));
  const slotsToRelease = activeKeys.slice(0, 20);
  for (const sid of slotsToRelease) {
    await waitingRoomService.releaseActiveSlot({ eventId: testEventId, sessionId: sid });
  }

  // Trigger worker admission
  await admissionWorker.processEventAdmission(testEventId);
  const newActiveAfterTick1 = await redis.hLen(KEYS.ACTIVE(testEventId));
  const newQueueAfterTick1 = await redis.zCard(KEYS.QUEUE(testEventId));

  console.log(`After releasing 20 slots and Worker Tick:`);
  console.log(`  Active Sessions:      ${newActiveAfterTick1} / ${MAX_ACTIVE}`);
  console.log(`  Remaining in Queue:   ${newQueueAfterTick1}`);
  console.log(`Worker Admission OK:    ${newActiveAfterTick1 <= MAX_ACTIVE ? '✅ PASSED' : '❌ FAILED'}`);

  // Clean up
  await redis.del(KEYS.QUEUE(testEventId));
  await redis.del(KEYS.ACTIVE(testEventId));
  await redis.del(KEYS.ACTIVE_EXPIRY(testEventId));
  await redis.del(KEYS.META(testEventId));
  await redis.sRem(KEYS.ACTIVE_EVENTS_SET, testEventId);

  console.log('\n====================================================');
  console.log(' BENCHMARK COMPLETED SUCCESSFULLY');
  console.log('====================================================');

  process.exit(0);
}

runBenchmark().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});

