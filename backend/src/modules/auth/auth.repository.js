const db = require('../../infrastructure/database/db.client');
const { client } = require('../../infrastructure/redis/redis.client');
const crypto = require('crypto');

// =============================================
// KEYS for Redis-based storage (no DB tables for these)
// session:{hash}           → session object JSON (TTL = expiry)
// user_sessions:{userId}   → SET of session hashes (for bulk revoke)
// pwd_reset:{hash}         → { user_id } JSON (TTL = expiry)
// pending_user:{hash}      → user data JSON (TTL = expiry) [for registration]
// =============================================

class AuthRepository {
  constructor() {
    this.userColumns = null;
  }

  async getUserColumns() {
    if (this.userColumns) return this.userColumns;

    const { rows } = await db.query(
      `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'users'
      `,
    );
    this.userColumns = new Set(rows.map((row) => row.column_name));
    return this.userColumns;
  }

  async userColumnExists(columnName) {
    const columns = await this.getUserColumns();
    return columns.has(columnName);
  }

  async updateUserIfColumnsExist(id, updates) {
    const columns = await this.getUserColumns();
    const safeUpdates = Object.fromEntries(
      Object.entries(updates).filter(([key]) => columns.has(key)),
    );

    if (Object.keys(safeUpdates).length === 0) {
      return this.findUserById(id);
    }

    return this.updateUser(id, safeUpdates);
  }

  // --- USERS ---
  async findUserByEmail(email) {
    const query = `
      SELECT * FROM users 
      WHERE lower(email) = lower($1) AND deleted_at IS NULL
    `;
    const { rows } = await db.query(query, [email]);
    return rows[0];
  }

  async findUserById(id) {
    const query = `
      SELECT * FROM users 
      WHERE id = $1 AND deleted_at IS NULL
    `;
    const { rows } = await db.query(query, [id]);
    return rows[0];
  }

  async createUser(userData) {
    const query = `
      INSERT INTO users (email, password_hash, full_name, phone, google_id, email_verified, avatar_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    const values = [
      userData.email,
      userData.password_hash,
      userData.full_name,
      userData.phone || null,
      userData.google_id || null,
      userData.email_verified || false,
      userData.avatar_url || null,
    ];
    const { rows } = await db.query(query, values);
    return rows[0];
  }

  async updateUser(id, updates) {
    const setClause = Object.keys(updates)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');
    const query = `
      UPDATE users 
      SET ${setClause}, updated_at = now()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `;
    const values = [id, ...Object.values(updates)];
    const { rows } = await db.query(query, values);
    return rows[0];
  }

  // --- ROLES (user_roles uses role_id FK to roles table) ---
  async findUserRoles(userId) {
    const query = `
      SELECT r.name FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = $1
    `;
    const { rows } = await db.query(query, [userId]);
    return rows.map((r) => r.name);
  }

  async assignRole(userId, roleName) {
    // user_roles has (user_id UUID, role_id INT) — no role string column
    const query = `
      INSERT INTO user_roles (user_id, role_id)
      SELECT $1, id FROM roles WHERE name = $2
      ON CONFLICT (user_id, role_id) DO NOTHING
    `;
    await db.query(query, [userId, roleName]);
  }

  // --- SESSIONS (Redis-based — no user_sessions table in DB) ---
  async createSession(sessionData) {
    const id = crypto.randomUUID();
    const key = `session:${sessionData.refresh_token_hash}`;
    const userKey = `user_sessions:${sessionData.user_id}`;

    const session = {
      id,
      user_id: sessionData.user_id,
      user_agent: sessionData.user_agent,
      ip_address: sessionData.ip_address,
      device_name: sessionData.device_name,
      created_at: sessionData.created_at || new Date().toISOString(),
      expires_at: sessionData.expires_at,
      revoked_at: null,
    };

    const ttlSeconds = Math.floor(
      (new Date(sessionData.expires_at).getTime() - Date.now()) / 1000
    );

    await client.setEx(key, ttlSeconds, JSON.stringify(session));
    // Track this hash under the user so we can revoke all later
    await client.sAdd(userKey, sessionData.refresh_token_hash);

    return session;
  }

  async findSessionByHash(hash) {
    const key = `session:${hash}`;
    const data = await client.get(key);
    if (!data) return null;
    const session = JSON.parse(data);
    if (session.revoked_at) return null;
    return session;
  }

  async listUserSessions(userId) {
    const userKey = `user_sessions:${userId}`;
    const hashes = await client.sMembers(userKey);
    if (hashes.length === 0) return [];

    const sessions = await Promise.all(hashes.map((hash) => this.findSessionByHash(hash)));
    return sessions
      .filter(Boolean)
      .sort((a, b) => {
        const bTime = new Date(b.created_at || b.expires_at || 0).getTime();
        const aTime = new Date(a.created_at || a.expires_at || 0).getTime();
        return bTime - aTime;
      });
  }

  async revokeSession(id, hash) {
    // Left for interface compatibility. 
    // New code uses revokeSessionByHash directly.
    if (hash) {
      await this.revokeSessionByHash(hash);
    }
  }

  async revokeSessionByHash(hash) {
    const key = `session:${hash}`;
    await client.del(key);
  }

  async revokeAllUserSessions(userId) {
    const userKey = `user_sessions:${userId}`;
    const hashes = await client.sMembers(userKey);
    if (hashes.length > 0) {
      const sessionKeys = hashes.map((h) => `session:${h}`);
      await client.del(sessionKeys);
    }
    await client.del(userKey);
  }

  // --- PASSWORD RESET TOKENS (Redis-based) ---
  async createPasswordResetToken(userId, tokenHash, expiresAt) {
    const key = `pwd_reset:${tokenHash}`;
    const ttlSeconds = Math.floor(
      (new Date(expiresAt).getTime() - Date.now()) / 1000
    );
    await client.setEx(key, ttlSeconds, JSON.stringify({ user_id: userId }));
  }

  async findPasswordResetToken(tokenHash) {
    const key = `pwd_reset:${tokenHash}`;
    const data = await client.get(key);
    if (!data) return null;
    const record = JSON.parse(data);
    // Return shape compatible with auth.service.js expectations
    return { id: tokenHash, user_id: record.user_id };
  }

  async usePasswordResetToken(id) {
    // id = tokenHash (as returned above). Delete to invalidate.
    const key = `pwd_reset:${id}`;
    await client.del(key);
  }

  // --- EMAIL VERIFICATION TOKENS (Redis-based) ---
  // Just aliasing pending user logic so the interface stays compatible if we ever need it separately.
  async createEmailVerificationToken(userId, tokenHash, expiresAt) {
    // Handled via savePendingUser currently.
  }

  async findEmailVerificationToken(tokenHash) {
    return null;
  }

  async useEmailVerificationToken(id) {
    return null;
  }

  // --- PENDING USERS (Redis — for email verification before DB insert) ---
  async savePendingUser(tokenHash, userData, expiresAt) {
    const key = `pending_user:${tokenHash}`;
    const ttl = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
    await client.setEx(key, ttl, JSON.stringify(userData));
  }

  async getPendingUser(tokenHash) {
    const key = `pending_user:${tokenHash}`;
    const data = await client.get(key);
    return data ? JSON.parse(data) : null;
  }

  async deletePendingUser(tokenHash) {
    const key = `pending_user:${tokenHash}`;
    await client.del(key);
  }
}

module.exports = new AuthRepository();
