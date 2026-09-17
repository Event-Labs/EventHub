-- =========================================================
-- MIGRATION: Phase 2 Extension - Merge promo_code_events into promo_codes
-- =========================================================

-- 1. Add event_ids array column to promo_codes
ALTER TABLE promo_codes
  ADD COLUMN IF NOT EXISTS event_ids UUID[] DEFAULT '{}';

-- 2. Backfill data from promo_code_events if table exists
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'promo_code_events') THEN
    UPDATE promo_codes pc
    SET event_ids = sub.events
    FROM (
      SELECT promo_code_id, array_agg(event_id ORDER BY event_id) AS events
      FROM promo_code_events
      GROUP BY promo_code_id
    ) sub
    WHERE pc.id = sub.promo_code_id;
  END IF;
END $$;

-- 3. If event_ids is still empty but event_id IS NOT NULL, populate array
UPDATE promo_codes
SET event_ids = ARRAY[event_id]
WHERE (event_ids IS NULL OR cardinality(event_ids) = 0)
  AND event_id IS NOT NULL;

-- 4. Drop promo_code_events table
DROP TABLE IF EXISTS promo_code_events CASCADE;
