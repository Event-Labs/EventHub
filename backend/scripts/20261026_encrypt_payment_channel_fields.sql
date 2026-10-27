-- Migration: Đổi kiểu cột lưu trữ thông tin xác thực sang TEXT để hỗ trợ ciphertext mã hóa AES-256-GCM
ALTER TABLE organizer_payment_channels
  ALTER COLUMN api_key_encrypted TYPE TEXT,
  ALTER COLUMN checksum_key_encrypted TYPE TEXT,
  ALTER COLUMN payout_api_key_encrypted TYPE TEXT,
  ALTER COLUMN payout_checksum_key_encrypted TYPE TEXT,
  ALTER COLUMN bank_account_number TYPE TEXT;
