CREATE INDEX idx_files_name_fts   ON files   USING GIN (to_tsvector('simple', name));
CREATE INDEX idx_folders_name_fts ON folders USING GIN (to_tsvector('simple', name));
-- trigram-style prefix help for ILIKE (optional; requires pg_trgm)
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- CREATE INDEX idx_files_name_trgm   ON files   USING GIN (name gin_trgm_ops);
-- CREATE INDEX idx_folders_name_trgm ON folders USING GIN (name gin_trgm_ops);
