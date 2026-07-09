/* @name InsertFile */
INSERT INTO files (owner_id, name, mime_type, size_bytes, storage_key, checksum, folder_id)
VALUES (:ownerId, :name, :mimeType, :sizeBytes, :storageKey, :checksum, :folderId)
RETURNING id;

/* @name InsertUpload */
INSERT INTO uploads (file_id, owner_id, upload_id, total_chunks)
VALUES (:fileId, :ownerId, :uploadId, :totalChunks)
RETURNING id;

/* @name GetInProgressUpload */
SELECT u.id, u.upload_id, u.file_id, f.storage_key
FROM uploads u
JOIN files f ON f.id = u.file_id
WHERE u.owner_id = :ownerId AND f.checksum = :checksum
  AND u.total_chunks = :totalChunks AND u.status = 'in_progress'
  AND f.name = :fileName AND f.folder_id IS NOT DISTINCT FROM :folderId
  AND f.trashed_at IS NULL
ORDER BY u.created_at DESC
LIMIT 1;

/* @name FailUpload */
UPDATE uploads
SET status = 'failed'
WHERE id = :uploadId;

/* @name TrashOrphanedUploadFile */
UPDATE files
SET trashed_at = NOW()
WHERE id = :fileId AND owner_id = :ownerId AND trashed_at IS NULL;

/* @name GetUploadWithFile */
SELECT u.id, u.file_id, u.upload_id, u.total_chunks, u.uploaded_chunks, u.status, f.storage_key
FROM uploads u
JOIN files f ON f.id = u.file_id
WHERE u.id = :uploadId AND u.owner_id = :ownerId;

/* @name CompleteUpload */
UPDATE uploads
SET status = 'complete'
WHERE id = :uploadId;

/* @name InsertSyncLogCreated */
INSERT INTO sync_log (user_id, file_id, event_type)
VALUES (:userId, :fileId, 'created');

/* @name GetFileById */
SELECT id, name, mime_type, size_bytes, checksum, created_at, updated_at
FROM files
WHERE id = :fileId;
