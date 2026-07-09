-- Supports the resume/dedup lookup in getInProgressUpload, which filters
-- uploads by owner_id + status + total_chunks and joins files on checksum.
CREATE INDEX idx_uploads_owner_status ON uploads(owner_id, status, total_chunks);
CREATE INDEX idx_files_checksum ON files(checksum);
