const rateLimit = require('express-rate-limit');
const ApiResponse = require('../core/response/ApiResponse');
const ErrorCodes = require('../core/errors/errorCodes');
const { client: redisClient } = require('../infrastructure/redis/redis.client');
const { getClientIp } = require('../core/security/ipResolver');

const RATE_LIMIT_LUA = `
  local current = redis.call('INCR', KEYS[1])
  if current == 1 then
      redis.call('EXPIRE', KEYS[1], ARGV[1])
  else
      local ttl = redis.call('TTL', KEYS[1])
      if ttl == -1 then
          redis.call('EXPIRE', KEYS[1], ARGV[1])
      end
  end
  local ttl = redis.call('TTL', KEYS[1])
  return { current, ttl }
`;

async function atomicRateLimitIncrement(redisKey, windowSeconds) {
    try {
        const res = await redisClient.eval(RATE_LIMIT_LUA, {
            keys: [redisKey],
            arguments: [String(windowSeconds)],
        });
        return {
            current: Number(res[0]),
            ttl: Number(res[1]),
        };
    } catch (_) {
        const current = await redisClient.incr(redisKey);
        if (current === 1) await redisClient.expire(redisKey, windowSeconds);
        const ttl = await redisClient.ttl(redisKey);
        return { current, ttl };
    }
}

const createRateLimiter = (windowMs, max, message = 'Too many requests from this IP, please try again later.', options = {}) => {
    const config = {
        windowMs,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        validate: false,
        skip: (req) => {
            // Bypass rate limit in test environment or for performance testing suites
            const userAgent = req.headers['user-agent'] || '';
            const bypassHeader = req.headers['x-bypass-rate-limit'];
            if (
                process.env.NODE_ENV === 'test' ||
                bypassHeader === 'true' ||
                userAgent.includes('EventHub-Performance-Test') ||
                userAgent.includes('k6')
            ) {
                return true;
            }
            if (typeof options.skip === 'function') {
                return options.skip(req);
            }
            return false;
        },
        handler: (req, res, next) => {
            res.status(429).json(ApiResponse.error(message, 429, ErrorCodes.RATE_LIMIT_EXCEEDED));
        },
        ...options,
    };

    return rateLimit(config);
};

/**
 * Distributed rate limiter using Redis counter & TTL shared across both backend servers.
 * Keys combine user_id (if authenticated) and IP (with distinct limits), action prefix, and optional scope.
 * Prevents NAT/office IP locking legitimate users while strictly stopping bot swarms.
 */
