const { client: redis } = require('../infrastructure/redis/redis.client');
const logger = require('../core/logger');

/**
 * Cache middleware lưu kết quả GET vào Redis theo TTL (giây)
 * Tự động phân tách cache giữa khách vãng lai và người dùng đăng nhập (để không lộ is_favorited)
 *
 * @param {number} ttlSeconds Thời gian cache tính bằng giây (mặc định 15s)
 * @param {object} options Cấu hình tùy biến
 * @param {boolean} options.isUserSpecific Có phân biệt cache theo userId hay không (mặc định: auto nếu có req.user)
 */
const cacheMiddleware = (ttlSeconds = 15, options = {}) => {
  return async (req, res, next) => {
    // Chỉ cache các request GET
    if (req.method !== 'GET') {
      return next();
    }

    // Xác định cache key
    const userSuffix = req.user?.sub ? `:u_${req.user.sub}` : ':public';
    const cacheKey = `cache:${req.originalUrl}${options.isUserSpecific !== false ? userSuffix : ''}`;

    try {
      if (redis.isOpen) {
        const cachedData = await redis.get(cacheKey);
        if (cachedData) {
          res.setHeader('X-Cache', 'HIT');
          return res.status(200).json(JSON.parse(cachedData));
        }
      }
    } catch (err) {
      logger.warn(`[Redis Cache] Lỗi đọc cache key ${cacheKey}: ${err.message}`);
    }

    res.setHeader('X-Cache', 'MISS');

    // Bắt hàm res.json để tự động lưu vào Redis khi response trả về 200
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode === 200 && redis.isOpen) {
        redis
          .set(cacheKey, JSON.stringify(body), { EX: ttlSeconds })
          .catch((err) => {
            logger.warn(`[Redis Cache] Lỗi ghi cache key ${cacheKey}: ${err.message}`);
          });
      }
      return originalJson(body);
    };

    next();
  };
};

/**
 * Xóa các cache key khớp với pattern (dùng khi Organizer hoặc Admin cập nhật sự kiện)
 * Ví dụ: clearCachePattern('cache:/api/events*')
 */
const clearCachePattern = async (pattern = 'cache:/api/events*') => {
  try {
    if (!redis.isOpen) return 0;
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      const deleted = await redis.del(keys);
      logger.info(`[Redis Cache] Đã xóa ${deleted} cache keys với pattern: ${pattern}`);
      return deleted;
    }
    return 0;
  } catch (err) {
    logger.error(`[Redis Cache] Lỗi khi xóa cache pattern ${pattern}: ${err.message}`);
    return 0;
  }
};

module.exports = {
  cacheMiddleware,
  clearCachePattern,
};
