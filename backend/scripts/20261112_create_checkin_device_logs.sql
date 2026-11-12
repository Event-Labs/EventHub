-- =========================================================
-- MIGRATION: 20261112_create_checkin_device_logs.sql
-- Description:
--   Tạo bảng checkin_device_logs lưu toàn bộ lịch sử quét QR/check-in của từng thiết bị ESP32-S3
--   (cả thành công, chỉ xác thực và thất bại) để Admin Web và chính ESP32 đều truy vấn được.
-- =========================================================

CREATE TABLE IF NOT EXISTS checkin_device_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES checkin_devices(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL,
  ticket_code VARCHAR(100),
  qr_code_raw VARCHAR(255),
  action VARCHAR(20) NOT NULL DEFAULT 'auto',
  result VARCHAR(40) NOT NULL,
  success BOOLEAN NOT NULL DEFAULT false,
  message VARCHAR(255),
  attendee_name VARCHAR(255),
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkin_device_logs_device_scanned
  ON checkin_device_logs(device_id, scanned_at DESC);

CREATE INDEX IF NOT EXISTS idx_checkin_device_logs_device_result
  ON checkin_device_logs(device_id, result, scanned_at DESC);

CREATE INDEX IF NOT EXISTS idx_checkin_device_logs_event
  ON checkin_device_logs(event_id, scanned_at DESC);

-- Đồng bộ dữ liệu lịch sử cũ từ tickets.checked_in_device_id (nếu đã có check-in trước migration)
INSERT INTO checkin_device_logs (
  device_id,
  event_id,
  ticket_id,
  ticket_code,
  action,
  result,
  success,
  message,
  attendee_name,
  scanned_at
)
SELECT
  t.checked_in_device_id,
  t.event_id,
  t.id,
  t.ticket_code,
  'auto',
  'OK',
  true,
  'Check-in thanh cong',
  COALESCE(t.attendee_name, o.buyer_name),
  COALESCE(t.checked_in_at, t.created_at, NOW())
FROM tickets t
LEFT JOIN order_items oi ON oi.id = t.order_item_id
LEFT JOIN orders o ON o.id = oi.order_id
WHERE t.checked_in_device_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM checkin_device_logs l
    WHERE l.device_id = t.checked_in_device_id
      AND l.ticket_id = t.id
      AND l.result = 'OK'
  );

