/* @name GetSharedWithMe */
SELECT f.id, f.name, f.mime_type, f.size_bytes, f.created_at, sf.role, u.email AS owner_email
FROM shared_files sf
JOIN files f ON f.id = sf.file_id
JOIN users u ON u.id = sf.owner_id
WHERE sf.shared_with = :userId
  AND sf.share_type = 'user'
  AND (sf.expires_at IS NULL OR sf.expires_at > NOW())
ORDER BY f.created_at DESC;
