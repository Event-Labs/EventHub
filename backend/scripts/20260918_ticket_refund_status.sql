-- Migration: Add REFUND_PENDING to ticket_status_enum and ensure indexes

-- Ensure ticket_status_enum has 'REFUND_PENDING'
ALTER TYPE ticket_status_enum ADD VALUE IF NOT EXISTS 'REFUND_PENDING';

-- Ensure indexes on refund_requests
CREATE INDEX IF NOT EXISTS idx_refund_requests_customer ON refund_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_organizer ON refund_requests(organizer_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_event ON refund_requests(event_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_order ON refund_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_ticket ON refund_requests(ticket_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_status ON refund_requests(status);
