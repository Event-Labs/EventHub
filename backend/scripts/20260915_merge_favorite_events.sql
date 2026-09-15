-- Migration: Merge favorite_events into users.favorite_event_ids array

-- 1. Add favorite_event_ids array column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS favorite_event_ids UUID[] DEFAULT '{}'::uuid[];

-- 2. Migrate existing favorites data into users.favorite_event_ids
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'favorite_events') THEN
    UPDATE users u
    SET favorite_event_ids = COALESCE(
      (
        SELECT array_agg(fe.event_id ORDER BY fe.created_at DESC)
        FROM favorite_events fe
        WHERE fe.user_id = u.id
      ),
      '{}'::uuid[]
    );
  END IF;
END $$;

-- 3. Create GIN index for fast array containment search
CREATE INDEX IF NOT EXISTS idx_users_favorite_event_ids ON users USING GIN(favorite_event_ids);

-- 4. Drop favorite_events table
DROP TABLE IF EXISTS favorite_events CASCADE;
