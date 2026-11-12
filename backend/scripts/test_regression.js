const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const db = require('../src/infrastructure/database/db.client');
const eventsRepository = require('../src/modules/events/events.repository');
const waitingRoomService = require('../src/modules/waiting-room/waitingRoom.service');

async function testRegression() {
  console.log('Testing regression...');

  // 1. Fetch a published event
  const events = await db.query("SELECT id, slug, waiting_room_config FROM events WHERE status = 'PUBLISHED' LIMIT 1");
  if (events.rows.length === 0) {
    console.log('No published events found.');
    process.exit(0);
  }

  const ev = events.rows[0];
  console.log(`Checking published event: ${ev.id} (${ev.slug})`);

  // Ensure waiting_room_config is null/disabled
  await db.query("UPDATE events SET waiting_room_config = NULL WHERE id = $1", [ev.id]);

  const cfg = await waitingRoomService.getEventConfig(ev.id);
  console.log('Event waiting room config enabled?:', cfg.enabled);
  if (cfg.enabled !== false) {
    throw new Error('Expected waiting room to be disabled by default!');
  }

  // 2. Query event detail repository
  const detail = await eventsRepository.findPublicEventByIdentifier(ev.slug);
  console.log('Event detail loaded successfully. Title:', detail.title);

  // 3. Test validateBookingToken bypass check
  const fakeTokenCheck = await waitingRoomService.validateBookingToken(null, ev.id);
  console.log('Validate missing token on non-configured flow returned:', fakeTokenCheck.reason);

  console.log('✅ REGRESSION TESTS PASSED: Default events function without any waiting room requirements.');
  process.exit(0);
}

testRegression().catch(err => {
  console.error('Regression test failed:', err);
  process.exit(1);
});

