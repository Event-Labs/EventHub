const db = require('../../infrastructure/database/db.client');
const { client } = require('../../infrastructure/redis/redis.client');

class AuthRepository {
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
      INSERT INTO users (email, password_hash, full_name, phone, google_id, email_verified)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const values = [
      userData.email,
      userData.password_hash,
      userData.full_name,
      userData.phone || null,
      userData.google_id || null,
      userData.email_verified || false,
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

  // --- ROLES ---
  async findUserRoles(userId) {
    const query = `
      SELECT role FROM user_roles WHERE user_id = $1
    `;
    const { rows } = await db.query(query, [userId]);
    return rows.map((r) => r.role);
  }

  async assignRole(userId, role, assignedBy = null) {
    const query = `
      INSERT INTO user_roles (user_id, role, assigned_by)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, role) DO NOTHING
    `;
    await db.query(query, [userId, role, assignedBy]);
  }

  // --- REFRESH SESSIONS ---
  async createSession(sessionData) {
    const query = `
      INSERT INTO user_sessions (user_id, refresh_token_hash, user_agent, ip_address, expires_at)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const values = [
      sessionData.user_id,
      sessionData.refresh_token_hash,
      sessionData.user_agent,
      sessionData.ip_address,
      sessionData.expires_at,
    ];
    const { rows } = await db.query(query, values);
    return rows[0];
  }

  async findSessionByHash(hash) {
    const query = `
      SELECT * FROM user_sessions 
      WHERE refresh_token_hash = $1 AND revoked_at IS NULL AND expires_at > now()
    `;
    const { rows } = await db.query(query, [hash]);
    return rows[0];
  }

  async revokeSession(id) {
    const query = `
      UPDATE user_sessions SET revoked_at = now() WHERE id = $1
    `;
    await db.query(query, [id]);
  }

  async revokeAllUserSessions(userId) {
    const query = `
      UPDATE user_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL
    `;
    await db.query(query, [userId]);
  }

  // --- TOKENS (Verification & Reset) ---
  async createEmailVerificationToken(userId, tokenHash, expiresAt) {
    const query = `
      INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
      VALUES ($1, $2, $3)
    `;
    await db.query(query, [userId, tokenHash, expiresAt]);
  }

  async findEmailVerificationToken(tokenHash) {
    const query = `
      SELECT * FROM email_verification_tokens 
      WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
    `;
    const { rows } = await db.query(query, [tokenHash]);
    return rows[0];
  }

  async useEmailVerificationToken(id) {
    const query = `
      UPDATE email_verification_tokens SET used_at = now() WHERE id = $1
    `;
    await db.query(query, [id]);
  }

  async createPasswordResetToken(userId, tokenHash, expiresAt) {
    const query = `
      INSERT INTO password_resets (user_id, token_hash, expires_at)
      VALUES ($1, $2, $3)
    `;
    await db.query(query, [userId, tokenHash, expiresAt]);
  }

  async findPasswordResetToken(tokenHash) {
    const query = `
      SELECT * FROM password_resets 
      WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
    `;
    const { rows } = await db.query(query, [tokenHash]);
    return rows[0];
  }

  async usePasswordResetToken(id) {
    const query = `
      UPDATE password_resets SET used_at = now() WHERE id = $1
    `;
    await db.query(query, [id]);
  }

  // --- PENDING USERS (Redis) ---
  async savePendingUser(tokenHash, userData, expiresAt) {
    const key = `pending_user:${tokenHash}`;
    // Calculate expiration in seconds
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
