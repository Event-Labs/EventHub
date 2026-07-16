ALTER TABLE users
  ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_login_ip VARCHAR(100),
  ADD COLUMN IF NOT EXISTS last_login_user_agent TEXT,
  ADD COLUMN IF NOT EXISTS last_login_device VARCHAR(255),
  ADD COLUMN IF NOT EXISTS last_security_check_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS security_check_result JSONB;

UPDATE users
SET password_changed_at = COALESCE(updated_at, created_at, now())
WHERE password_changed_at IS NULL
  AND password_hash IS NOT NULL
  AND password_hash <> '*';

UPDATE users
SET last_login_ip = 'Localhost (::1)'
WHERE last_login_ip IN ('::1', '127.0.0.1', '::ffff:127.0.0.1');
