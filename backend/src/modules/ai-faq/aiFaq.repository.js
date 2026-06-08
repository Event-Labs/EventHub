const db = require('../../infrastructure/database/db.client');
const crypto = require('crypto');

class AiFaqRepository {
  async findSession(userId, sessionId) {
    const { rows } = await db.query(
      `
      SELECT id, conversation, created_at
      FROM ai_chat_histories
      WHERE user_id = $1
        AND conversation->>'session_id' = $2
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [userId, sessionId],
    );
    return rows[0];
  }

  async createSession(userId, sessionId) {
    const conversation = {
      session_id: sessionId,
      messages: [],
    };

    const { rows } = await db.query(
      `
      INSERT INTO ai_chat_histories (user_id, conversation)
      VALUES ($1, $2::jsonb)
      RETURNING id, conversation, created_at
      `,
      [userId, JSON.stringify(conversation)],
    );
    return rows[0];
  }

  async updateSession(id, conversation) {
    await db.query(
      `
      UPDATE ai_chat_histories
      SET conversation = $2::jsonb
      WHERE id = $1
      `,
      [id, JSON.stringify(conversation)],
    );
  }

  async listRecentSessions(userId, limit = 5) {
    const { rows } = await db.query(
      `
      SELECT id, conversation, created_at
      FROM ai_chat_histories
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
      `,
      [userId, limit],
    );
    return rows;
  }

  generateSessionId() {
    return crypto.randomUUID();
  }
}

module.exports = new AiFaqRepository();