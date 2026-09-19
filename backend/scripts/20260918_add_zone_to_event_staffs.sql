-- Migration: Add zone column to event_staffs table
ALTER TABLE event_staffs
ADD COLUMN IF NOT EXISTS zone VARCHAR(100);
