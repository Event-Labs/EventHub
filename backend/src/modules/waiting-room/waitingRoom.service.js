const crypto = require('crypto');
const { client: redis } = require('../../infrastructure/redis/redis.client');
const db = require('../../infrastructure/database/db.client');
const logger = require('../../core/logger');
const AppError = require('../../core/errors/AppError');
const WAITING_ROOM_CONSTANTS = { ...require('./waitingRoom.constants') };
const LUA_SCRIPTS = require('./waitingRoom.lua');

const { STATES, KEYS, DEFAULTS } = WAITING_ROOM_CONSTANTS;

class WaitingRoomService {
  constructor() {
    this.sseClients = new Map(); // Map<eventId, Map<sessionId, Response>>
  }

  /**
   * Compute SHA-256 hash of a token
   */
  hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Get Event details and Waiting Room configuration
   */
  async getEventConfig(eventId) {
    if (!eventId) {
      throw new AppError('Event ID is required', 400);
    }

    // Try reading cache in Redis meta first
    const metaKey = KEYS.META(eventId);
    if (redis.isOpen) {
      const cached = await redis.hGetAll(metaKey);
      if (cached && cached.initialized === '1') {
        return {
          enabled: cached.enabled === '1' || cached.enabled === 'true',
          max_active: parseInt(cached.max_active || DEFAULTS.MAX_ACTIVE, 10),
          session_duration_seconds: parseInt(cached.session_duration_seconds || DEFAULTS.SESSION_DURATION_SEC, 10),
          poll_interval_ms: parseInt(cached.poll_interval_ms || DEFAULTS.POLL_INTERVAL_MS, 10),
          admission_batch_size: parseInt(cached.admission_batch_size || DEFAULTS.ADMISSION_BATCH_SIZE, 10),
          is_paused: cached.is_paused === '1' || cached.is_paused === 'true',
          sold_out: cached.sold_out === '1' || cached.sold_out === 'true',
          title: cached.title || '',
          banner_url: cached.banner_url || '',
          thumbnail_url: cached.thumbnail_url || '',
        };
      }
    }

    // Fallback to PostgreSQL
    const res = await db.query(
      `SELECT id, title, slug, banner_url, thumbnail_url, status, sales_status, waiting_room_config, start_time, end_time
       FROM events
       WHERE id = $1 AND deleted_at IS NULL
       LIMIT 1`,
      [eventId]
    );

    if (res.rows.length === 0) {
      throw new AppError('Sự kiện không tồn tại', 404);
    }

    const event = res.rows[0];
    const cfg = event.waiting_room_config || {};

    const resolvedConfig = {
      enabled: Boolean(cfg.enabled),
      max_active: Number(cfg.max_active) || DEFAULTS.MAX_ACTIVE,
      session_duration_seconds: Number(cfg.session_duration_seconds) || DEFAULTS.SESSION_DURATION_SEC,
      poll_interval_ms: Number(cfg.poll_interval_ms) || DEFAULTS.POLL_INTERVAL_MS,
      admission_batch_size: Number(cfg.admission_batch_size) || DEFAULTS.ADMISSION_BATCH_SIZE,
      is_paused: Boolean(cfg.is_paused),
      sold_out: Boolean(cfg.sold_out || event.sales_status === 'SOLD_OUT'),
      title: event.title,
      banner_url: event.banner_url,
      thumbnail_url: event.thumbnail_url,
      status: event.status,
      sales_status: event.sales_status,
      start_time: event.start_time,
      end_time: event.end_time,
    };

    // Cache in Redis meta
    if (redis.isOpen) {
      await redis.hSet(metaKey, {
        initialized: '1',
        enabled: resolvedConfig.enabled ? '1' : '0',
        max_active: String(resolvedConfig.max_active),
        session_duration_seconds: String(resolvedConfig.session_duration_seconds),
        poll_interval_ms: String(resolvedConfig.poll_interval_ms),
        admission_batch_size: String(resolvedConfig.admission_batch_size),
        is_paused: resolvedConfig.is_paused ? '1' : '0',
        sold_out: resolvedConfig.sold_out ? '1' : '0',
        title: resolvedConfig.title || '',
        banner_url: resolvedConfig.banner_url || '',
        thumbnail_url: resolvedConfig.thumbnail_url || '',
      });

      if (resolvedConfig.enabled) {
        await redis.sAdd(KEYS.ACTIVE_EVENTS_SET, eventId);
      } else {
        await redis.sRem(KEYS.ACTIVE_EVENTS_SET, eventId);
      }
    }

    return resolvedConfig;
  }

