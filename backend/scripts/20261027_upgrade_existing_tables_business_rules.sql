-- ============================================================================
-- Migration: Upgrade existing tables for EventHub Business Rules Specification
-- ZERO NEW TABLES - Extends events, orders, order_items, payment_orders, refund_requests
-- ============================================================================

-- 1. Upgrade ticket_hold_status_enum to include 'RELEASED'
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'RELEASED' 
      AND enumtypid = 'ticket_hold_status_enum'::regtype
  ) THEN
    ALTER TYPE ticket_hold_status_enum ADD VALUE 'RELEASED';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'REFUND_REQUESTED' 
      AND enumtypid = 'ticket_status_enum'::regtype
  ) THEN
    ALTER TYPE ticket_status_enum ADD VALUE 'REFUND_REQUESTED';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'sales_status_enum'
  ) THEN
    CREATE TYPE sales_status_enum AS ENUM (
      'NOT_STARTED',
      'ON_SALE',
      'PAUSED',
      'CLOSED',
      'ENDED',
      'CANCELLED'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'display_state_enum'
  ) THEN
    CREATE TYPE display_state_enum AS ENUM (
      'VISIBLE',
      'HIDDEN_BY_ORGANIZER',
      'SUSPENDED_BY_ADMIN'
    );
  END IF;
END $$;

-- 2. Upgrade events table with multi-axis states, JSONB sales blocks, revisions, cancel requests, audit trail
ALTER TABLE events 
  ADD COLUMN IF NOT EXISTS display_state display_state_enum DEFAULT 'VISIBLE'::display_state_enum,
  ADD COLUMN IF NOT EXISTS hidden_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS hidden_reason TEXT,
  ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sales_status sales_status_enum DEFAULT 'NOT_STARTED'::sales_status_enum,
  ADD COLUMN IF NOT EXISTS sales_blocks JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS pending_revision JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS revision_history JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cancel_request JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cancel_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS cancel_reason_code VARCHAR(100),
  ADD COLUMN IF NOT EXISTS cancel_reason_note TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_obligation_status VARCHAR(50) DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS audit_trail JSONB DEFAULT '[]'::jsonb;

-- 3. Upgrade orders table
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS status_reason VARCHAR(100),
  ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(15, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS policy_version VARCHAR(50) DEFAULT '1.0';

-- 4. Upgrade order_items table
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(15, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refundable_amount NUMERIC(15, 2);

-- Backfill refundable_amount for existing order_items
UPDATE order_items 
SET refundable_amount = COALESCE(final_price, unit_price * quantity, 0)
WHERE refundable_amount IS NULL;

-- 5. Upgrade payment_orders table for PayOS counterAccount data and refund tracking
ALTER TABLE payment_orders
  ADD COLUMN IF NOT EXISTS payer_bank_id VARCHAR(50),
  ADD COLUMN IF NOT EXISTS payer_account_number TEXT,
  ADD COLUMN IF NOT EXISTS payer_account_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(15, 2) DEFAULT 0;

-- 6. Upgrade refund_requests table
ALTER TABLE refund_requests
  ADD COLUMN IF NOT EXISTS execution_mode VARCHAR(50) DEFAULT 'ORGANIZER_MANUAL',
  ADD COLUMN IF NOT EXISTS refund_destination_source VARCHAR(50) DEFAULT 'PAYER_ACCOUNT',
  ADD COLUMN IF NOT EXISTS ready_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disputed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS dispute_reason TEXT,
  ADD COLUMN IF NOT EXISTS disputed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_code VARCHAR(100),
  ADD COLUMN IF NOT EXISTS gateway_refund_ref VARCHAR(100),
  ADD COLUMN IF NOT EXISTS failure_code VARCHAR(100),
  ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS audit_trail JSONB DEFAULT '[]'::jsonb;

-- 7. Data migration & initial normalization for existing events
-- Events currently marked HIDDEN -> display_state = HIDDEN_BY_ORGANIZER & sales_status = PAUSED with block
UPDATE events 
SET display_state = 'HIDDEN_BY_ORGANIZER', 
    sales_status = 'PAUSED',
    sales_blocks = jsonb_build_array(
      jsonb_build_object(
        'id', uuid_generate_v4(),
        'reason', 'HIDE',
        'source', 'ORGANIZER',
        'created_at', NOW(),
        'created_by', organizer_id
      )
    )
WHERE status::text = 'HIDDEN' AND (sales_blocks IS NULL OR jsonb_array_length(sales_blocks) = 0);

-- Events currently PUBLISHED
UPDATE events 
SET sales_status = 'ON_SALE' 
WHERE status::text = 'PUBLISHED' AND sales_status = 'NOT_STARTED';

-- Events currently CANCELLED or COMPLETED
UPDATE events 
SET sales_status = 'CLOSED' 
WHERE status::text IN ('CANCELLED', 'COMPLETED') AND sales_status != 'CLOSED';
