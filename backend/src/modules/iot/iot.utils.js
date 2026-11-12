const crypto = require('crypto');

function parsePositiveInt(value, fallback) {
  const num = Number.parseInt(value, 10);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

const DEVICE_ONLINE_THRESHOLD_SEC = parsePositiveInt(
  process.env.IOT_HEARTBEAT_ONLINE_THRESHOLD_SEC,
  90,
);
const PAIRING_TTL_MINUTES = parsePositiveInt(process.env.IOT_PAIRING_TTL_MINUTES, 15);
const PENDING_SECRET_TTL_MINUTES = parsePositiveInt(
  process.env.IOT_PENDING_SECRET_TTL_MINUTES,
  10,
);
const POLL_INTERVAL_SEC = parsePositiveInt(process.env.IOT_POLL_INTERVAL_SEC, 4);

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAIRING_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function normalizeMacAddress(raw) {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().replace(/[:-]/g, '').toLowerCase();
  if (!/^[0-9a-f]{12}$/.test(cleaned)) {
    return null;
  }
  return cleaned.match(/.{2}/g).join(':');
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function timingSafeEqualHex(hexA, hexB) {
  if (typeof hexA !== 'string' || typeof hexB !== 'string') return false;
  if (hexA.length === 0 || hexA.length !== hexB.length) return false;
  if (!/^[0-9a-f]+$/i.test(hexA) || !/^[0-9a-f]+$/i.test(hexB)) return false;

  const bufA = Buffer.from(hexA, 'hex');
  const bufB = Buffer.from(hexB, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function generatePairingCode() {
  const bytes = crypto.randomBytes(4);
  let suffix = '';
  for (let i = 0; i < 4; i += 1) {
    suffix += PAIRING_ALPHABET[bytes[i] % PAIRING_ALPHABET.length];
  }
  return `EH${suffix}`;
}

function generateRandomToken(byteLength = 32) {
  return crypto.randomBytes(byteLength).toString('hex');
}

function isUuid(value) {
  return typeof value === 'string' && UUID_REGEX.test(value.trim());
}

function isDeviceOnline(device, nowMs = Date.now()) {
  if (!device || device.status !== 'ACTIVE' || !device.last_seen_at) {
    return false;
  }
  const seenMs = new Date(device.last_seen_at).getTime();
  if (!Number.isFinite(seenMs)) return false;
  return nowMs - seenMs <= DEVICE_ONLINE_THRESHOLD_SEC * 1000;
}

function extractClientIp(req) {
  const cfIp = req?.headers?.['cf-connecting-ip'];
  if (typeof cfIp === 'string' && cfIp.trim()) {
    return cfIp.trim();
  }
  const forwarded = req?.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req?.ip || req?.socket?.remoteAddress || null;
}

module.exports = {
  DEVICE_ONLINE_THRESHOLD_SEC,
  PAIRING_TTL_MINUTES,
  PENDING_SECRET_TTL_MINUTES,
  POLL_INTERVAL_SEC,
  normalizeMacAddress,
  sha256Hex,
  timingSafeEqualHex,
  generatePairingCode,
  generateRandomToken,
  isUuid,
  isDeviceOnline,
  extractClientIp,
};

