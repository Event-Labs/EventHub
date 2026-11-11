-- Migration: Add direct sale time window to event_sessions
-- Idempotent column additions for direct sales allowed window

ALTER TABLE event_sessions
  ADD COLUMN IF NOT EXISTS direct_sale_start_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS direct_sale_end_time TIMESTAMPTZ;

