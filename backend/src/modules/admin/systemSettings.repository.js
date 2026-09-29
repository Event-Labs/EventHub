const db = require('../../infrastructure/database/db.client');
const logger = require('../../core/logger');

const DEFAULT_AI_AUTO_REVIEW_SETTINGS = {
  auto_review_enabled: false,
  auto_approve_enabled: true,
  auto_reject_enabled: true,
  auto_notify_organizer: true,
  min_quality_score: 75,
  max_risk_score: 25,
};

class SystemSettingsRepository {
  async ensureTable() {
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS system_settings (
          key VARCHAR(100) PRIMARY KEY,
          value JSONB NOT NULL DEFAULT '{}'::jsonb,
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          updated_by UUID
        )
      `);
    } catch (err) {
      logger.warn(`[SystemSettingsRepository] ensureTable warning: ${err.message}`);
    }
  }

  async getSetting(key, defaultValue = null) {
    await this.ensureTable();
    try {
      const { rows } = await db.query(
        `SELECT key, value, updated_at, updated_by FROM system_settings WHERE key = $1 LIMIT 1`,
        [key],
      );
      if (rows[0] && rows[0].value) {
        return rows[0].value;
      }
      return defaultValue;
    } catch (err) {
      logger.warn(`[SystemSettingsRepository] Error reading setting ${key}: ${err.message}`);
      return defaultValue;
    }
  }

  async saveSetting(key, value, updatedBy = null) {
    await this.ensureTable();
    const { rows } = await db.query(
      `
      INSERT INTO system_settings (key, value, updated_at, updated_by)
      VALUES ($1, $2, NOW(), $3)
      ON CONFLICT (key)
      DO UPDATE SET value = $2, updated_at = NOW(), updated_by = $3
      RETURNING key, value, updated_at, updated_by
      `,
      [key, JSON.stringify(value), updatedBy],
    );
    return rows[0]?.value ?? value;
  }

  async getAutoReviewSettings() {
    const setting = await this.getSetting('EVENT_AI_AUTO_REVIEW_SETTINGS', DEFAULT_AI_AUTO_REVIEW_SETTINGS);
    return {
      ...DEFAULT_AI_AUTO_REVIEW_SETTINGS,
      ...(setting || {}),
    };
  }

  async saveAutoReviewSettings(settings, updatedBy = null) {
    const current = await this.getAutoReviewSettings();
    const merged = {
      ...current,
      ...settings,
    };
    return this.saveSetting('EVENT_AI_AUTO_REVIEW_SETTINGS', merged, updatedBy);
  }

  async getAutoReviewStats() {
    try {
      const { rows } = await db.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'PENDING_REVIEW')::int AS pending_count,
          COUNT(*) FILTER (WHERE approval_status = 'APPROVED' AND review_note LIKE '%[TỰ ĐỘNG%')::int AS auto_approved_count,
          COUNT(*) FILTER (WHERE approval_status = 'REJECTED' AND review_note LIKE '%[TỰ ĐỘNG%')::int AS auto_rejected_count,
          COUNT(*) FILTER (WHERE ai_recommendation IS NOT NULL)::int AS total_ai_reviewed_count
        FROM events
        WHERE deleted_at IS NULL
      `);
      return rows[0] || {
        pending_count: 0,
        auto_approved_count: 0,
        auto_rejected_count: 0,
        total_ai_reviewed_count: 0,
      };
    } catch (err) {
      logger.warn(`[SystemSettingsRepository] Error fetching auto review stats: ${err.message}`);
      return {
        pending_count: 0,
        auto_approved_count: 0,
        auto_rejected_count: 0,
        total_ai_reviewed_count: 0,
      };
    }
  }

  async getPendingEventIds() {
    const { rows } = await db.query(`
      SELECT id, title FROM events
      WHERE status = 'PENDING_REVIEW'
        AND deleted_at IS NULL
      ORDER BY created_at ASC
    `);
    return rows;
  }
}

module.exports = new SystemSettingsRepository();
