-- Add seating rules for assigned-seat purchase constraints.
ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS seating_rules jsonb NOT NULL DEFAULT '{}'::jsonb;
