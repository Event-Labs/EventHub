const db = require('../../infrastructure/database/db.client');
const logger = require('../../core/logger');

class AiChatHistoryRepository {
  constructor() {
    this.ensureIndex();
  }

  async ensureIndex() {
    try {
      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_ai_chat_histories_user_id ON ai_chat_histories(user_id);
      `);
      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_ai_chat_histories_session_id ON ai_chat_histories((conversation->>'session_id'));
      `);
    } catch (err) {
      logger.warn(`[AiChatHistoryRepository] Could not ensure indexes: ${err.message}`);
    }
  }

  async findBySessionId(userId, sessionId) {
    if (!userId || !sessionId) return null;
    const { rows } = await db.query(
      `
      SELECT id, user_id, conversation, created_at
      FROM ai_chat_histories
      WHERE user_id = $1
        AND conversation->>'session_id' = $2
      LIMIT 1
      `,
      [userId, String(sessionId)],
    );
    return rows[0] || null;
  }

  async listSessions(userId, limit = 50) {
    if (!userId) return [];
    const { rows } = await db.query(
      `
      SELECT id, user_id, conversation, created_at
      FROM ai_chat_histories
      WHERE user_id = $1
      ORDER BY COALESCE((conversation->>'updated_at')::bigint, (conversation->>'created_at')::bigint, (EXTRACT(EPOCH FROM created_at) * 1000)::bigint) DESC
      LIMIT $2
      `,
      [userId, limit],
    );

    return rows.map((row) => {
      const conv = row.conversation || {};
      const createdAtMs = conv.created_at || (row.created_at ? new Date(row.created_at).getTime() : Date.now());
      const updatedAtMs = conv.updated_at || createdAtMs;

      return {
        id: conv.session_id || row.id,
        dbId: row.id,
        title: conv.title || 'Đoạn chat mới',
        createdAt: Number(createdAtMs),
        updatedAt: Number(updatedAtMs),
        messages: Array.isArray(conv.messages) ? conv.messages : [],
      };
    });
  }

  async upsertSession(userId, { sessionId, title, messages, createdAt, updatedAt }) {
    if (!userId || !sessionId) return null;

    const existing = await this.findBySessionId(userId, sessionId);
    const now = Date.now();
    const finalCreatedAt = Number(createdAt || existing?.conversation?.created_at || now);
    const finalUpdatedAt = Number(updatedAt || now);
    const finalTitle = title || existing?.conversation?.title || 'Đoạn chat mới';

    const conversationObj = {
      session_id: String(sessionId),
      title: finalTitle,
      created_at: finalCreatedAt,
      updated_at: finalUpdatedAt,
      messages: Array.isArray(messages) ? messages : [],
    };

    if (existing) {
      const { rows } = await db.query(
        `
        UPDATE ai_chat_histories
        SET conversation = $2::jsonb
        WHERE id = $1
        RETURNING id, user_id, conversation, created_at
        `,
        [existing.id, JSON.stringify(conversationObj)],
      );
      return rows[0];
    } else {
      const { rows } = await db.query(
        `
        INSERT INTO ai_chat_histories (user_id, conversation, created_at)
        VALUES ($1, $2::jsonb, to_timestamp($3 / 1000.0))
        RETURNING id, user_id, conversation, created_at
        `,
        [userId, JSON.stringify(conversationObj), finalCreatedAt],
      );
      return rows[0];
    }
  }

  async deleteSession(userId, sessionId) {
    if (!userId || !sessionId) return false;
    const { rowCount } = await db.query(
      `
      DELETE FROM ai_chat_histories
      WHERE user_id = $1
        AND conversation->>'session_id' = $2
      `,
      [userId, String(sessionId)],
    );
    return rowCount > 0;
  }

  async deleteAllSessions(userId) {
    if (!userId) return 0;
    const { rowCount } = await db.query(
      `
      DELETE FROM ai_chat_histories
      WHERE user_id = $1
      `,
      [userId],
    );
    return rowCount;
  }
}

module.exports = new AiChatHistoryRepository();
