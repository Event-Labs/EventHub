ALTER TABLE organizer_requests
  ADD COLUMN IF NOT EXISTS request_action VARCHAR(50) NOT NULL DEFAULT 'APPLICATION',
  ADD COLUMN IF NOT EXISTS change_summary TEXT;

UPDATE organizer_requests
SET request_action = 'APPLICATION'
WHERE request_action IS NULL;
