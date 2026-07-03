/* @name SearchFiles */
SELECT id, name, mime_type, size_bytes, folder_id, created_at,
       ts_rank(to_tsvector('simple', name), plainto_tsquery('simple', :q)) AS rank
FROM files
WHERE owner_id = :ownerId
  AND trashed_at IS NULL
  AND (
    to_tsvector('simple', name) @@ plainto_tsquery('simple', :q)
    OR name ILIKE :like
  )
  AND (:typePrefix::text IS NULL OR mime_type LIKE :typePrefix)
  AND (:afterTs::timestamptz IS NULL OR created_at >= :afterTs)
  AND (:beforeTs::timestamptz IS NULL OR created_at <= :beforeTs)
ORDER BY rank DESC, created_at DESC
LIMIT :maxResults;

/* @name SearchFolders */
SELECT id, parent_id, name, created_at,
       ts_rank(to_tsvector('simple', name), plainto_tsquery('simple', :q)) AS rank
FROM folders
WHERE owner_id = :ownerId
  AND trashed_at IS NULL
  AND (
    to_tsvector('simple', name) @@ plainto_tsquery('simple', :q)
    OR name ILIKE :like
  )
  AND (:afterTs::timestamptz IS NULL OR created_at >= :afterTs)
  AND (:beforeTs::timestamptz IS NULL OR created_at <= :beforeTs)
ORDER BY rank DESC, created_at DESC
LIMIT :maxResults;
