-- Migration: Add gate column to event_staffs table
ALTER TABLE event_staffs
ADD COLUMN IF NOT EXISTS gate VARCHAR(100);
