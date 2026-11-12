-- Add waiting_room_config JSONB column to events table
-- Schema: {
--   "enabled": boolean,
--   "max_active": number,
--   "session_duration_seconds": number,
--   "poll_interval_ms": number,
--   "admission_batch_size": number
-- }
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS waiting_room_config JSONB DEFAULT NULL;

COMMENT ON COLUMN events.waiting_room_config IS 'Configuration for Virtual Waiting Room queue system';

