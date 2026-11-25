const db = require('../../infrastructure/database/db.client');
const logger = require('../../core/logger');
const { logSecurityEvent, SecurityActions } = require('../../core/security/securityLogger');

const ADVISORY_LOCK_ID = 7421893; // Unique 32-bit ID for ticket hold expiration worker
const SWEEP_INTERVAL_MS = 15000; // 15 seconds

let sweepTimer = null;
let isSweeping = false;

/**
 * Idempotent expiration sweep safe across multiple backend server instances
 */
async function runExpirationSweep() {
  if (isSweeping) return;
  isSweeping = true;

  let client = null;
  let lockAcquired = false;

  try {
    client = await db.getClient();

    // 1. Acquire advisory lock (non-blocking) so only ONE backend server runs the sweep at any moment
    const lockResult = await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [ADVISORY_LOCK_ID]);
    lockAcquired = Boolean(lockResult.rows[0]?.acquired);

    if (!lockAcquired) {
      // Another server instance is currently executing the sweep
      return;
    }

    await client.query('BEGIN');

    // 2. Expire active hold sessions whose expires_at <= NOW()
    const expiredSessionsRes = await client.query(
      `
      UPDATE ticket_hold_sessions
      SET status = 'EXPIRED', updated_at = NOW()
      WHERE status = 'ACTIVE'
        AND expires_at <= NOW()
      RETURNING id, user_id, event_id
      `,
    );

    const expiredSessionIds = expiredSessionsRes.rows.map((r) => r.id);

    // 3. Expire standalone ticket_holds and release seats
    const expiredHoldsRes = await client.query(
      `
      WITH target_holds AS (
        UPDATE ticket_holds
        SET status = 'EXPIRED', updated_at = NOW()
        WHERE (status = 'ACTIVE' AND order_id IS NULL AND expires_at <= NOW())
           OR (hold_id = ANY($1::uuid[]) AND status = 'ACTIVE')
        RETURNING id, session_seat_id, user_id, event_id
      ),
      freed_seats AS (
        UPDATE session_seats ss
        SET status = 'AVAILABLE',
            held_by = NULL,
            held_until = NULL,
            order_id = NULL
        WHERE (
          ss.id IN (SELECT session_seat_id FROM target_holds WHERE session_seat_id IS NOT NULL)
          OR (ss.status = 'HELD' AND ss.order_id IS NULL AND ss.held_until <= NOW())
        )
        AND ss.status = 'HELD'
        AND ss.order_id IS NULL
        RETURNING ss.id
      )
      SELECT th.id, th.user_id, th.event_id, th.session_seat_id
      FROM target_holds th
      `,
      [expiredSessionIds],
    );

    // 4. Expire PENDING orders that exceeded expired_at
    const expiredOrdersRes = await client.query(
      `
      WITH expired_orders AS (
        UPDATE orders
        SET status = 'EXPIRED', updated_at = NOW()
        WHERE status = 'PENDING'
          AND expired_at <= NOW()
        RETURNING id
      ),
      freed_order_seats AS (
        UPDATE session_seats ss
        SET status = 'AVAILABLE',
            held_by = NULL,
            held_until = NULL,
            order_id = NULL
        FROM expired_orders eo
        WHERE ss.order_id = eo.id
          AND ss.status = 'HELD'
        RETURNING ss.id
      ),
      expired_order_holds AS (
        UPDATE ticket_holds th
        SET status = 'EXPIRED', updated_at = NOW()
        FROM expired_orders eo
        WHERE th.order_id = eo.id
          AND th.status = 'ACTIVE'
        RETURNING th.id
      )
      UPDATE ticket_hold_sessions ths
      SET status = 'EXPIRED', updated_at = NOW()
      FROM expired_orders eo
      WHERE ths.order_id = eo.id
        AND ths.status = 'ACTIVE'
      RETURNING ths.id
      `,
    );

    await client.query('COMMIT');

    const totalExpiredHolds = expiredHoldsRes.rows.length;
    const totalExpiredSessions = expiredSessionsRes.rows.length;
    const totalExpiredOrders = expiredOrdersRes.rows.length;

    if (totalExpiredSessions > 0 || totalExpiredHolds > 0 || totalExpiredOrders > 0) {
      logger.info(
        `[TicketHoldExpirationWorker] Swept expired items: sessions=${totalExpiredSessions}, holds=${totalExpiredHolds}, orders=${totalExpiredOrders}`,
      );

      for (const row of expiredSessionsRes.rows) {
        logSecurityEvent({
          userId: row.user_id,
          eventId: row.event_id,
          action: SecurityActions.EXPIRE_HOLD,
          details: { sessionId: row.id, reason: 'AUTOMATIC_BACKGROUND_EXPIRATION' },
        }).catch(() => {});
      }
    }
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (_) {}
    }
    logger.error('[TicketHoldExpirationWorker] Error during expiration sweep:', error);
  } finally {
    if (client) {
      let unlockSucceeded = false;
      if (lockAcquired) {
        try {
          await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_ID]);
          unlockSucceeded = true;
        } catch (unlockErr) {
          logger.error('[TicketHoldExpirationWorker] Failed to release advisory lock cleanly:', unlockErr);
        }
      }
      // If lock was acquired but explicit unlock failed, destroy the connection on release
      // so PostgreSQL immediately releases all session-level advisory locks
      client.release(lockAcquired && !unlockSucceeded ? true : undefined);
    }
    isSweeping = false;
  }
}

function startTicketHoldExpirationWorker() {
  if (sweepTimer) return;
  logger.info('[TicketHoldExpirationWorker] Starting periodic worker (interval: 15s, advisory-lock protected)...');
  // Run first sweep immediately on boot
  runExpirationSweep().catch((err) => logger.error('[TicketHoldExpirationWorker] Initial sweep error:', err));
  sweepTimer = setInterval(runExpirationSweep, SWEEP_INTERVAL_MS);
}

function stopTicketHoldExpirationWorker() {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
    logger.info('[TicketHoldExpirationWorker] Stopped periodic worker.');
  }
}

module.exports = {
  startTicketHoldExpirationWorker,
  stopTicketHoldExpirationWorker,
  runExpirationSweep,
  ADVISORY_LOCK_ID,
};
