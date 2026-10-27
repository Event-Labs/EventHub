const logger = require('../../core/logger');
const db = require('../../infrastructure/database/db.client');

let interval = null;

async function closePastEvents() {
  try {
    const result = await db.query(`
      UPDATE events
      SET status = 'COMPLETED', sales_status = 'ENDED', updated_at = NOW()
      WHERE status = 'PUBLISHED'
        AND (end_time < NOW() OR (end_time IS NULL AND start_time < NOW() - INTERVAL '4 hours'))
    `);
    if (result.rowCount > 0) {
      logger.info(`[EventLifecycleScheduler] Automatically marked ${result.rowCount} past event(s) as COMPLETED with sales_status ENDED.`);
    }
  } catch (error) {
    logger.error('[EventLifecycleScheduler] Failed to update past events lifecycle:', error);
  }
}

function startEventLifecycleScheduler() {
  if (interval) return;

  // Run immediately on boot
  closePastEvents();

  // Run every 5 minutes
  interval = setInterval(closePastEvents, 5 * 60 * 1000);
}

module.exports = {
  startEventLifecycleScheduler,
  closePastEvents,
};
