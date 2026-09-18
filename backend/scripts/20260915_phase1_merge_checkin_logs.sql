-- =========================================================
-- MIGRATION: Phase 1 - Merge checkin_logs into tickets
-- =========================================================

-- 1. Add checkin_method column to tickets
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS checkin_method VARCHAR(20) DEFAULT 'QR';

-- 2. Backfill existing check-in data from checkin_logs if table exists
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'checkin_logs') THEN
    UPDATE tickets t
    SET checkin_method = COALESCE(cl.method::text, 'QR')
    FROM checkin_logs cl
    WHERE cl.ticket_id = t.id;
  END IF;
END $$;

-- 3. Drop checkin_logs table
DROP TABLE IF EXISTS checkin_logs CASCADE;
