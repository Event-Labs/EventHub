-- Migration: Refactor event_ai_reviews to minimal streamlined schema

DROP TABLE IF EXISTS event_ai_reviews CASCADE;

CREATE TABLE IF NOT EXISTS event_ai_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,

    recommendation VARCHAR(30) NOT NULL CHECK (recommendation IN ('APPROVE', 'REJECT', 'NEEDS_REVIEW')),
    warnings JSONB NOT NULL DEFAULT '[]'::jsonb,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_ai_reviews_event_id ON event_ai_reviews(event_id, created_at DESC);
