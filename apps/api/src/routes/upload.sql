/* @name InsertFile */
INSERT INTO files (owner_id, name, mime_type, size_bytes, storage_key, checksum, folder_id)
VALUES (:ownerId, :name, :mimeType, :sizeBytes, :storageKey, :checksum, :folderId)
RETURNING id;

/* @name InsertUpload */
INSERT INTO uploads (file_id, owner_id, upload_id, total_chunks)
VALUES (:fileId, :ownerId, :uploadId, :totalChunks)
RETURNING id;

/* @name GetUploadStatus */
SELECT uploaded_chunks, total_chunks
FROM uploads
WHERE id = :uploadId AND owner_id = :ownerId;

/* @name RecordChunk */
UPDATE uploads
SET uploaded_chunks = (
  SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
  FROM jsonb_array_elements_text(uploaded_chunks) AS elem
  WHERE split_part(elem, ':', 1)::int <> :partNumber
) || to_jsonb(:chunkEntry::text)
WHERE id = :uploadId AND owner_id = :ownerId AND status = 'in_progress'
  AND :partNumber BETWEEN 1 AND total_chunks
RETURNING id;

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
