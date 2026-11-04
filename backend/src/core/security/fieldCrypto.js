'use strict';
const crypto = require('crypto');

const PREFIX = 'enc';
const masters = {};

for (const [name, value] of Object.entries(process.env)) {
  const m = /^CRED_MASTER_KEY_V(\d+)$/.exec(name);
  if (!m || !value) continue;
  const buf = Buffer.from(value, 'base64');
  if (buf.length !== 32) throw new Error(`${name} must decode to exactly 32 bytes`);
  masters[Number(m[1])] = buf;
}

const CURRENT = Number(process.env.CRED_MASTER_KEY_CURRENT || 1);

if (!masters[CURRENT]) {
  if (process.env.NODE_ENV === 'test') {
    masters[CURRENT] = crypto.createHash('sha256').update('test-only-key').digest();
  } else {
    throw new Error(`Missing CRED_MASTER_KEY_V${CURRENT}`);
  }
}

function derive(version, orgId, field) {
  const master = masters[version];
  if (!master) throw new Error('Unknown credential key version');
  return Buffer.from(
    crypto.hkdfSync('sha256', master, Buffer.from(String(orgId)), Buffer.from(`eventhub:${field}`), 32)
  );
}

function isEncrypted(v) {
  return typeof v === 'string' && v.startsWith(`${PREFIX}.`) && v.split('.').length === 5;
}

function encrypt(plain, orgId, field) {
  if (plain === null || plain === undefined) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', derive(CURRENT, orgId, field), iv);
  cipher.setAAD(Buffer.from(`${orgId}:${field}`));
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return [PREFIX, CURRENT, iv.toString('base64'), cipher.getAuthTag().toString('base64'), ct.toString('base64')].join('.');
}

function encryptIfNeeded(value, orgId, field) {
  if (value === null || value === undefined) return value;
  return isEncrypted(value) ? value : encrypt(value, orgId, field);
}

function decrypt(stored, orgId, field, { allowLegacy = false } = {}) {
  if (stored === null || stored === undefined) return stored;
  if (!isEncrypted(stored)) {
    if (allowLegacy) return stored;
    throw new Error('Credential is not encrypted');
  }
  try {
    const [, v, iv, tag, ct] = stored.split('.');
    const d = crypto.createDecipheriv('aes-256-gcm', derive(Number(v), orgId, field), Buffer.from(iv, 'base64'));
    d.setAAD(Buffer.from(`${orgId}:${field}`));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
  } catch {
    throw new Error('Cannot decrypt credential');
  }
}

function maskTail(value, visible = 4) {
  const s = String(value || '');
  return s.length <= visible ? '****' : `****${s.slice(-visible)}`;
}

module.exports = { encrypt, encryptIfNeeded, decrypt, isEncrypted, maskTail };
