-- =========================================================
-- MIGRATION: 20261112_add_event_ai_review_logs.sql
-- Description:
--   1. Tạo bảng event_ai_review_logs lưu lịch sử AI review và thu thập mẫu DPO khi Admin duyệt đè.
--   2. Dọn dẹp dữ liệu lệch trên bảng events (các sự kiện DRAFT bị Image Pre-scan ghi đè ai_recommendation).
-- =========================================================

CREATE TABLE IF NOT EXISTS event_ai_review_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  review_stage VARCHAR(30) NOT NULL CHECK (review_stage IN ('FULL_REVIEW', 'IMAGE_PRESCAN')),
  model_name VARCHAR(100),
  criteria_snapshot JSONB DEFAULT '[]'::jsonb,
  input_snapshot JSONB DEFAULT '{}'::jsonb,
  raw_output TEXT,
  parsed_output JSONB DEFAULT '{}'::jsonb,
  ai_recommendation VARCHAR(30) CHECK (ai_recommendation IS NULL OR ai_recommendation IN ('APPROVE', 'REJECT', 'NEEDS_REVIEW')),
  risk_score INTEGER,
  quality_score INTEGER,
  human_decision VARCHAR(30) CHECK (human_decision IS NULL OR human_decision IN ('APPROVED', 'REJECTED')),
  human_override BOOLEAN NOT NULL DEFAULT false,
  human_review_note TEXT,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  is_exported_for_training BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_ai_review_logs_event_stage_created
  ON event_ai_review_logs(event_id, review_stage, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_ai_review_logs_override_exported
  ON event_ai_review_logs(human_override, is_exported_for_training);

-- Đặt lại ai_recommendation = NULL (và ai_reviewed_at = NULL) cho các sự kiện DRAFT
-- chưa có ai_warnings chuẩn của Full Review (khắc phục dữ liệu bị Image Pre-scan ghi đè).
UPDATE events
SET ai_recommendation = NULL,
    ai_reviewed_at    = NULL
WHERE status = 'DRAFT'
  AND ai_recommendation IS NOT NULL
  AND (
    ai_warnings IS NULL
    OR jsonb_typeof(ai_warnings) <> 'object'
    OR ai_warnings = '{}'::jsonb
  );

