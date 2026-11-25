const { client: redisClient } = require('../../infrastructure/redis/redis.client');
const { logSecurityEvent, SecurityActions } = require('./securityLogger');
const captchaService = require('./captcha.service');
const db = require('../../infrastructure/database/db.client');
const AppError = require('../errors/AppError');
const ErrorCodes = require('../errors/errorCodes');
const logger = require('../logger');

const RISK_THRESHOLDS = {
  NORMAL_MAX: 49,
  CHALLENGE_MIN: 50,
  CHALLENGE_MAX: 69,
  BLOCK_MIN: 70,
};

class RiskScoringService {
  /**
   * Track hold creation event and compute current risk score
   * Threshold rules:
   * 0 - 49: Normal, proceed
   * 50 - 69: Require Cloudflare Turnstile token
   * 70+: Restrict new hold creation and log security audit
   */
  async recordHoldCreation(userId, eventId, { ip, userAgent, deviceId, captchaToken = null, isUpdate = false }) {
    if (!userId) return { riskScore: 0, level: 'LOW' };

    const deviceKey = deviceId ? `risk:device:${deviceId}` : null;
    const now = Date.now();

    let score = 0;

    try {
      // 1. Check creations in last 10 minutes (600s) - only increment for NEW hold sessions, not safe updates
      const creationsKey = `risk:creations:${userId}`;
      let creationCount = 0;
      if (!isUpdate) {
        creationCount = await redisClient.incr(creationsKey);
        if (creationCount === 1) {
          await redisClient.expire(creationsKey, 600);
        }
      } else {
        const raw = await redisClient.get(creationsKey);
        creationCount = raw ? parseInt(raw, 10) : 0;
      }

      if (creationCount >= 5) {
        score += 30; // +30 if >= 5 creations in 10 minutes
      }

      // 2. Multi-accounts on same device (signal only, not absolute identifier)
      if (deviceKey) {
        const devAccountsKey = `risk:dev_users:${deviceId}`;
        await redisClient.sAdd?.(devAccountsKey, userId) || await redisClient.set?.(`${devAccountsKey}:${userId}`, '1', { EX: 86400 });
        const devAccounts = await redisClient.sMembers?.(devAccountsKey) || [];
        if (devAccounts.length >= 3) {
          score += 30; // +30 signal for >= 3 accounts on same device
        }
      }

      // 3. Prior consecutive cancellations
      const cancelsKey = `risk:cancels:${userId}`;
      const rawCancels = await redisClient.get(cancelsKey);
      const cancelCount = rawCancels ? parseInt(rawCancels, 10) : 0;
      if (cancelCount >= 3) {
        score += 20; // +20 for >= 3 prior cancellations
      }

      // 4. Check account verification / age in database
      const userRes = await db.query(
        'SELECT email_verified, created_at FROM users WHERE id = $1 LIMIT 1',
        [userId],
      );
      if (userRes.rows[0]) {
        const { email_verified, created_at } = userRes.rows[0];
        const accountAgeDays = (now - new Date(created_at).getTime()) / (1000 * 3600 * 24);
        if (!email_verified && accountAgeDays < 1) {
          score += 10; // +10 for brand new unverified account
        }
      }

      // Reset consecutive cancel counter on legit creation
      if (!isUpdate) {
        await redisClient.del(`risk:cancels:${userId}`);
      }

      // Evaluate risk thresholds
      if (score >= RISK_THRESHOLDS.BLOCK_MIN) {
        await logSecurityEvent({
          userId,
          eventId,
          action: SecurityActions.HIGH_RISK_HOLD_BLOCKED,
          riskScore: score,
          ipAddress: ip,
          userAgent,
          deviceId,
          details: { creationCount, score, threshold: 'BLOCK' },
        });

        throw new AppError(
          'Hệ thống phát hiện hoạt động bất thường từ tài khoản của bạn. Vui lòng thử lại sau 10 phút.',
          429,
          ErrorCodes.RATE_LIMIT_EXCEEDED,
        );
      }

      if (score >= RISK_THRESHOLDS.CHALLENGE_MIN) {
        // Requires Cloudflare Turnstile token verification
        const verification = await captchaService.verifyTurnstileToken(captchaToken, ip);
        if (!verification.success) {
          throw new AppError(
            'Vui lòng xác thực CAPTCHA để tiếp tục đặt vé.',
            403,
            ErrorCodes.FORBIDDEN,
            { requireCaptcha: true, riskScore: score },
          );
        }
      }

      const level = score >= 50 ? 'MEDIUM' : 'LOW';
      return { riskScore: score, level };
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error('[RISK_SCORING] Error checking creation risk:', err.message);
      return { riskScore: 0, level: 'LOW' };
    }
  }

  /**
   * Track hold cancellation event
   */
  async recordHoldCancellation(userId, eventId, { ip, userAgent, deviceId }) {
    if (!userId) return;

    try {
      const cancelsKey = `risk:cancels:${userId}`;
      const cancelCount = await redisClient.incr(cancelsKey);
      if (cancelCount === 1) {
        await redisClient.expire(cancelsKey, 1800); // 30 mins window
      }

      let score = 0;
      if (cancelCount >= 3) {
        score += 20; // +20 for 3 consecutive cancellations
      }

      await logSecurityEvent({
        userId,
        eventId,
        action: SecurityActions.CANCEL_HOLD,
        riskScore: score,
        ipAddress: ip,
        userAgent,
        deviceId,
        details: { cancelCount, score },
      });
    } catch (err) {
      logger.error('[RISK_SCORING] Error recording hold cancellation:', err.message);
    }
  }

  /**
   * Track hold expiration event
   */
  async recordHoldExpired(userId, eventId) {
    if (!userId) return;
    try {
      await logSecurityEvent({
        userId,
        eventId,
        action: SecurityActions.EXPIRE_HOLD,
        riskScore: 10,
        details: { reason: 'HOLD_TIME_EXPIRED' },
      });
    } catch (err) {
      logger.error('[RISK_SCORING] Error recording hold expiration:', err.message);
    }
  }
}

module.exports = new RiskScoringService();
