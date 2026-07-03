/* @name ListFilesByOwner */
SELECT id, name, mime_type, size_bytes, checksum, folder_id, created_at, updated_at
FROM files
WHERE owner_id = :ownerId AND trashed_at IS NULL
ORDER BY created_at DESC;

/* @name GetFileByIdAndOwner */
SELECT id, name, mime_type, size_bytes, checksum, folder_id, created_at, updated_at
FROM files
WHERE id = :fileId AND owner_id = :ownerId AND trashed_at IS NULL;

/* @name UpdateFile */
UPDATE files
SET name = COALESCE(:name, name),
    folder_id = CASE WHEN :setFolder::boolean THEN :folderId ELSE folder_id END,
    updated_at = NOW()
WHERE id = :fileId AND owner_id = :ownerId
RETURNING id, owner_id, name, mime_type, size_bytes, checksum, folder_id, created_at, updated_at;

/* @name GetFileByIdWithAccess */
SELECT f.id, f.name, f.mime_type, f.size_bytes, f.checksum, f.created_at, f.updated_at
FROM files f
WHERE f.id = :fileId
  AND f.trashed_at IS NULL
  AND (
    f.owner_id = :userId
    OR EXISTS (
      SELECT 1 FROM shared_files sf
      WHERE sf.file_id = f.id
        AND sf.shared_with = :userId
        AND sf.share_type = 'user'
        AND (sf.expires_at IS NULL OR sf.expires_at > NOW())
    )
  );

/* @name GetFileStorageKey */
SELECT storage_key
FROM files
WHERE id = :fileId AND owner_id = :ownerId AND trashed_at IS NULL;

/* @name GetFileStorageKeyWithAccess */
SELECT f.storage_key
FROM files f
WHERE f.id = :fileId
  AND f.trashed_at IS NULL
  AND (
    f.owner_id = :userId
    OR EXISTS (
      SELECT 1 FROM shared_files sf
      WHERE sf.file_id = f.id
        AND sf.shared_with = :userId
        AND sf.share_type = 'user'
        AND (sf.expires_at IS NULL OR sf.expires_at > NOW())
    )
  );

/* @name GetFileStorageKeyForDelete */
SELECT storage_key
FROM files
WHERE id = :fileId AND owner_id = :ownerId;

/* @name InsertSyncLogDeleted */
INSERT INTO sync_log (user_id, file_id, event_type)
VALUES (:userId, :fileId, 'deleted');
