CREATE TABLE uploads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id         UUID REFERENCES files(id) ON DELETE CASCADE,
  owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  upload_id       VARCHAR(500) NOT NULL,
  total_chunks    INT NOT NULL,
  uploaded_chunks JSONB DEFAULT '[]',
  status          VARCHAR(20) DEFAULT 'in_progress'
                  CHECK (status IN ('in_progress', 'complete', 'failed')),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
