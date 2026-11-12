const crypto = require('crypto');
const { client: redis } = require('../../infrastructure/redis/redis.client');
const logger = require('../../core/logger');
const waitingRoomService = require('./waitingRoom.service');
const WAITING_ROOM_CONSTANTS = require('./waitingRoom.constants');
const LUA_SCRIPTS = require('./waitingRoom.lua');

const { STATES, KEYS, DEFAULTS } = WAITING_ROOM_CONSTANTS;

class AdmissionWorker {
  constructor() {
    this.intervalId = null;
    this.isRunning = false;
    this.tickIntervalMs = 1500; // Tick every 1.5s
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info('[AdmissionWorker] Started Virtual Waiting Room Admission Worker.');

    this.intervalId = setInterval(async () => {
      try {
        await this.processActiveQueues();
      } catch (err) {
        logger.error('[AdmissionWorker] Error in worker tick:', err);
      }
    }, this.tickIntervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    logger.info('[AdmissionWorker] Stopped Admission Worker.');
  }

  async processActiveQueues() {
    if (!redis.isOpen) return;

    // Get all events currently active in waiting room
    const eventIds = await redis.sMembers(KEYS.ACTIVE_EVENTS_SET);
    if (!eventIds || eventIds.length === 0) return;

    for (const eventId of eventIds) {
      try {
        await this.processEventAdmission(eventId);
      } catch (err) {
        logger.error(`[AdmissionWorker] Error processing admissions for event ${eventId}:`, err);
      }
    }
  }

  async processEventAdmission(eventId) {
    const config = await waitingRoomService.getEventConfig(eventId);
    if (!config.enabled || config.is_paused || config.sold_out) {
      return;
    }

    const nowMs = Date.now();
    const durationMs = config.session_duration_seconds * 1000;

    // Run atomic batch admission lua script
    const result = await redis.eval(LUA_SCRIPTS.ADMIT_BATCH, {
      keys: [
        KEYS.QUEUE(eventId),
        KEYS.ACTIVE(eventId),
        KEYS.ACTIVE_EXPIRY(eventId),
        KEYS.META(eventId),
      ],
      arguments: [
        String(nowMs),
        String(config.max_active),
        String(config.admission_batch_size),
        String(durationMs),
      ],
    });

    const [admittedCount, currentActive, admittedSessionIds, expiresAtMs] = result;

    if (admittedCount > 0 && Array.isArray(admittedSessionIds)) {
      logger.info(
        `[AdmissionWorker] Admitted ${admittedCount} users for event ${eventId}. Active: ${currentActive}/${config.max_active}`
      );

      const expMs = Number(expiresAtMs);
      const expiresAtIso = new Date(expMs).toISOString();

      for (const sessionId of admittedSessionIds) {
        try {
          // Generate secure booking token
          const bookingToken = crypto.randomBytes(32).toString('hex');
          const tokenHash = waitingRoomService.hashToken(bookingToken);

          // Get session info to preserve user_id
          const sessionKey = KEYS.SESSION(eventId, sessionId);
          const rawSession = await redis.get(sessionKey);
          let userId = null;
          if (rawSession) {
            try {
              const parsed = JSON.parse(rawSession);
              userId = parsed.user_id;
            } catch (_) {}
          }

          // Save token lookup key
          const tokenKey = KEYS.TOKEN(tokenHash);
          const tokenPayload = {
            session_id: sessionId,
            event_id: eventId,
            user_id: userId,
            expires_at_ms: expMs,
          };
          await redis.set(tokenKey, JSON.stringify(tokenPayload), {
            EX: config.session_duration_seconds,
          });

          // Update session data to ACTIVE
          const sessionData = {
            session_id: sessionId,
            event_id: eventId,
            user_id: userId,
            state: STATES.ACTIVE,
            booking_token: bookingToken,
            booking_token_hash: tokenHash,
            admitted_at: new Date(nowMs).toISOString(),
            expires_at_ms: expMs,
            expires_at: expiresAtIso,
          };
          await redis.set(sessionKey, JSON.stringify(sessionData), {
            EX: DEFAULTS.SESSION_KEY_TTL_SEC,
          });

          // Notify SSE subscriber if any
          waitingRoomService.broadcastSSE(eventId, sessionId, 'ADMITTED', {
            status: STATES.ACTIVE,
            session_id: sessionId,
            booking_token: bookingToken,
            expires_at: expiresAtIso,
            remaining_seconds: config.session_duration_seconds,
          });
        } catch (subErr) {
          logger.error(`[AdmissionWorker] Failed to finalize admission for session ${sessionId}:`, subErr);
        }
      }
    }
  }
}

module.exports = new AdmissionWorker();

