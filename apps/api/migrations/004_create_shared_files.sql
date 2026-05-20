CREATE TABLE shared_files (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id     UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shared_with UUID REFERENCES users(id) ON DELETE CASCADE,
  share_type  VARCHAR(10) NOT NULL CHECK (share_type IN ('user', 'link')),
  role        VARCHAR(10) NOT NULL CHECK (role IN ('editor', 'viewer')),
  share_token VARCHAR(64) UNIQUE,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT user_share_check CHECK (
    (share_type = 'user' AND shared_with IS NOT NULL) OR
    (share_type = 'link' AND share_token IS NOT NULL)
  )
);

CREATE INDEX idx_shared_files_user ON shared_files(shared_with);
CREATE INDEX idx_shared_files_file ON shared_files(file_id);
CREATE UNIQUE INDEX idx_share_token ON shared_files(share_token)
  WHERE share_token IS NOT NULL;