  /**
   * Join Waiting Room or get immediate Admission
   */
  async joinQueue({ eventId, userId, existingSessionId, ip, userAgent }) {
    const config = await this.getEventConfig(eventId);

    // If waiting room is not enabled, signal frontend to proceed directly
    if (!config.enabled) {
      return {
        enabled: false,
        status: 'DIRECT_ACCESS',
        message: 'Virtual Waiting Room is disabled for this event.',
      };
    }

    if (config.sold_out) {
      return {
        enabled: true,
        status: STATES.SOLD_OUT,
        message: 'Sự kiện đã bán hết vé.',
        event: {
          title: config.title,
          banner_url: config.banner_url,
          thumbnail_url: config.thumbnail_url,
        },
      };
    }

    if (config.is_paused) {
      return {
        enabled: true,
        status: 'PAUSED',
        message: 'Phòng chờ tạm thời tạm dừng nhận lượt mới. Vui lòng thử lại sau giây lát.',
      };
    }

    if (!redis.isOpen) {
      logger.error('[WaitingRoom] Redis is down during joinQueue. Failing closed for safety.');
      throw new AppError('Hệ thống phòng chờ đang bận, vui lòng thử lại sau ít phút.', 503);
    }

    const nowMs = Date.now();
    const durationMs = config.session_duration_seconds * 1000;

    // 1. Session Recovery: If client supplied an existing session, check it first
    if (existingSessionId) {
      const sessionKey = KEYS.SESSION(eventId, existingSessionId);
      const rawSession = await redis.get(sessionKey);
      if (rawSession) {
        try {
          const session = JSON.parse(rawSession);
          if (session.state === STATES.ACTIVE) {
            const exp = Number(session.expires_at_ms || 0);
            if (exp > nowMs) {
              return {
                enabled: true,
                status: STATES.ACTIVE,
                session_id: existingSessionId,
                booking_token: session.booking_token,
                expires_at: new Date(exp).toISOString(),
                remaining_seconds: Math.max(0, Math.floor((exp - nowMs) / 1000)),
                event: {
                  title: config.title,
                  banner_url: config.banner_url,
                  thumbnail_url: config.thumbnail_url,
                },
              };
            }
          } else if (session.state === STATES.WAITING) {
            const rank = await redis.zRank(KEYS.QUEUE(eventId), existingSessionId);
            if (rank !== null && rank !== undefined) {
              const totalWaiting = await redis.zCard(KEYS.QUEUE(eventId));
              return {
                enabled: true,
                status: STATES.WAITING,
                session_id: existingSessionId,
                position: rank, // 0-based rank is number of people ahead!
                total_waiting: totalWaiting,
                is_near_turn: rank < DEFAULTS.NEAR_TURN_THRESHOLD,
                poll_interval_ms: config.poll_interval_ms,
                estimated_wait_seconds: Math.ceil((rank + 1) * 3),
                event: {
                  title: config.title,
                  banner_url: config.banner_url,
                  thumbnail_url: config.thumbnail_url,
                },
              };
            }
          }
        } catch (e) {
          logger.warn(`[WaitingRoom] Corrupted session JSON for ${existingSessionId}`, e);
        }
      }
    }

    // 2. Create a new Session ID
    const sessionId = crypto.randomUUID();
    const sessionKey = KEYS.SESSION(eventId, sessionId);

    // 3. Execute atomic join or admit script
    const result = await redis.eval(
      LUA_SCRIPTS.JOIN_OR_ADMIT,
      {
        keys: [
          KEYS.QUEUE(eventId),
          KEYS.ACTIVE(eventId),
          KEYS.ACTIVE_EXPIRY(eventId),
          KEYS.META(eventId),
        ],
        arguments: [
          sessionId,
          String(nowMs),
          String(config.max_active),
          String(durationMs),
        ],
      }
    );

    const [status, position, activeCount, queueLength, expiresAtMs] = result;

    if (status === 'ADMITTED') {
      // Generate secure booking token
      const bookingToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = this.hashToken(bookingToken);
      const expMs = Number(expiresAtMs);

      // Save token lookup key in Redis
      const tokenKey = KEYS.TOKEN(tokenHash);
      const tokenPayload = {
        session_id: sessionId,
        event_id: eventId,
        user_id: userId || null,
        expires_at_ms: expMs,
      };
      await redis.set(tokenKey, JSON.stringify(tokenPayload), {
        EX: config.session_duration_seconds,
      });

      // Save session details
      const sessionData = {
        session_id: sessionId,
        event_id: eventId,
        user_id: userId || null,
        state: STATES.ACTIVE,
        booking_token: bookingToken,
        booking_token_hash: tokenHash,
        joined_at: new Date(nowMs).toISOString(),
        admitted_at: new Date(nowMs).toISOString(),
        expires_at_ms: expMs,
        expires_at: new Date(expMs).toISOString(),
        ip: ip || null,
      };
      await redis.set(sessionKey, JSON.stringify(sessionData), {
        EX: DEFAULTS.SESSION_KEY_TTL_SEC,
      });

      return {
        enabled: true,
        status: STATES.ACTIVE,
        session_id: sessionId,
        booking_token: bookingToken,
        expires_at: new Date(expMs).toISOString(),
        remaining_seconds: config.session_duration_seconds,
        event: {
          title: config.title,
          banner_url: config.banner_url,
          thumbnail_url: config.thumbnail_url,
        },
      };
    }

    if (status === 'QUEUED') {
      const rank = Number(position);
      const sessionData = {
        session_id: sessionId,
        event_id: eventId,
        user_id: userId || null,
        state: STATES.WAITING,
        joined_at: new Date(nowMs).toISOString(),
        ip: ip || null,
      };
      await redis.set(sessionKey, JSON.stringify(sessionData), {
        EX: DEFAULTS.SESSION_KEY_TTL_SEC,
      });

      return {
        enabled: true,
        status: STATES.WAITING,
        session_id: sessionId,
        position: rank,
        total_waiting: Number(queueLength),
        is_near_turn: rank < DEFAULTS.NEAR_TURN_THRESHOLD,
        poll_interval_ms: config.poll_interval_ms,
        estimated_wait_seconds: Math.ceil((rank + 1) * 3),
        event: {
          title: config.title,
          banner_url: config.banner_url,
          thumbnail_url: config.thumbnail_url,
        },
      };
    }

    if (status === 'SOLD_OUT') {
      return {
        enabled: true,
        status: STATES.SOLD_OUT,
        message: 'Sự kiện đã bán hết vé.',
        event: {
          title: config.title,
          banner_url: config.banner_url,
          thumbnail_url: config.thumbnail_url,
        },
      };
    }

    return {
      enabled: true,
      status: 'PAUSED',
      message: 'Hàng đợi đang tạm dừng phục vụ.',
    };
  }

