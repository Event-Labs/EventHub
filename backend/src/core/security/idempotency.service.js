const crypto = require('crypto');
const { client: redisClient } = require('../../infrastructure/redis/redis.client');
const AppError = require('../errors/AppError');
const ErrorCodes = require('../errors/errorCodes');
const logger = require('../logger');

const IDEMPOTENCY_TTL_SECONDS = 900; // 15 minutes

function computeRequestHash(userId, method, path, body) {
  const normalized = {
    userId: userId || 'anonymous',
    method: String(method || '').toUpperCase(),
    path: String(path || '').toLowerCase(),
    body: body || {},
  };
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

const SAFE_UNLOCK_LUA = `
  local raw = redis.call('GET', KEYS[1])
  if raw then
      local data = cjson.decode(raw)
      if data and data.lockToken == ARGV[1] then
          return redis.call('DEL', KEYS[1])
      end
  end
  return 0
`;

class IdempotencyService {
  /**
   * Check if idempotency key has been used or is in flight
   * Returns cached response if available, or acquires lock with a unique lockToken.
   */
  async lockOrGetCached(key, userId, method, path, body) {
    if (!key) return null;

    const redisKey = `idempotency:${key}`;
    const requestHash = computeRequestHash(userId, method, path, body);
    const lockToken = crypto.randomUUID();

    try {
      const inProgressData = JSON.stringify({
        status: 'IN_PROGRESS',
        requestHash,
        lockToken,
        userId: userId || 'anonymous',
        createdAt: Date.now(),
      });

      // Atomic lock acquisition: returns 'OK' ONLY if key did not exist before
      // Lease TTL: 120 seconds to prevent premature expiration on long transactions
      const acquired = await redisClient.set(redisKey, inProgressData, { EX: 120, NX: true });

      if (acquired === 'OK') {
        // Successfully acquired lock as the single permitted execution
        return { isCached: false, redisKey, requestHash, lockToken };
      }

      // Key already exists: fetch existing state to evaluate cached response or concurrent conflict
      const raw = await redisClient.get(redisKey);
      if (raw) {
        let entry;
        try {
          entry = JSON.parse(raw);
        } catch (_) {
          entry = null;
        }

        if (entry) {
          if (entry.requestHash !== requestHash) {
            throw new AppError(
              'Idempotency-Key đã được sử dụng với nội dung yêu cầu khác.',
              400,
              ErrorCodes.INVALID_INPUT,
            );
          }

          if (entry.status === 'IN_PROGRESS') {
            throw new AppError(
              'Yêu cầu tương tự đang được xử lý. Vui lòng chờ trong giây lát.',
              409,
              ErrorCodes.CONCURRENT_UPDATE,
            );
          }

          if (entry.status === 'COMPLETED' && entry.response) {
            logger.info(`[IDEMPOTENCY] Cache hit for key=${key}`);
            return { isCached: true, response: entry.response };
          }
        }
      }

      // Fallback if previous entry expired between NX check and GET: try acquire once more
      const retryAcquired = await redisClient.set(redisKey, inProgressData, { EX: 120, NX: true });
      if (retryAcquired === 'OK') {
        return { isCached: false, redisKey, requestHash, lockToken };
      }

      throw new AppError(
        'Yêu cầu tương tự đang được xử lý. Vui lòng chờ trong giây lát.',
        409,
        ErrorCodes.CONCURRENT_UPDATE,
      );
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error('[IDEMPOTENCY] Error in lockOrGetCached:', err.message);
      return null;
    }
  }

  /**
   * Save completed response for idempotency key
   */
  async saveResponse(key, requestHash, responseData, statusCode = 200, lockToken = null) {
    if (!key) return;
    const redisKey = `idempotency:${key}`;
    try {
      const completedData = JSON.stringify({
        status: 'COMPLETED',
        requestHash,
        lockToken,
        response: {
          statusCode,
          data: responseData,
        },
        completedAt: Date.now(),
      });
      await redisClient.set(redisKey, completedData, { EX: IDEMPOTENCY_TTL_SECONDS });
    } catch (err) {
      logger.error('[IDEMPOTENCY] Error in saveResponse:', err.message);
    }
  }

  /**
   * Clear in-progress lock safely, verifying lock ownership token.
   * Prevents a slow request from deleting a newly acquired lock of a subsequent request.
   */
  async clearLock(key, lockToken = null) {
    if (!key) return;
    const redisKey = `idempotency:${key}`;
    try {
      if (lockToken) {
        try {
          await redisClient.eval(SAFE_UNLOCK_LUA, {
            keys: [redisKey],
            arguments: [String(lockToken)],
          });
          return;
        } catch (_) {}
      }
      await redisClient.del(redisKey);
    } catch (err) {
      logger.error('[IDEMPOTENCY] Error in clearLock:', err.message);
    }
  }
}

module.exports = new IdempotencyService();
