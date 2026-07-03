/* @name GetUserStats */
SELECT
  COUNT(*)::int AS file_count,
  COALESCE(SUM(size_bytes), 0)::bigint AS total_bytes
FROM files
WHERE owner_id = :userId AND trashed_at IS NULL;
