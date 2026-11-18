-- =========================================================
-- MIGRATION: 20261118_add_staff_scan_logs.sql
-- Description:
--   Mở rộng bảng checkin_device_logs để lưu toàn bộ lượt quét / check-in của Staff
--   (cả OK, VERIFIED, USED, INVALID_QR, NOT_FOUND, WRONG_EVENT, ...) giống như thiết bị IoT,
--   giúp Staff Web, trạm IoT và Admin đồng bộ đầy đủ mọi lượt quét khi chung cổng.
-- =========================================================

-- 1. Cho phép device_id có thể NULL (khi lượt quét do Staff thực hiện)
ALTER TABLE checkin_device_logs
  ALTER COLUMN device_id DROP NOT NULL;

-- 2. Bổ sung staff_id và source ('IOT' | 'STAFF')
ALTER TABLE checkin_device_logs
  ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source VARCHAR(16) NOT NULL DEFAULT 'IOT';

-- 3. Chuẩn hóa cột source cho các bản ghi hiện có
UPDATE checkin_device_logs
SET source = CASE
  WHEN device_id IS NULL AND staff_id IS NOT NULL THEN 'STAFF'
  ELSE 'IOT'
END
WHERE source IS NULL
   OR source NOT IN ('IOT', 'STAFF');

-- 4. Index phục vụ truy vấn lịch sử theo Staff và theo Cổng
CREATE INDEX IF NOT EXISTS idx_checkin_device_logs_staff_scanned
  ON checkin_device_logs (staff_id, scanned_at DESC)
  WHERE staff_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_checkin_device_logs_source_event_gate
  ON checkin_device_logs (source, event_id, gate_id, scanned_at DESC);

-- 5. Backfill các lượt check-in thành công cũ của Staff từ bảng tickets (idempotent)
INSERT INTO checkin_device_logs (
  device_id,
  staff_id,
  source,
  event_id,
  ticket_id,
  ticket_code,
  action,
  result,
  success,
  message,
  attendee_name,
  gate_id,
  gate_name,
  scanned_at
)
SELECT
  NULL,
  t.checked_in_by,
  'STAFF',
  t.event_id,
  t.id,
  t.ticket_code,
  LOWER(COALESCE(t.checkin_method, 'qr')),
  'OK',
  true,
  'Check-in thanh cong',
  COALESCE(t.attendee_name, o.buyer_name),
  COALESCE(t.checked_in_gate_id, es.gate_id),
  COALESCE(tg.name, t.checked_in_gate, esg.name, es.gate),
  COALESCE(t.checked_in_at, t.created_at, NOW())
FROM tickets t
LEFT JOIN order_items oi ON oi.id = t.order_item_id
LEFT JOIN orders o ON o.id = oi.order_id
LEFT JOIN event_staffs es ON es.event_id = t.event_id AND es.staff_id = t.checked_in_by
LEFT JOIN event_gates esg ON esg.id = es.gate_id
LEFT JOIN event_gates tg ON tg.id = t.checked_in_gate_id
WHERE t.status = 'USED'
  AND t.checked_in_by IS NOT NULL
  AND t.checked_in_device_id IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM checkin_device_logs l
    WHERE l.ticket_id = t.id
      AND l.result = 'OK'
      AND (l.source = 'STAFF' OR l.staff_id IS NOT NULL)
  );

