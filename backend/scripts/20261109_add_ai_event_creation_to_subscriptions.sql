-- Migration: Add AI event creation feature flag to subscriptions
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS ai_event_creation_enabled BOOLEAN DEFAULT FALSE;
UPDATE subscriptions SET ai_event_creation_enabled = COALESCE(ai_report_enabled, false);

