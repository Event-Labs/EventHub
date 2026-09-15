-- =========================================================
-- MIGRATION: Phase 2 - Drop promo_code_usages and sync promo_codes.used_count
-- =========================================================

-- 1. Sync promo_codes.used_count with actual PAID orders count if any
UPDATE promo_codes pc
SET used_count = (
  SELECT COUNT(*)::int
  FROM orders o
  WHERE o.promo_code_id = pc.id
    AND o.status = 'PAID'
);

-- 2. Drop promo_code_usages table
DROP TABLE IF EXISTS promo_code_usages CASCADE;