function createDistributedRateLimiter({
    action = 'general',
    windowMs = 60000,
    max = 10,
    ipPoolMultiplier = 5, // Higher threshold for shared office/NAT IPs
    message = 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau giây lát.',
    keyGenerator = null,
}) {
    return async (req, res, next) => {
        const userAgent = req.headers['user-agent'] || '';
        const bypassHeader = req.headers['x-bypass-rate-limit'];
        const enforceInTest = req.headers['x-enforce-rate-limit'] === 'true';

        if (
            (!enforceInTest && process.env.NODE_ENV === 'test') ||
            bypassHeader === 'true' ||
            userAgent.includes('EventHub-Performance-Test') ||
            userAgent.includes('k6')
        ) {
            return next();
        }

        try {
            const userId = req.user?.sub || req.user?.id || null;
            const ip = getClientIp(req);
            const effectiveMax = typeof max === 'function' ? max(req) : max;

            const customKey = typeof keyGenerator === 'function' ? keyGenerator(req) : '';
            const windowSeconds = Math.ceil(windowMs / 1000);

            // 1. User-specific rate limit (or standalone IP if unauthenticated)
            const primaryKey = userId
                ? `rl:${action}:u:${userId}${customKey ? `:${customKey}` : ''}`
                : `rl:${action}:ip:${ip}${customKey ? `:${customKey}` : ''}`;

            const { current: userCurrent, ttl: userTtl } = await atomicRateLimitIncrement(primaryKey, windowSeconds);

            if (userCurrent > effectiveMax) {
                const retryAfter = Math.max(1, userTtl);
                res.set('Retry-After', String(retryAfter));
                return res.status(429).json(
                    ApiResponse.error(message, 429, ErrorCodes.RATE_LIMIT_EXCEEDED, {
                        retryAfter,
                        limit: effectiveMax,
                        current: userCurrent,
                    }),
                );
            }

            // 2. IP Pool rate limit (if user is logged in, ensure single IP cannot spawn 100 accounts to bypass)
            if (userId) {
                const ipPoolKey = `rl:${action}:ippool:${ip}${customKey ? `:${customKey}` : ''}`;
                const ipPoolMax = effectiveMax * ipPoolMultiplier;
                const { current: ipCurrent, ttl: ipTtl } = await atomicRateLimitIncrement(ipPoolKey, windowSeconds);

                if (ipCurrent > ipPoolMax) {
                    const retryAfter = Math.max(1, ipTtl);
                    res.set('Retry-After', String(retryAfter));
                    return res.status(429).json(
                        ApiResponse.error('Lưu lượng truy cập từ mạng của bạn vượt quá ngưỡng cho phép.', 429, ErrorCodes.RATE_LIMIT_EXCEEDED, {
                            retryAfter,
                            limit: ipPoolMax,
                            current: ipCurrent,
                        }),
                    );
                }
            }

            return next();
        } catch (err) {
            // Fail open to avoid blocking legitimate users on Redis glitch
            return next();
        }
    };
}

// Pre-configured distributed limiters for ticket booking flows
const holdSeatsRateLimiter = createDistributedRateLimiter({
    action: 'hold_seats',
    windowMs: 60000,
    // 3 for new hold creations, but 10 for safe seat updates (when switching seats in active session)
    max: (req) => {
        if (req.body?.is_update || req.headers['x-is-hold-update'] === 'true') {
            return 10;
        }
        return parseInt(process.env.RATE_LIMIT_CREATE_HOLD_MAX || '3', 10);
    },
    message: 'Bạn đã thực hiện giữ vé quá 3 lần trong 1 phút. Vui lòng đợi trong giây lát.',
});

const releaseSeatHoldsRateLimiter = createDistributedRateLimiter({
    action: 'release_hold',
    windowMs: 60000,
    max: parseInt(process.env.RATE_LIMIT_CANCEL_HOLD_MAX || '5', 10),
    message: 'Bạn đã hủy giữ vé quá nhiều lần trong 1 phút. Vui lòng chờ trước khi tiếp tục.',
});

const checkAvailabilityRateLimiter = createDistributedRateLimiter({
    action: 'check_availability',
    windowMs: 60000,
    max: parseInt(process.env.RATE_LIMIT_CHECK_HOLD_MAX || '30', 10),
    message: 'Quá nhiều yêu cầu kiểm tra vé. Vui lòng thử lại sau.',
});

const checkoutRateLimiter = createDistributedRateLimiter({
    action: 'checkout_order',
    windowMs: 60000,
    max: parseInt(process.env.RATE_LIMIT_CHECKOUT_MAX || '5', 10),
    message: 'Quá nhiều yêu cầu tạo đơn hàng. Vui lòng kiểm tra lại đơn hàng hiện có.',
});

createRateLimiter.createRateLimiter = createRateLimiter;
createRateLimiter.createDistributedRateLimiter = createDistributedRateLimiter;
createRateLimiter.holdSeatsRateLimiter = holdSeatsRateLimiter;
createRateLimiter.releaseSeatHoldsRateLimiter = releaseSeatHoldsRateLimiter;
createRateLimiter.checkAvailabilityRateLimiter = checkAvailabilityRateLimiter;
createRateLimiter.checkoutRateLimiter = checkoutRateLimiter;
createRateLimiter.default = createRateLimiter;

module.exports = createRateLimiter;
