-- =========================================================
-- MIGRATION: Phase 4 - Merge payment_transactions into payment_orders
-- =========================================================

-- 1. Add provider_transaction_id and raw_payload columns to payment_orders
ALTER TABLE payment_orders
  ADD COLUMN IF NOT EXISTS provider_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS raw_payload JSONB DEFAULT '{}'::jsonb;

-- 2. Backfill data from payment_transactions if table exists
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payment_transactions') THEN
    UPDATE payment_orders po
    SET provider_transaction_id = pt.provider_transaction_id,
        raw_payload = pt.raw_payload
    FROM (
      SELECT DISTINCT ON (payment_order_id)
        payment_order_id,
        provider_transaction_id,
        raw_payload
      FROM payment_transactions
      ORDER BY payment_order_id, created_at DESC
    ) pt
    WHERE po.id = pt.payment_order_id;
  END IF;
END $$;

-- 3. Drop payment_transactions table
DROP TABLE IF EXISTS payment_transactions CASCADE;