  /**
   * Check status of a waiting room session (called by client polling or reconnect)
   */
  async getQueueStatus({ eventId, sessionId }) {
    if (!sessionId) {
      throw new AppError('Session ID is required', 400);
    }

    const config = await this.getEventConfig(eventId);
    if (!config.enabled) {
      return {
        enabled: false,
        status: 'DIRECT_ACCESS',
      };
    }

    if (!redis.isOpen) {
      throw new AppError('Hệ thống đang bận, vui lòng thử lại.', 503);
    }

    const sessionKey = KEYS.SESSION(eventId, sessionId);
    const rawSession = await redis.get(sessionKey);
    if (!rawSession) {
      return {
        enabled: true,
        status: STATES.EXPIRED,
        message: 'Phiên chờ của bạn đã hết hạn hoặc không tồn tại.',
      };
    }

    const session = JSON.parse(rawSession);
    const nowMs = Date.now();

    // If session is already ACTIVE
    if (session.state === STATES.ACTIVE) {
      const expMs = Number(session.expires_at_ms || 0);
      if (expMs <= nowMs) {
        // Expired
        session.state = STATES.EXPIRED;
        await redis.set(sessionKey, JSON.stringify(session), { EX: 3600 });
        return {
          enabled: true,
          status: STATES.EXPIRED,
          message: 'Thời gian đặt vé của bạn đã hết.',
        };
      }

      return {
        enabled: true,
        status: STATES.ACTIVE,
        session_id: sessionId,
        booking_token: session.booking_token,
        expires_at: new Date(expMs).toISOString(),
        remaining_seconds: Math.max(0, Math.floor((expMs - nowMs) / 1000)),
        event: {
          title: config.title,
          banner_url: config.banner_url,
          thumbnail_url: config.thumbnail_url,
        },
      };
    }

    // If session was WAITING, check current rank in ZSET
    const rank = await redis.zRank(KEYS.QUEUE(eventId), sessionId);
    if (rank === null || rank === undefined) {
      // Check if session was admitted just now by worker
      const isActiveInMap = await redis.hGet(KEYS.ACTIVE(eventId), sessionId);
      if (isActiveInMap) {
        // Reload session data
        const updatedRaw = await redis.get(sessionKey);
        if (updatedRaw) {
          const updated = JSON.parse(updatedRaw);
          if (updated.state === STATES.ACTIVE) {
            const expMs = Number(updated.expires_at_ms || 0);
            return {
              enabled: true,
              status: STATES.ACTIVE,
              session_id: sessionId,
              booking_token: updated.booking_token,
              expires_at: new Date(expMs).toISOString(),
              remaining_seconds: Math.max(0, Math.floor((expMs - nowMs) / 1000)),
              event: {
                title: config.title,
                banner_url: config.banner_url,
                thumbnail_url: config.thumbnail_url,
              },
            };
          }
        }
      }

      // Check if event is sold out
      if (config.sold_out) {
        return {
          enabled: true,
          status: STATES.SOLD_OUT,
          message: 'Sự kiện đã bán hết vé.',
        };
      }

      return {
        enabled: true,
        status: STATES.EXPIRED,
        message: 'Phiên chờ không còn hợp lệ.',
      };
    }

    const totalWaiting = await redis.zCard(KEYS.QUEUE(eventId));

    return {
      enabled: true,
      status: STATES.WAITING,
      session_id: sessionId,
      position: rank,
      total_waiting: totalWaiting,
      is_near_turn: rank < DEFAULTS.NEAR_TURN_THRESHOLD,
      poll_interval_ms: config.poll_interval_ms,
      estimated_wait_seconds: Math.ceil((rank + 1) * 3),
      event: {
        title: config.title,
        banner_url: config.banner_url,
        thumbnail_url: config.thumbnail_url,
      },
    };
  }

