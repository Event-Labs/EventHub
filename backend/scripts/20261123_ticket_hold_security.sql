-- Ticket Hold Security & Multi-Account Hoarding Protection Migration
BEGIN;

-- 1. Add event_id, hold_id, and released_at to ticket_holds if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ticket_holds' AND column_name = 'event_id'
  ) THEN
    ALTER TABLE ticket_holds ADD COLUMN event_id UUID REFERENCES events(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ticket_holds' AND column_name = 'hold_id'
  ) THEN
    ALTER TABLE ticket_holds ADD COLUMN hold_id UUID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ticket_holds' AND column_name = 'released_at'
  ) THEN
    ALTER TABLE ticket_holds ADD COLUMN released_at TIMESTAMPTZ;
  END IF;
END $$;

-- 2. Backfill event_id in ticket_holds
UPDATE ticket_holds th
SET event_id = es.event_id
FROM ticket_types tt
JOIN event_sessions es ON es.id = tt.event_session_id
WHERE th.ticket_type_id = tt.id
  AND th.event_id IS NULL;

-- 3. Create ticket_hold_sessions table
CREATE TABLE IF NOT EXISTS ticket_hold_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  status ticket_hold_status_enum NOT NULL DEFAULT 'ACTIVE',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at TIMESTAMPTZ,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- 4. Add foreign key for hold_id in ticket_holds
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_ticket_holds_hold_session'
  ) THEN
    ALTER TABLE ticket_holds
    ADD CONSTRAINT fk_ticket_holds_hold_session
    FOREIGN KEY (hold_id) REFERENCES ticket_hold_sessions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 5. Comprehensive Inventory Reconciliation before constraint creation:
-- 5a. Deduplicate multiple ACTIVE sessions per user per event, cascading expiration
-- to associated ticket_holds and releasing occupied session_seats
WITH duplicate_active_sessions AS (
  SELECT id, user_id, event_id, ROW_NUMBER() OVER (PARTITION BY user_id, event_id ORDER BY created_at DESC) AS rn
  FROM ticket_hold_sessions
  WHERE status = 'ACTIVE'
),
expired_duplicate_sessions AS (
  UPDATE ticket_hold_sessions
  SET status = 'EXPIRED', updated_at = NOW()
  WHERE id IN (SELECT id FROM duplicate_active_sessions WHERE rn > 1)
  RETURNING id
),
expired_duplicate_holds AS (
  UPDATE ticket_holds
  SET status = 'EXPIRED', released_at = NOW(), updated_at = NOW()
  WHERE (hold_id IN (SELECT id FROM expired_duplicate_sessions) OR (status = 'ACTIVE' AND expires_at <= NOW()))
    AND status = 'ACTIVE'
  RETURNING id, session_seat_id
)
UPDATE session_seats ss
SET status = 'AVAILABLE', held_by = NULL, held_until = NULL, order_id = NULL, updated_at = NOW()
WHERE (
  ss.id IN (SELECT session_seat_id FROM expired_duplicate_holds WHERE session_seat_id IS NOT NULL)
  OR (ss.status = 'HELD' AND ss.order_id IS NULL AND ss.held_until <= NOW())
)
AND ss.status = 'HELD'
AND ss.order_id IS NULL;

-- 5b. Clean up orphan active ticket_holds whose session is not ACTIVE
WITH orphan_active_holds AS (
  UPDATE ticket_holds th
  SET status = 'EXPIRED', released_at = NOW(), updated_at = NOW()
  FROM ticket_hold_sessions ths
  WHERE th.hold_id = ths.id
    AND th.status = 'ACTIVE'
    AND ths.status IN ('EXPIRED', 'CANCELLED', 'RELEASED')
  RETURNING th.id, th.session_seat_id
)
UPDATE session_seats ss
SET status = 'AVAILABLE', held_by = NULL, held_until = NULL, order_id = NULL, updated_at = NOW()
WHERE ss.id IN (SELECT session_seat_id FROM orphan_active_holds WHERE session_seat_id IS NOT NULL)
  AND ss.status = 'HELD'
  AND ss.order_id IS NULL;

-- 6. Add Unique Index: exactly one ACTIVE hold session per user per event
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_hold_user_event
ON ticket_hold_sessions (user_id, event_id)
WHERE status = 'ACTIVE';

-- 7. Add performance indexes for ticket_hold_sessions
CREATE INDEX IF NOT EXISTS idx_ticket_hold_sessions_user_status ON ticket_hold_sessions (user_id, status);
CREATE INDEX IF NOT EXISTS idx_ticket_hold_sessions_event_status ON ticket_hold_sessions (event_id, status);
CREATE INDEX IF NOT EXISTS idx_ticket_hold_sessions_active_expires ON ticket_hold_sessions (expires_at) WHERE status = 'ACTIVE';

-- 8. Add indexes for ticket_holds
CREATE INDEX IF NOT EXISTS idx_ticket_holds_hold_id ON ticket_holds (hold_id);
CREATE INDEX IF NOT EXISTS idx_ticket_holds_event_id ON ticket_holds (event_id);
CREATE INDEX IF NOT EXISTS idx_ticket_holds_user_event_active ON ticket_holds (user_id, event_id) WHERE status = 'ACTIVE';

-- 9. Create security_activity_logs table
CREATE TABLE IF NOT EXISTS security_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  risk_score INTEGER DEFAULT 0,
  ip_address VARCHAR(100),
  user_agent TEXT,
  device_id VARCHAR(255),
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_logs_user_action ON security_activity_logs (user_id, action, created_at);
CREATE INDEX IF NOT EXISTS idx_security_logs_ip_created ON security_activity_logs (ip_address, created_at);
CREATE INDEX IF NOT EXISTS idx_security_logs_device_created ON security_activity_logs (device_id, created_at);

COMMIT;
