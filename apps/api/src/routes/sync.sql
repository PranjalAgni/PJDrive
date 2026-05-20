/* @name GetSyncChanges */
SELECT file_id, event_type, created_at
FROM sync_log
WHERE user_id = :userId AND created_at > :since
ORDER BY created_at ASC
LIMIT 500;
