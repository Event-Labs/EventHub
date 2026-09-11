-- Migration: Add refunds and AI event review tables

-- Ensure ticket_status_enum has 'REFUNDED'
ALTER TYPE ticket_status_enum ADD VALUE IF NOT EXISTS 'REFUNDED';

-- Ensure order_status_enum has 'REFUND_REQUESTED' and 'REFUNDED'
ALTER TYPE order_status_enum ADD VALUE IF NOT EXISTS 'REFUND_REQUESTED';
ALTER TYPE order_status_enum ADD VALUE IF NOT EXISTS 'REFUNDED';

-- Table: refund_requests
CREATE TABLE IF NOT EXISTS refund_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL,

    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,

    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organizer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    refund_amount NUMERIC(12,2) NOT NULL DEFAULT 0,

    reason TEXT NOT NULL,

    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    -- PENDING, APPROVED, REJECTED, REFUNDED

    refund_method VARCHAR(50) DEFAULT 'MANUAL_BANK_TRANSFER',

    bank_name VARCHAR(100),
    bank_account_number VARCHAR(50),
    bank_account_name VARCHAR(255),

    organizer_note TEXT,
    organizer_proof_url TEXT,
    organizer_transaction_ref VARCHAR(100),

    processed_by_id UUID REFERENCES users(id) ON DELETE SET NULL,

    requested_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    refunded_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refund_requests_customer ON refund_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_organizer ON refund_requests(organizer_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_event ON refund_requests(event_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_order ON refund_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_ticket ON refund_requests(ticket_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_status ON refund_requests(status);

-- Table: event_ai_reviews (AI-Assisted Event Review)
CREATE TABLE IF NOT EXISTS event_ai_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,

    recommendation VARCHAR(30) NOT NULL CHECK (recommendation IN ('APPROVE', 'REJECT', 'NEEDS_REVIEW')),
    warnings JSONB NOT NULL DEFAULT '[]'::jsonb,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_ai_reviews_event_id ON event_ai_reviews(event_id, created_at DESC);
