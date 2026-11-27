-- Rollback Migration for Ticket Hold Security & Multi-Account Hoarding Protection
BEGIN;

-- 1. Drop security_activity_logs table & indexes
DROP TABLE IF EXISTS security_activity_logs CASCADE;

-- 2. Drop unique index and performance indexes
DROP INDEX IF EXISTS uq_active_hold_user_event;
DROP INDEX IF EXISTS idx_ticket_hold_sessions_user_status;
DROP INDEX IF EXISTS idx_ticket_hold_sessions_event_status;
DROP INDEX IF EXISTS idx_ticket_hold_sessions_active_expires;
DROP INDEX IF EXISTS idx_ticket_holds_hold_id;
DROP INDEX IF EXISTS idx_ticket_holds_event_id;
DROP INDEX IF EXISTS idx_ticket_holds_user_event_active;

-- 3. Drop foreign key constraint on ticket_holds
ALTER TABLE ticket_holds DROP CONSTRAINT IF EXISTS fk_ticket_holds_hold_session;

-- 4. Drop ticket_hold_sessions table
DROP TABLE IF EXISTS ticket_hold_sessions CASCADE;

-- 5. Drop added columns from ticket_holds
ALTER TABLE ticket_holds DROP COLUMN IF EXISTS hold_id;
ALTER TABLE ticket_holds DROP COLUMN IF EXISTS released_at;
-- Note: event_id is kept if already relied upon, or can be dropped if desired:
-- ALTER TABLE ticket_holds DROP COLUMN IF EXISTS event_id;

COMMIT;
