/* @name CheckFileOwnership */
SELECT id
FROM files
WHERE id = :fileId AND owner_id = :ownerId;

/* @name GetUserByEmail */
SELECT id
FROM users
WHERE email = :email;

/* @name InsertUserShare */
INSERT INTO shared_files (file_id, owner_id, shared_with, share_type, role)
VALUES (:fileId, :ownerId, :sharedWith, 'user', :role)
ON CONFLICT DO NOTHING
RETURNING id, file_id, owner_id, shared_with, share_type, role, share_token, expires_at, created_at;

/* @name GetExistingUserShare */
SELECT id, file_id, owner_id, shared_with, share_type, role, share_token, expires_at, created_at
FROM shared_files
WHERE file_id = :fileId AND shared_with = :sharedWith AND share_type = 'user';

/* @name InsertLinkShare */
INSERT INTO shared_files (file_id, owner_id, share_type, role, share_token)
VALUES (:fileId, :ownerId, 'link', :role, :shareToken)
RETURNING id, file_id, owner_id, shared_with, share_type, role, share_token, expires_at, created_at;
