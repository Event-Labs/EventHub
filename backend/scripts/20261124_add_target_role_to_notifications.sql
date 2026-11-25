-- Migration: Add target_role and metadata to notifications table
-- Date: 2026-11-24

ALTER TABLE notifications 
ADD COLUMN IF NOT EXISTS target_role VARCHAR(20) DEFAULT 'CUSTOMER';

ALTER TABLE notifications 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Create index for fast role-scoped queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_target_role 
ON notifications(user_id, target_role, is_read, created_at DESC);

-- Backfill legacy records based on title and content keywords
UPDATE notifications
SET target_role = 'STAFF'
WHERE (
  title IN ('STAFF_INVITATION', 'Lời mời làm staff', 'Staff Invitation')
  OR content LIKE '%STAFF_INVITATION%'
  OR content LIKE '%Lời mời làm staff%'
) AND (target_role IS NULL OR target_role = 'CUSTOMER');

UPDATE notifications
SET target_role = 'ORGANIZER'
WHERE (
  title ILIKE '%phê duyệt%'
  OR title ILIKE '%bị từ chối%'
  OR title ILIKE '%đã bị ẩn%'
  OR title ILIKE '%đã được khôi phục%'
  OR title ILIKE '%Yêu cầu hoàn tiền vé mới%'
  OR title ILIKE '%Hồ sơ Organizer%'
  OR title ILIKE '%Nhân sự đã chấp nhận lời mời%'
  OR title ILIKE '%Nhân sự đã từ chối lời mời%'
  OR title ILIKE '%Thiết bị ESP32%'
) AND (target_role IS NULL OR target_role = 'CUSTOMER');

-- Ensure remaining rows default to CUSTOMER
UPDATE notifications
SET target_role = 'CUSTOMER'
WHERE target_role IS NULL;
