-- =========================================================
-- MIGRATION: Phase 3 - Merge event_reviews & event_ai_reviews into events
-- =========================================================

-- 1. Add review and AI columns to events
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS review_note TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_recommendation VARCHAR(30),
  ADD COLUMN IF NOT EXISTS ai_warnings JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_reviewed_at TIMESTAMPTZ;

-- 2. Backfill data from event_reviews if table exists
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'event_reviews') THEN
    UPDATE events e
    SET review_note = er.review_note,
        reviewed_at = er.created_at
    FROM (
      SELECT DISTINCT ON (event_id) event_id, review_note, created_at
      FROM event_reviews
      ORDER BY event_id, created_at DESC
    ) er
    WHERE e.id = er.event_id;
  END IF;
END $$;

-- 3. Backfill data from event_ai_reviews if table exists
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'event_ai_reviews') THEN
    UPDATE events e
    SET ai_recommendation = eair.recommendation,
        ai_warnings = eair.warnings,
        ai_reviewed_at = eair.created_at
    FROM (
      SELECT DISTINCT ON (event_id) event_id, recommendation, warnings, created_at
      FROM event_ai_reviews
      ORDER BY event_id, created_at DESC
    ) eair
    WHERE e.id = eair.event_id;
  END IF;
END $$;

-- 4. Drop event_reviews & event_ai_reviews tables
DROP TABLE IF EXISTS event_reviews CASCADE;
DROP TABLE IF EXISTS event_ai_reviews CASCADE;
