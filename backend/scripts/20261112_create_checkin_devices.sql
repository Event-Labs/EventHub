-- =========================================================
-- MIGRATION: 20261112_create_checkin_devices.sql
-- Description:
--   1. Tạo bảng checkin_devices phục vụ quản lý thiết bị check-in phần cứng ESP32-S3.
--   2. Thêm cột checked_in_device_id vào bảng tickets để ghi nhận thiết bị thực hiện check-in.
-- =========================================================

CREATE TABLE IF NOT EXISTS checkin_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mac_address VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(120),
  hardware VARCHAR(80),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'ACTIVE', 'DISABLED', 'REVOKED')),
  pairing_code VARCHAR(12),
  claim_token_hash VARCHAR(64),
  pairing_expires_at TIMESTAMPTZ,
  secret_hash VARCHAR(64),
  pending_secret_plain TEXT,
  pending_secret_expires_at TIMESTAMPTZ,
  assigned_event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  auto_confirm BOOLEAN NOT NULL DEFAULT false,
  config_version INTEGER NOT NULL DEFAULT 1,
  firmware_version VARCHAR(64),
  last_ip VARCHAR(64),
  last_rssi INTEGER,
  last_free_heap INTEGER,
  last_uptime_sec INTEGER,
  last_seen_at TIMESTAMPTZ,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkin_devices_status
  ON checkin_devices(status);

CREATE INDEX IF NOT EXISTS idx_checkin_devices_assigned_event
  ON checkin_devices(assigned_event_id);

CREATE INDEX IF NOT EXISTS idx_checkin_devices_pairing_code
  ON checkin_devices(pairing_code)
  WHERE pairing_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_checkin_devices_last_seen
  ON checkin_devices(last_seen_at DESC);

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS checked_in_device_id UUID REFERENCES checkin_devices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_checked_in_device_id
  ON tickets(checked_in_device_id)
  WHERE checked_in_device_id IS NOT NULL;

