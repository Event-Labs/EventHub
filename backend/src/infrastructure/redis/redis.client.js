const { createClient } = require('redis');
const logger = require('../../core/logger');

/**
 * Built-in In-Memory Redis Engine (Fallback when Upstash hits 500k monthly command limit or is offline)
 * Supports Strings, Hashes, Sets, Sorted Sets (ZSET), TTL expiration, multi(), and WaitingRoom Lua scripts.
 */
class InMemoryRedisEngine {
  constructor() {
    this.strings = new Map(); // key -> { value, expiresAt }
    this.hashes = new Map();  // key -> Map(field -> string)
    this.sets = new Map();    // key -> Set(member)
    this.zsets = new Map();   // key -> Map(member -> score)
    this.isOpen = true;
    this.isFallback = true;
  }

  _checkStringExpiry(key) {
    const entry = this.strings.get(key);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      this.strings.delete(key);
      return null;
    }
    return entry;
  }

  async get(key) {
    const entry = this._checkStringExpiry(key);
    return entry ? entry.value : null;
  }

  async set(key, value, options = {}) {
    let expiresAt = null;
    if (options && typeof options === 'object') {
      if (options.NX) {
        const existing = this._checkStringExpiry(key);
        if (existing) return null;
      }
      if (options.EX) expiresAt = Date.now() + Number(options.EX) * 1000;
      else if (options.PX) expiresAt = Date.now() + Number(options.PX);
    }
    this.strings.set(key, { value: String(value), expiresAt });
    return 'OK';
  }

  async setEx(key, ttlSeconds, value) {
    return this.set(key, value, { EX: ttlSeconds });
  }

  async incr(key) {
    const entry = this._checkStringExpiry(key);
    const current = entry ? parseInt(entry.value || '0', 10) : 0;
    const next = current + 1;
    const expiresAt = entry ? entry.expiresAt : null;
    this.strings.set(key, { value: String(next), expiresAt });
    return next;
  }

  async expire(key, ttlSeconds) {
    const entry = this.strings.get(key);
    if (!entry) return 0;
    entry.expiresAt = Date.now() + Number(ttlSeconds) * 1000;
    return 1;
  }

  async ttl(key) {
    const entry = this._checkStringExpiry(key);
    if (!entry) return -2;
    if (!entry.expiresAt) return -1;
    const remaining = Math.floor((entry.expiresAt - Date.now()) / 1000);
    return remaining > 0 ? remaining : -2;
  }

  async del(keyOrKeys) {
    const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
    let count = 0;
    for (const k of keys) {
      const a = this.strings.delete(k);
      const b = this.hashes.delete(k);
      const c = this.sets.delete(k);
      const d = this.zsets.delete(k);
      if (a || b || c || d) count++;
    }
    return count;
  }

  async keys(pattern = '*') {
    const regexStr =
      '^' +
      String(pattern)
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.') +
      '$';
    const regex = new RegExp(regexStr);
    const allKeys = new Set([
      ...this.strings.keys(),
      ...this.hashes.keys(),
      ...this.sets.keys(),
      ...this.zsets.keys(),
    ]);
    const matched = [];
    for (const k of allKeys) {
      if (this.strings.has(k) && !this._checkStringExpiry(k)) continue;
      if (regex.test(k)) matched.push(k);
    }
    return matched;
  }

  // --- HASHES ---
  _getHash(key, create = false) {
    let h = this.hashes.get(key);
    if (!h && create) {
      h = new Map();
      this.hashes.set(key, h);
    }
    return h;
  }

  async hGet(key, field) {
    const h = this._getHash(key);
    if (!h) return null;
    return h.has(field) ? h.get(field) : null;
  }

  async hSet(key, fieldOrObj, value) {
    const h = this._getHash(key, true);
    let added = 0;
    if (fieldOrObj && typeof fieldOrObj === 'object') {
      for (const [k, v] of Object.entries(fieldOrObj)) {
        if (!h.has(k)) added++;
        h.set(k, String(v ?? ''));
      }
    } else {
      const f = String(fieldOrObj);
      if (!h.has(f)) added++;
      h.set(f, String(value ?? ''));
    }
    return added;
  }

  async hGetAll(key) {
    const h = this._getHash(key);
    if (!h) return {};
    return Object.fromEntries(h.entries());
  }

  async hDel(key, field) {
    const h = this._getHash(key);
    if (!h) return 0;
    return h.delete(String(field)) ? 1 : 0;
  }

  async hLen(key) {
    const h = this._getHash(key);
    return h ? h.size : 0;
  }

  async hKeys(key) {
    const h = this._getHash(key);
    return h ? Array.from(h.keys()) : [];
  }

  async hIncrBy(key, field, increment) {
    const h = this._getHash(key, true);
    const current = parseInt(h.get(field) || '0', 10) || 0;
    const next = current + Number(increment);
    h.set(field, String(next));
    return next;
  }

  // --- SETS ---
  _getSet(key, create = false) {
    let s = this.sets.get(key);
    if (!s && create) {
      s = new Set();
      this.sets.set(key, s);
    }
    return s;
  }

  async sAdd(key, memberOrMembers) {
    const s = this._getSet(key, true);
    const items = Array.isArray(memberOrMembers) ? memberOrMembers : [memberOrMembers];
    let added = 0;
    for (const item of items) {
      const str = String(item);
      if (!s.has(str)) {
        s.add(str);
        added++;
      }
    }
    return added;
  }

  async sRem(key, memberOrMembers) {
    const s = this._getSet(key);
    if (!s) return 0;
    const items = Array.isArray(memberOrMembers) ? memberOrMembers : [memberOrMembers];
    let removed = 0;
    for (const item of items) {
      if (s.delete(String(item))) removed++;
    }
    return removed;
  }

  async sMembers(key) {
    const s = this._getSet(key);
    return s ? Array.from(s) : [];
  }

  // --- SORTED SETS (ZSET) ---
  _getZSet(key, create = false) {
    let z = this.zsets.get(key);
    if (!z && create) {
      z = new Map();
      this.zsets.set(key, z);
    }
    return z;
  }

  _sortedZEntries(key) {
    const z = this._getZSet(key);
    if (!z) return [];
    return Array.from(z.entries()).sort((a, b) => {
      if (a[1] !== b[1]) return a[1] - b[1];
      return a[0].localeCompare(b[0]);
    });
  }

  async zAdd(key, scoreOrItem, member) {
    const z = this._getZSet(key, true);
    if (Array.isArray(scoreOrItem)) {
      let added = 0;
      for (const item of scoreOrItem) {
        if (!z.has(String(item.value))) added++;
        z.set(String(item.value), Number(item.score));
      }
      return added;
    }
    if (scoreOrItem && typeof scoreOrItem === 'object') {
      const existed = z.has(String(scoreOrItem.value));
      z.set(String(scoreOrItem.value), Number(scoreOrItem.score));
      return existed ? 0 : 1;
    }
    const existed = z.has(String(member));
    z.set(String(member), Number(scoreOrItem));
    return existed ? 0 : 1;
  }

  async zRem(key, member) {
    const z = this._getZSet(key);
    if (!z) return 0;
    return z.delete(String(member)) ? 1 : 0;
  }

  async zCard(key) {
    const z = this._getZSet(key);
    return z ? z.size : 0;
  }

  async zRank(key, member) {
    const sorted = this._sortedZEntries(key);
    const idx = sorted.findIndex(([m]) => m === String(member));
    return idx >= 0 ? idx : null;
  }

  async zRange(key, start, stop) {
    const sorted = this._sortedZEntries(key);
    const len = sorted.length;
    const s = start < 0 ? Math.max(0, len + start) : start;
    const e = stop < 0 ? len + stop : stop;
    return sorted.slice(s, e + 1).map(([m]) => m);
  }

  async zRangeByScore(key, min, max) {
    const minVal = min === '-inf' ? -Infinity : Number(min);
    const maxVal = max === '+inf' || max === 'inf' ? Infinity : Number(max);
    const sorted = this._sortedZEntries(key);
    return sorted.filter(([, score]) => score >= minVal && score <= maxVal).map(([m]) => m);
  }

  // --- SYNCHRONOUS ATOMIC HELPERS FOR LUA SCRIPT EQUIVALENCE ---
  _hGetSync(key, field) {
    const h = this._getHash(key);
    return h && h.has(field) ? h.get(field) : null;
  }

  _hSetSync(key, field, value) {
    const h = this._getHash(key, true);
    h.set(String(field), String(value ?? ''));
  }

  _hDelSync(key, field) {
    const h = this._getHash(key);
    return h && h.delete(String(field)) ? 1 : 0;
  }

  _hLenSync(key) {
    const h = this._getHash(key);
    return h ? h.size : 0;
  }

  _hIncrBySync(key, field, increment) {
    const h = this._getHash(key, true);
    const current = parseInt(h.get(field) || '0', 10) || 0;
    const next = current + Number(increment);
    h.set(field, String(next));
    return next;
  }

  _zAddSync(key, score, member) {
    const z = this._getZSet(key, true);
    z.set(String(member), Number(score));
  }

  _zRemSync(key, member) {
    const z = this._getZSet(key);
    return z && z.delete(String(member)) ? 1 : 0;
  }

  _zCardSync(key) {
    const z = this._getZSet(key);
    return z ? z.size : 0;
  }

  _zRankSync(key, member) {
    const sorted = this._sortedZEntries(key);
    const idx = sorted.findIndex(([m]) => m === String(member));
    return idx >= 0 ? idx : null;
  }

  _zRangeSync(key, start, stop) {
    const sorted = this._sortedZEntries(key);
    const len = sorted.length;
    const s = start < 0 ? Math.max(0, len + start) : start;
    const e = stop < 0 ? len + stop : stop;
    return sorted.slice(s, e + 1).map(([m]) => m);
  }

  _zRangeByScoreSync(key, min, max) {
    const minVal = min === '-inf' ? -Infinity : Number(min);
    const maxVal = max === '+inf' || max === 'inf' ? Infinity : Number(max);
    const sorted = this._sortedZEntries(key);
    return sorted.filter(([, score]) => score >= minVal && score <= maxVal).map(([m]) => m);
  }

  // --- LUA SCRIPT EVALUATION FOR VIRTUAL WAITING ROOM (100% ATOMIC SINGLE-TICK) ---
  async eval(script, { keys = [], arguments: args = [] } = {}) {
    // 1. JOIN_OR_ADMIT
    if (script.includes('JOIN_OR_ADMIT') || script.includes("return {'ADMITTED'")) {
      const [queueKey, activeKey, expiryKey, metaKey] = keys;
      const [sessionId, nowMsRaw, maxActiveRaw, durationMsRaw] = args;
      const nowMs = Number(nowMsRaw);
      const maxActive = Number(maxActiveRaw);
      const durationMs = Number(durationMsRaw);

      const isPaused = this._hGetSync(metaKey, 'is_paused');
      if (isPaused === '1' || isPaused === 'true') return ['PAUSED', 0, 0, 0, 0];

      const isSoldOut = this._hGetSync(metaKey, 'sold_out');
      if (isSoldOut === '1' || isSoldOut === 'true') return ['SOLD_OUT', 0, 0, 0, 0];

      const expired = this._zRangeByScoreSync(expiryKey, '-inf', nowMs);
      for (const sid of expired) {
        this._hDelSync(activeKey, sid);
        this._zRemSync(expiryKey, sid);
      }

      const currentActive = this._hLenSync(activeKey);
      const queueLength = this._zCardSync(queueKey);

      if (queueLength === 0 && currentActive < maxActive) {
        const expiresAt = nowMs + durationMs;
        this._hSetSync(activeKey, sessionId, String(expiresAt));
        this._zAddSync(expiryKey, expiresAt, sessionId);
        this._hIncrBySync(metaKey, 'total_admitted', 1);
        return ['ADMITTED', 0, currentActive + 1, 0, expiresAt];
      }

      const existingRank = this._zRankSync(queueKey, sessionId);
      if (existingRank !== null) {
        return ['QUEUED', existingRank, currentActive, queueLength, 0];
      }

      this._zAddSync(queueKey, nowMs, sessionId);
      const rank = this._zRankSync(queueKey, sessionId);
      const newQueueLength = this._zCardSync(queueKey);
      return ['QUEUED', rank, currentActive, newQueueLength, 0];
    }

    // 2. ADMIT_BATCH
    if (script.includes('toAdmit') && script.includes('candidates')) {
      const [queueKey, activeKey, expiryKey, metaKey] = keys;
      const [nowMsRaw, maxActiveRaw, batchSizeRaw, durationMsRaw] = args;
      const nowMs = Number(nowMsRaw);
      const maxActive = Number(maxActiveRaw);
      const batchSize = Number(batchSizeRaw);
      const durationMs = Number(durationMsRaw);

      const isPaused = this._hGetSync(metaKey, 'is_paused');
      if (isPaused === '1' || isPaused === 'true') return [0, 0, [], 0];
      const isSoldOut = this._hGetSync(metaKey, 'sold_out');
      if (isSoldOut === '1' || isSoldOut === 'true') return [0, 0, [], 0];

      const expired = this._zRangeByScoreSync(expiryKey, '-inf', nowMs);
      for (const sid of expired) {
        this._hDelSync(activeKey, sid);
        this._zRemSync(expiryKey, sid);
      }

      const currentActive = this._hLenSync(activeKey);
      const availableSlots = maxActive - currentActive;
      if (availableSlots <= 0) return [0, currentActive, [], 0];

      const toAdmit = Math.min(availableSlots, batchSize);
      if (toAdmit <= 0) return [0, currentActive, [], 0];

      const candidates = this._zRangeSync(queueKey, 0, toAdmit - 1);
      const admitted = [];
      const expiresAt = nowMs + durationMs;

      for (const sid of candidates) {
        this._zRemSync(queueKey, sid);
        this._hSetSync(activeKey, sid, String(expiresAt));
        this._zAddSync(expiryKey, expiresAt, sid);
        admitted.push(sid);
      }

      if (admitted.length > 0) {
        this._hIncrBySync(metaKey, 'total_admitted', admitted.length);
      }

      return [admitted.length, currentActive + admitted.length, admitted, expiresAt];
    }

    // 3. RELEASE_ACTIVE
    if (keys.length === 2 && args.length === 1 && script.includes('HDEL')) {
      const [activeKey, expiryKey] = keys;
      const [sessionId] = args;
      const deleted = this._hDelSync(activeKey, sessionId);
      this._zRemSync(expiryKey, sessionId);
      return deleted;
    }

    // 4. CLEAN_EXPIRED
    if (keys.length === 2 && args.length === 1 && script.includes('ZRANGEBYSCORE')) {
      const [activeKey, expiryKey] = keys;
      const [nowMsRaw] = args;
      const expired = this._zRangeByScoreSync(expiryKey, '-inf', Number(nowMsRaw));
      for (const sid of expired) {
        this._hDelSync(activeKey, sid);
        this._zRemSync(expiryKey, sid);
      }
      return expired.length;
    }

    // 5. ATOMIC RATE LIMITER (INCR + EXPIRE via Lua)
    if (script.includes('INCR') && script.includes('EXPIRE')) {
      const key = keys[0];
      const ttlSeconds = Number(args[0]);
      const cur = await this.incr(key);
      const curTtl = await this.ttl(key);
      if (cur === 1 || curTtl === -1) {
        await this.expire(key, ttlSeconds);
      }
      const finalTtl = await this.ttl(key);
      return [cur, finalTtl];
    }

    // 6. SAFE UNLOCK IDEMPOTENCY LOCK (Validate lockToken before DEL)
    if (script.includes('lockToken') || script.includes('ARGV[1]')) {
      const key = keys[0];
      const expectedToken = String(args[0]);
      const raw = await this.get(key);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && String(parsed.lockToken) === expectedToken) {
            await this.del(key);
            return 1;
          }
        } catch (_) {}
      }
      return 0;
    }

    return null;
  }

  multi() {
    const ops = [];
    const chain = {
      del: (...a) => {
        ops.push(() => this.del(...a));
        return chain;
      },
      set: (...a) => {
        ops.push(() => this.set(...a));
        return chain;
      },
      hSet: (...a) => {
        ops.push(() => this.hSet(...a));
        return chain;
      },
      sAdd: (...a) => {
        ops.push(() => this.sAdd(...a));
        return chain;
      },
      sRem: (...a) => {
        ops.push(() => this.sRem(...a));
        return chain;
      },
      exec: async () => {
        const res = [];
        for (const fn of ops) res.push(await fn());
        return res;
      },
    };
    return chain;
  }
}