  /**
   * Leave Queue voluntarily
   */
  async leaveQueue({ eventId, sessionId }) {
    if (!sessionId || !redis.isOpen) return { success: true };

    const queueKey = KEYS.QUEUE(eventId);
    await redis.zRem(queueKey, sessionId);

    const sessionKey = KEYS.SESSION(eventId, sessionId);
    const raw = await redis.get(sessionKey);
    if (raw) {
      try {
        const s = JSON.parse(raw);
        s.state = STATES.RELEASED;
        await redis.set(sessionKey, JSON.stringify(s), { EX: 3600 });
      } catch (_) {}
    }

    return { success: true, message: 'Đã rời phòng chờ thành công.' };
  }

  /**
   * Release Active Slot (called when checkout completes or cancelled)
   */
  async releaseActiveSlot({ eventId, sessionId, token }) {
    if (!redis.isOpen) return;

    let targetSessionId = sessionId;
    let tokenHash = null;

    if (token) {
      tokenHash = this.hashToken(token);
      const tokenKey = KEYS.TOKEN(tokenHash);
      const raw = await redis.get(tokenKey);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          targetSessionId = targetSessionId || parsed.session_id;
        } catch (_) {}
        await redis.del(tokenKey);
      }
    }

    if (targetSessionId && eventId) {
      await redis.eval(LUA_SCRIPTS.RELEASE_ACTIVE, {
        keys: [KEYS.ACTIVE(eventId), KEYS.ACTIVE_EXPIRY(eventId)],
        arguments: [targetSessionId],
      });

      const sessionKey = KEYS.SESSION(eventId, targetSessionId);
      const raw = await redis.get(sessionKey);
      if (raw) {
        try {
          const s = JSON.parse(raw);
          s.state = STATES.RELEASED;
          await redis.set(sessionKey, JSON.stringify(s), { EX: 3600 });
        } catch (_) {}
      }
    }
  }

  /**
   * Validate a booking token for Protected Booking APIs
   */
  async validateBookingToken(token, eventId, userId) {
    if (!token) return { valid: false, reason: 'MISSING_TOKEN' };
    if (!redis.isOpen) {
      logger.error('[WaitingRoom] Redis down during token validation. Failing closed.');
      return { valid: false, reason: 'SERVICE_UNAVAILABLE' };
    }

    const tokenHash = this.hashToken(token);
    const tokenKey = KEYS.TOKEN(tokenHash);
    const raw = await redis.get(tokenKey);

    if (!raw) {
      return { valid: false, reason: 'TOKEN_NOT_FOUND_OR_EXPIRED' };
    }

    try {
      const payload = JSON.parse(raw);
      if (String(payload.event_id) !== String(eventId)) {
        return { valid: false, reason: 'TOKEN_EVENT_MISMATCH' };
      }

      if (payload.expires_at_ms && payload.expires_at_ms <= Date.now()) {
        return { valid: false, reason: 'TOKEN_EXPIRED' };
      }

      if (userId && payload.user_id && String(payload.user_id) !== String(userId)) {
        return { valid: false, reason: 'TOKEN_USER_MISMATCH' };
      }

      return { valid: true, payload };
    } catch (e) {
      return { valid: false, reason: 'TOKEN_INVALID_PAYLOAD' };
    }
  }

  /**
   * Broadcast SSE Event to connected clients
   */
  broadcastSSE(eventId, sessionId, eventName, data) {
    const eventClients = this.sseClients.get(eventId);
    if (!eventClients) return;

    if (sessionId) {
      const res = eventClients.get(sessionId);
      if (res && !res.writableEnded) {
        res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
      }
    } else {
      // Broadcast to all
      for (const [sid, res] of eventClients.entries()) {
        if (res && !res.writableEnded) {
          res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
        }
      }
    }
  }

  /**
   * Check if event tickets are sold out in Postgres
   */
  async checkSoldOut(eventId) {
    const res = await db.query(
      `SELECT 
        COALESCE(SUM(tt.quantity), 0) AS total_quantity
       FROM ticket_types tt
       JOIN event_sessions es ON es.id = tt.event_session_id
       WHERE es.event_id = $1 AND es.status != 'CANCELLED'`,
      [eventId]
    );

    const totalQty = parseInt(res.rows[0]?.total_quantity || 0, 10);
    if (totalQty === 0) return true;

    // Check sold tickets
    const soldRes = await db.query(
      `SELECT COUNT(*)::int AS sold_count
       FROM tickets t
       JOIN event_sessions es ON es.id = t.event_session_id
       WHERE es.event_id = $1 AND t.status IN ('VALID', 'USED')`,
      [eventId]
    );
    const soldCount = parseInt(soldRes.rows[0]?.sold_count || 0, 10);

    return soldCount >= totalQty;
  }

  /**
   * Update Waiting Room configuration (Admin/Organizer)
   */
  async updateConfig(eventId, payload) {
    const {
      enabled,
      max_active,
      session_duration_seconds,
      poll_interval_ms,
      admission_batch_size,
      is_paused,
      sold_out,
    } = payload;

    const currentRes = await db.query(
      'SELECT waiting_room_config FROM events WHERE id = $1',
      [eventId]
    );
    if (currentRes.rows.length === 0) {
      throw new AppError('Event not found', 404);
    }

    const currentConfig = currentRes.rows[0].waiting_room_config || {};
    const newConfig = {
      ...currentConfig,
      ...(enabled !== undefined ? { enabled: Boolean(enabled) } : {}),
      ...(max_active !== undefined ? { max_active: Math.max(1, Number(max_active)) } : {}),
      ...(session_duration_seconds !== undefined
        ? { session_duration_seconds: Math.max(60, Number(session_duration_seconds)) }
        : {}),
      ...(poll_interval_ms !== undefined ? { poll_interval_ms: Math.max(1000, Number(poll_interval_ms)) } : {}),
      ...(admission_batch_size !== undefined
        ? { admission_batch_size: Math.max(1, Number(admission_batch_size)) }
        : {}),
      ...(is_paused !== undefined ? { is_paused: Boolean(is_paused) } : {}),
      ...(sold_out !== undefined ? { sold_out: Boolean(sold_out) } : {}),
    };

    // Save to Database
    await db.query(
      'UPDATE events SET waiting_room_config = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(newConfig), eventId]
    );

    // Sync to Redis
    if (redis.isOpen) {
      const metaKey = KEYS.META(eventId);
      await redis.hSet(metaKey, {
        initialized: '1',
        enabled: newConfig.enabled ? '1' : '0',
        max_active: String(newConfig.max_active || DEFAULTS.MAX_ACTIVE),
        session_duration_seconds: String(newConfig.session_duration_seconds || DEFAULTS.SESSION_DURATION_SEC),
        poll_interval_ms: String(newConfig.poll_interval_ms || DEFAULTS.POLL_INTERVAL_MS),
        admission_batch_size: String(newConfig.admission_batch_size || DEFAULTS.ADMISSION_BATCH_SIZE),
        is_paused: newConfig.is_paused ? '1' : '0',
        sold_out: newConfig.sold_out ? '1' : '0',
      });

      if (newConfig.enabled) {
        await redis.sAdd(KEYS.ACTIVE_EVENTS_SET, eventId);
      } else {
        await redis.sRem(KEYS.ACTIVE_EVENTS_SET, eventId);
      }
    }

    return newConfig;
  }

  /**
   * Get Live Statistics for Admin Dashboard
   */
  async getAdminStats(eventId) {
    const config = await this.getEventConfig(eventId);
    if (!redis.isOpen) {
      return {
        enabled: config.enabled,
        waiting_count: 0,
        active_count: 0,
        total_admitted: 0,
        is_paused: config.is_paused,
        sold_out: config.sold_out,
        redis_status: 'DISCONNECTED',
      };
    }

    const [waitingCount, activeCount, totalAdmitted] = await Promise.all([
      redis.zCard(KEYS.QUEUE(eventId)),
      redis.hLen(KEYS.ACTIVE(eventId)),
      redis.hGet(KEYS.META(eventId), 'total_admitted').then((v) => parseInt(v || '0', 10)),
    ]);

    return {
      enabled: config.enabled,
      max_active: config.max_active,
      session_duration_seconds: config.session_duration_seconds,
      waiting_count: waitingCount,
      active_count: activeCount,
      available_slots: Math.max(0, config.max_active - activeCount),
      total_admitted: totalAdmitted,
      is_paused: config.is_paused,
      sold_out: config.sold_out,
      redis_status: 'CONNECTED',
    };
  }
}

module.exports = new WaitingRoomService();

