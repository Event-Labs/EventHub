-- Migration: Drop unused platform_fee_configs table and reference in orders
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_platform_fee_config_id_fkey;
ALTER TABLE orders DROP COLUMN IF EXISTS platform_fee_config_id;
DROP TABLE IF EXISTS platform_fee_configs CASCADE;
