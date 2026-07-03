/* @name InsertFolder */
INSERT INTO folders (owner_id, parent_id, name)
VALUES (:ownerId, :parentId, :name)
RETURNING id, owner_id, parent_id, name, created_at, updated_at;

/* @name GetFolderByIdAndOwner */
SELECT id, owner_id, parent_id, name, created_at, updated_at
FROM folders
WHERE id = :folderId AND owner_id = :ownerId;

/* @name ListSubfoldersRoot */
SELECT id, owner_id, parent_id, name, created_at, updated_at
FROM folders
WHERE owner_id = :ownerId AND parent_id IS NULL
ORDER BY name ASC;

/* @name ListSubfoldersInParent */
SELECT id, owner_id, parent_id, name, created_at, updated_at
FROM folders
WHERE owner_id = :ownerId AND parent_id = :parentId
ORDER BY name ASC;

/* @name ListAllFoldersByOwner */
SELECT id, parent_id, name
FROM folders
WHERE owner_id = :ownerId
ORDER BY name ASC;

/* @name ListFilesInFolderRoot */
SELECT id, name, mime_type, size_bytes, checksum, folder_id, created_at, updated_at
FROM files
WHERE owner_id = :ownerId AND folder_id IS NULL
ORDER BY created_at DESC;

/* @name ListFilesInFolder */
SELECT id, name, mime_type, size_bytes, checksum, folder_id, created_at, updated_at
FROM files
WHERE owner_id = :ownerId AND folder_id = :folderId
ORDER BY created_at DESC;

/* @name GetBreadcrumb */
WITH RECURSIVE crumb AS (
  SELECT id, parent_id, name, 0 AS depth
  FROM folders
  WHERE id = :folderId AND owner_id = :ownerId
  UNION ALL
  SELECT f.id, f.parent_id, f.name, c.depth + 1
  FROM folders f
  JOIN crumb c ON f.id = c.parent_id
)
SELECT id, name, depth FROM crumb ORDER BY depth DESC;

/* @name GetDescendantFolderIds */
WITH RECURSIVE subtree AS (
  SELECT id FROM folders WHERE id = :folderId AND owner_id = :ownerId
  UNION ALL
  SELECT f.id FROM folders f JOIN subtree s ON f.parent_id = s.id
)
SELECT id FROM subtree;

/* @name UpdateFolder */
UPDATE folders
SET name = COALESCE(:name, name),
    parent_id = CASE WHEN :setParent::boolean THEN :parentId ELSE parent_id END,
    updated_at = NOW()
WHERE id = :folderId AND owner_id = :ownerId
RETURNING id, owner_id, parent_id, name, created_at, updated_at;

/* @name DeleteFolderCascade */
DELETE FROM folders WHERE id = :folderId AND owner_id = :ownerId;
