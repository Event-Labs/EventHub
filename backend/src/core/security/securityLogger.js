const logger = require('../logger');
const db = require('../../infrastructure/database/db.client');

const SecurityActions = {
  CREATE_HOLD: 'CREATE_HOLD',
  CANCEL_HOLD: 'CANCEL_HOLD',
  EXPIRE_HOLD: 'EXPIRE_HOLD',
  UPDATE_HOLD: 'UPDATE_HOLD',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  SUSPICIOUS_DEVICE_DETECTED: 'SUSPICIOUS_DEVICE_DETECTED',
  HIGH_RISK_HOLD_BLOCKED: 'HIGH_RISK_HOLD_BLOCKED',
  INVENTORY_CONFLICT: 'INVENTORY_CONFLICT',
  PAYMENT_RECONCILIATION_ERROR: 'PAYMENT_RECONCILIATION_ERROR',
};

async function logSecurityEvent({
  userId = null,
  eventId = null,
  action,
  riskScore = 0,
  ipAddress = null,
  userAgent = null,
  deviceId = null,
  details = {},
}) {
  const structuredEntry = {
    timestamp: new Date().toISOString(),
    action,
    userId,
    eventId,
    riskScore,
    ipAddress,
    userAgent,
    deviceId,
    details,
  };

  logger.warn(`[SECURITY_AUDIT] action=${action} userId=${userId || 'anonymous'} eventId=${eventId || 'none'} risk=${riskScore} ip=${ipAddress || 'unknown'}`, structuredEntry);

  // Asynchronously record into PostgreSQL security_activity_logs (fire-and-forget, non-blocking)
  try {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const safeUserId = userId && UUID_REGEX.test(String(userId)) ? userId : null;
    const safeEventId = eventId && UUID_REGEX.test(String(eventId)) ? eventId : null;
    const mergedDetails = {
      ...(details || {}),
      ...(userId && !safeUserId ? { rawUserId: userId } : {}),
      ...(eventId && !safeEventId ? { rawEventId: eventId } : {}),
    };

    await db.query(
      `
      INSERT INTO security_activity_logs (
        user_id, event_id, action, risk_score, ip_address, user_agent, device_id, details, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW())
      `,
      [
        safeUserId,
        safeEventId,
        action,
        riskScore,
        ipAddress ? String(ipAddress).slice(0, 100) : null,
        userAgent ? String(userAgent).slice(0, 500) : null,
        deviceId ? String(deviceId).slice(0, 255) : null,
        JSON.stringify(mergedDetails),
      ],
    );
  } catch (err) {
    logger.error('[SECURITY_AUDIT_DB_FAIL] Failed to persist security log:', err.message);
  }
}

module.exports = {
  SecurityActions,
  logSecurityEvent,
};
