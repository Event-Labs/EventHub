-- Migration: Create system_settings table for platform-wide admin configurations (AI Auto-Review, etc.)
CREATE TABLE IF NOT EXISTS system_settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID
);

-- Insert default setting for event AI auto-review if not existing
INSERT INTO system_settings (key, value, updated_at)
VALUES (
  'EVENT_AI_AUTO_REVIEW_SETTINGS',
  '{
    "auto_review_enabled": false,
    "auto_approve_enabled": true,
    "auto_reject_enabled": true,
    "auto_notify_organizer": true,
    "min_quality_score": 75,
    "max_risk_score": 25
  }'::jsonb,
  NOW()
)
ON CONFLICT (key) DO NOTHING;
