/* @name ResolveShareToken */
SELECT sf.file_id, sf.role, f.name, f.mime_type, f.size_bytes
FROM shared_files sf
JOIN files f ON f.id = sf.file_id
WHERE sf.share_token = :shareToken
  AND sf.share_type = 'link'
  AND (sf.expires_at IS NULL OR sf.expires_at > NOW());
