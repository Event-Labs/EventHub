-- Migration: Replace custom branding feature with AI seat map generation
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS ai_seat_map_enabled BOOLEAN DEFAULT FALSE;
UPDATE subscriptions SET ai_seat_map_enabled = COALESCE(custom_branding_enabled, false);

