-- Migration: Add refund_policy_snapshot to tickets, and add refund_rate and policy_snapshot to refund_requests

-- 1. Add refund_policy_snapshot to tickets
ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS refund_policy_snapshot JSONB DEFAULT NULL;

-- 2. Add refund_rate and policy_snapshot to refund_requests
ALTER TABLE refund_requests 
ADD COLUMN IF NOT EXISTS refund_rate NUMERIC DEFAULT NULL;

ALTER TABLE refund_requests 
ADD COLUMN IF NOT EXISTS policy_snapshot JSONB DEFAULT NULL;
