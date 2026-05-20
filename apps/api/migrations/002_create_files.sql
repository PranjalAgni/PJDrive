CREATE TABLE files (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         VARCHAR(500) NOT NULL,
  mime_type    VARCHAR(255),
  size_bytes   BIGINT,
  storage_key  VARCHAR(1000) NOT NULL,
  checksum     VARCHAR(64),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_files_owner ON files(owner_id);
