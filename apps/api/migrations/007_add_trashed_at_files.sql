ALTER TABLE files ADD COLUMN trashed_at TIMESTAMPTZ;
CREATE INDEX idx_files_owner_trashed ON files(owner_id, trashed_at);
