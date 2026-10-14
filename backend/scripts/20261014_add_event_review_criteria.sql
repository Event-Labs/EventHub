-- Migration: Add event_review_criteria table for Admin AI Review config

CREATE TABLE IF NOT EXISTS event_review_criteria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'GENERAL',
  severity VARCHAR(20) NOT NULL DEFAULT 'CRITICAL',
  rule_content TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  updated_by UUID
);

CREATE INDEX IF NOT EXISTS idx_event_review_criteria_active_order 
  ON event_review_criteria(is_active, order_index);