const memoryEngine = new InMemoryRedisEngine();
const isProd = process.env.NODE_ENV === 'production';
const allowMemoryInProd = process.env.REDIS_ALLOW_UNSAFE_IN_MEMORY_IN_PROD === 'true';

let useMemoryFallback =
  !isProd &&
  (!process.env.REDIS_URL ||
    process.env.REDIS_URL === 'memory' ||
    process.env.REDIS_FALLBACK_MEMORY === 'true');

if (isProd && (!process.env.REDIS_URL || process.env.REDIS_URL === 'memory') && !allowMemoryInProd) {
  logger.error('[Redis CRITICAL] Production must connect to a shared distributed Redis instance, not in-memory fallback!');
}

let rawClient = null;
let quotaWarningLogged = false;

function switchToFallback(reason = '') {
  if (isProd && !allowMemoryInProd) {
    logger.error(
      `[Redis CRITICAL] Redis connection failed in PRODUCTION (${reason}). InMemory fallback is BLOCKED in production to prevent multi-server desynchronization.`,
    );
    return;
  }
  if (!useMemoryFallback) {
    useMemoryFallback = true;
    if (!quotaWarningLogged) {
      quotaWarningLogged = true;
      logger.warn(`[Redis] Using In-Memory Redis Engine fallback: ${reason}`);
    }
    if (rawClient) {
      rawClient.disconnect().catch(() => {});
    }
  }
}

