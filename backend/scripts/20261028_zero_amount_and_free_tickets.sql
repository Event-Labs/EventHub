-- Migration: Zero Amount Checkout and Free Ticket Foundation
-- Idempotent schema upgrades for orders and tickets

-- 1. Orders table updates
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR,
  ADD COLUMN IF NOT EXISTS complimentary_reason TEXT,
  ADD COLUMN IF NOT EXISTS audit_trail JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS staff_user_id UUID REFERENCES users(id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_user_idempotency
  ON orders(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_orders_amounts_non_negative'
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT chk_orders_amounts_non_negative
      CHECK (subtotal >= 0 AND discount_amount >= 0 AND total_amount >= 0) NOT VALID;
    ALTER TABLE orders VALIDATE CONSTRAINT chk_orders_amounts_non_negative;
  END IF;
END $$;

-- 2. Tickets table updates (snapshot price columns have NO default 0)
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS ticket_source VARCHAR DEFAULT 'STANDARD',
  ADD COLUMN IF NOT EXISTS original_price NUMERIC,
  ADD COLUMN IF NOT EXISTS discount_allocated NUMERIC,
  ADD COLUMN IF NOT EXISTS payable_price NUMERIC;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_tickets_amounts_non_negative'
  ) THEN
    ALTER TABLE tickets ADD CONSTRAINT chk_tickets_amounts_non_negative
      CHECK (
        (original_price IS NULL OR original_price >= 0) AND
        (discount_allocated IS NULL OR discount_allocated >= 0) AND
        (payable_price IS NULL OR payable_price >= 0)
      ) NOT VALID;
    ALTER TABLE tickets VALIDATE CONSTRAINT chk_tickets_amounts_non_negative;
  END IF;
END $$;

