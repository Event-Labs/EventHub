const WAITING_ROOM_CONSTANTS = {
  STATES: {
    WAITING: 'WAITING',
    ADMITTING: 'ADMITTING',
    ACTIVE: 'ACTIVE',
    RELEASED: 'RELEASED',
    EXPIRED: 'EXPIRED',
    SOLD_OUT: 'SOLD_OUT',
  },

  KEYS: {
    QUEUE: (eventId) => `queue:event:${eventId}`,
    ACTIVE: (eventId) => `active:event:${eventId}`,
    ACTIVE_EXPIRY: (eventId) => `active:expiry:${eventId}`,
    SESSION: (eventId, sessionId) => `session:event:${eventId}:${sessionId}`,
    TOKEN: (tokenHash) => `booking:token:${tokenHash}`,
    META: (eventId) => `queue:meta:${eventId}`,
    ACTIVE_EVENTS_SET: 'queue:events:active',
  },

  DEFAULTS: {
    MAX_ACTIVE: 100,
    SESSION_DURATION_SEC: 600, // 10 minutes
    POLL_INTERVAL_MS: 3000,
    ADMISSION_BATCH_SIZE: 10,
    NEAR_TURN_THRESHOLD: 5,
    SESSION_KEY_TTL_SEC: 86400, // 24 hours
  },
};

module.exports = WAITING_ROOM_CONSTANTS;