function isQuotaOrConnectionError(err) {
  const msg = String(err?.message || err || '');
  return (
    msg.includes('max requests limit exceeded') ||
    msg.includes('The client is closed') ||
    msg.includes('SocketClosedUnexpectedlyError') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('ETIMEDOUT')
  );
}

if (!useMemoryFallback) {
  rawClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    password: process.env.REDIS_PASSWORD || undefined,
    socket: {
      reconnectStrategy: (retries) => {
        if (retries > 30) {
          logger.error('[Redis] Max reconnection attempts reached (30).');
          return new Error('Max reconnection attempts reached');
        }
        return Math.min(retries * 150, 3000);
      },
    },
  });

  rawClient.on('error', (err) => {
    if (isQuotaOrConnectionError(err)) {
      switchToFallback(err.message);
      return;
    }
    logger.error('Redis Client Error', err);
  });

  rawClient.on('connect', () => logger.info('Connected to Redis'));
  rawClient.on('reconnecting', () => logger.warn('[Redis] Reconnecting to Redis server...'));
  rawClient.on('ready', () => logger.info('[Redis] Connection ready and authenticated.'));
}

// Transparent Proxy that routes to rawClient when healthy and automatically fails over to memoryEngine
const client = new Proxy(memoryEngine, {
  get(target, prop) {
    if (prop === 'isOpen') {
      return useMemoryFallback ? true : Boolean(rawClient?.isOpen);
    }
    if (prop === 'isFallback') {
      return useMemoryFallback;
    }

    if (useMemoryFallback || !rawClient) {
      const val = target[prop];
      return typeof val === 'function' ? val.bind(target) : val;
    }

    const remoteProp = rawClient[prop];
    if (typeof remoteProp === 'function') {
      return async (...args) => {
        if (useMemoryFallback) {
          return target[prop](...args);
        }
        try {
          return await remoteProp.apply(rawClient, args);
        } catch (err) {
          if (isQuotaOrConnectionError(err)) {
            switchToFallback(err.message);
            if (typeof target[prop] === 'function') {
              return target[prop](...args);
            }
          }
          throw err;
        }
      };
    }

    return remoteProp;
  },
});

const connectRedis = async () => {
  if (useMemoryFallback || !rawClient) {
    logger.info('[Redis] Using In-Memory Redis Engine.');
    return;
  }
  try {
    await rawClient.connect();
    // Probe with a lightweight PING to immediately detect Upstash 500k limit on startup
    await rawClient.ping();
  } catch (err) {
    switchToFallback(err.message);
  }
};

module.exports = {
  client,
  connectRedis,
};
