-- Down Migration: Rollback Zero Amount Checkout and Free Ticket Foundation

-- 1. Remove check constraints
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS chk_tickets_amounts_non_negative;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_orders_amounts_non_negative;

-- 2. Remove unique index
DROP INDEX IF EXISTS uq_orders_user_idempotency;

-- 3. Remove columns from tickets
ALTER TABLE tickets
  DROP COLUMN IF EXISTS payable_price,
  DROP COLUMN IF EXISTS discount_allocated,
  DROP COLUMN IF EXISTS original_price,
  DROP COLUMN IF EXISTS ticket_source;

-- 4. Remove columns from orders
ALTER TABLE orders
  DROP COLUMN IF EXISTS staff_user_id,
  DROP COLUMN IF EXISTS audit_trail,
  DROP COLUMN IF EXISTS complimentary_reason,
  DROP COLUMN IF EXISTS idempotency_key;

