-- Migration: Add event_content_generations table for AI Content Generation

CREATE TABLE IF NOT EXISTS event_content_generations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    organizer_id UUID NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,

    prompt_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    generated_content JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_content_generations_org ON event_content_generations(organizer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_content_generations_event ON event_content_generations(event_id);
