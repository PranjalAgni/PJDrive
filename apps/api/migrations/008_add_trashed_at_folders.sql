ALTER TABLE folders ADD COLUMN trashed_at TIMESTAMPTZ;
CREATE INDEX idx_folders_owner_trashed ON folders(owner_id, trashed_at);
