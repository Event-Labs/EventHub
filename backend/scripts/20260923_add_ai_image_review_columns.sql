-- =========================================================
-- MIGRATION: 20260923_add_ai_image_review_columns.sql
-- Description: Bổ sung các cột phục vụ AI Review Hình ảnh & OCR cho bảng events
-- =========================================================

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS review_status VARCHAR(50) DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS ai_flagged_reasons JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_extracted_text TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS ai_image_review_results JSONB DEFAULT '{}'::jsonb;
