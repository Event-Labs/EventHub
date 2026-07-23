-- Fields used by the staff direct-booking flow.
-- Keep this migration idempotent so it can safely be run on existing
-- installations and during a deployment.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS created_by_staff_id UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS created_by_staff_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS created_by_role VARCHAR(40),
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(40),
  ADD COLUMN IF NOT EXISTS internal_note TEXT,
  ADD COLUMN IF NOT EXISTS booking_source VARCHAR(40);
