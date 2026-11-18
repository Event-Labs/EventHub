-- =========================================================
-- MIGRATION: 20261118_create_event_gates_and_sync_iot.sql
-- Description:
--   1. Tạo bảng event_gates lưu danh sách cổng check-in của từng sự kiện do Organizer thiết lập.
--   2. Thêm cột gate_id vào event_staffs và đồng bộ dữ liệu gate hiện có sang event_gates.
--   3. Thêm cột assigned_gate_id, assigned_gate vào checkin_devices để phân cổng cho thiết bị IoT.
--   4. Thêm cột checked_in_gate_id, checked_in_gate vào tickets và gate_id, gate_name vào checkin_device_logs
--      để đồng bộ lịch sử check-in giữa Staff và thiết bị IoT chung cổng.
-- =========================================================

CREATE TABLE IF NOT EXISTS event_gates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_event_gates_event_lower_name
  ON event_gates (event_id, LOWER(TRIM(name)));

CREATE INDEX IF NOT EXISTS idx_event_gates_event_id
  ON event_gates (event_id, sort_order ASC, created_at ASC);

-- 2. Liên kết event_staffs với event_gates
ALTER TABLE event_staffs
  ADD COLUMN IF NOT EXISTS gate_id UUID REFERENCES event_gates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_event_staffs_event_gate
  ON event_staffs (event_id, gate_id);

-- Backfill các cổng đã từng nhập tay ở event_staffs sang bảng event_gates
INSERT INTO event_gates (event_id, name, sort_order)
SELECT DISTINCT
  es.event_id,
  TRIM(es.gate) AS name,
  0
FROM event_staffs es
JOIN events e ON e.id = es.event_id
WHERE es.gate IS NOT NULL
  AND TRIM(es.gate) <> ''
ON CONFLICT (event_id, (LOWER(TRIM(name)))) DO NOTHING;

-- Gán gate_id cho các bản ghi event_staffs cũ có gate trùng tên trong event_gates
UPDATE event_staffs es
SET gate_id = eg.id,
    gate = eg.name
FROM event_gates eg
WHERE es.event_id = eg.event_id
  AND es.gate_id IS NULL
  AND es.gate IS NOT NULL
  AND LOWER(TRIM(es.gate)) = LOWER(TRIM(eg.name));

-- 3. Liên kết checkin_devices với event_gates
ALTER TABLE checkin_devices
  ADD COLUMN IF NOT EXISTS assigned_gate_id UUID REFERENCES event_gates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_gate VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_checkin_devices_event_gate
  ON checkin_devices (assigned_event_id, assigned_gate_id);

-- 4. Lưu cổng check-in trên tickets và checkin_device_logs
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS checked_in_gate_id UUID REFERENCES event_gates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS checked_in_gate VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_tickets_event_checked_in_gate
  ON tickets (event_id, checked_in_gate_id, checked_in_at DESC)
  WHERE status = 'USED';

ALTER TABLE checkin_device_logs
  ADD COLUMN IF NOT EXISTS gate_id UUID REFERENCES event_gates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gate_name VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_checkin_device_logs_event_gate
  ON checkin_device_logs (event_id, gate_id, scanned_at DESC);

