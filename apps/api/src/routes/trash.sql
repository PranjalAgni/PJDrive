/* @name SoftDeleteFile */
UPDATE files SET trashed_at = NOW()
WHERE id = :fileId AND owner_id = :ownerId AND trashed_at IS NULL
RETURNING id;

/* @name TrashFolderSubtreeFolders */
WITH RECURSIVE subtree AS (
  SELECT id FROM folders WHERE id = :folderId AND owner_id = :ownerId
  UNION ALL
  SELECT f.id FROM folders f JOIN subtree s ON f.parent_id = s.id
)
UPDATE folders SET trashed_at = :trashedAt
WHERE id IN (SELECT id FROM subtree) AND trashed_at IS NULL;

/* @name TrashFolderSubtreeFiles */
WITH RECURSIVE subtree AS (
  SELECT id FROM folders WHERE id = :folderId AND owner_id = :ownerId
  UNION ALL
  SELECT f.id FROM folders f JOIN subtree s ON f.parent_id = s.id
)
UPDATE files SET trashed_at = :trashedAt
WHERE folder_id IN (SELECT id FROM subtree) AND trashed_at IS NULL;

/* @name ListTrashedFiles */
SELECT id, name, mime_type, size_bytes, folder_id, trashed_at, created_at
FROM files
WHERE owner_id = :ownerId AND trashed_at IS NOT NULL
ORDER BY trashed_at DESC;

/* @name ListTrashedFolders */
SELECT id, parent_id, name, trashed_at, created_at
FROM folders
WHERE owner_id = :ownerId AND trashed_at IS NOT NULL
ORDER BY trashed_at DESC;

/* @name RestoreFile */
UPDATE files SET trashed_at = NULL
WHERE id = :fileId AND owner_id = :ownerId
RETURNING id, folder_id;

/* @name DetachRestoredFileIfFolderTrashed */
UPDATE files SET folder_id = NULL
WHERE id = :fileId AND owner_id = :ownerId
  AND folder_id IN (SELECT id FROM folders WHERE trashed_at IS NOT NULL);

/* @name RestoreFolderGroup */
/* restores the folder plus descendants sharing its trashed_at */
UPDATE folders SET trashed_at = NULL
WHERE owner_id = :ownerId
  AND trashed_at = (SELECT trashed_at FROM folders WHERE id = :folderId AND owner_id = :ownerId)
  AND id IN (
    WITH RECURSIVE subtree AS (
      SELECT id FROM folders WHERE id = :folderId AND owner_id = :ownerId
      UNION ALL
      SELECT f.id FROM folders f JOIN subtree s ON f.parent_id = s.id
    )
    SELECT id FROM subtree
  );

/* @name RestoreFolderGroupFiles */
UPDATE files SET trashed_at = NULL
WHERE owner_id = :ownerId
  AND folder_id IN (
    WITH RECURSIVE subtree AS (
      SELECT id FROM folders WHERE id = :folderId AND owner_id = :ownerId
      UNION ALL
      SELECT f.id FROM folders f JOIN subtree s ON f.parent_id = s.id
    )
    SELECT id FROM subtree
  )
  AND trashed_at = (SELECT trashed_at FROM folders WHERE id = :folderId AND owner_id = :ownerId);

/* @name DetachRestoredFolderIfParentTrashed */
/* if the restored folder's parent is (still) trashed, move it to root */
UPDATE folders SET parent_id = NULL
WHERE id = :folderId AND owner_id = :ownerId
  AND parent_id IN (SELECT id FROM folders WHERE trashed_at IS NOT NULL);

/* @name GetTrashedFileStorageKey */
SELECT storage_key FROM files
WHERE id = :fileId AND owner_id = :ownerId AND trashed_at IS NOT NULL;

/* @name HardDeleteFile */
DELETE FROM files WHERE id = :fileId AND owner_id = :ownerId AND trashed_at IS NOT NULL;

/* @name HardDeleteFolder */
DELETE FROM folders WHERE id = :folderId AND owner_id = :ownerId AND trashed_at IS NOT NULL;

/* @name InsertSyncLogDeleted */
INSERT INTO sync_log (user_id, file_id, event_type) VALUES (:userId, :fileId, 'deleted');

/* @name ListAllTrashedFileKeys */
/* for empty-trash and purge: storage keys to remove from S3 */
SELECT id, storage_key FROM files
WHERE owner_id = :ownerId AND trashed_at IS NOT NULL;

/* @name EmptyTrashFiles */
DELETE FROM files WHERE owner_id = :ownerId AND trashed_at IS NOT NULL;

/* @name EmptyTrashFolders */
DELETE FROM folders WHERE owner_id = :ownerId AND trashed_at IS NOT NULL;

/* @name SelectPurgeableFileKeys */
SELECT id, storage_key FROM files
WHERE trashed_at IS NOT NULL AND trashed_at < NOW() - INTERVAL '30 days';

/* @name PurgeFiles */
DELETE FROM files WHERE trashed_at IS NOT NULL AND trashed_at < NOW() - INTERVAL '30 days';

/* @name PurgeFolders */
DELETE FROM folders WHERE trashed_at IS NOT NULL AND trashed_at < NOW() - INTERVAL '30 days';
