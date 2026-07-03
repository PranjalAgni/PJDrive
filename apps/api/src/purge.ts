import { pool } from './db';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { s3, BUCKET } from './storage';
import { selectPurgeableFileKeys, purgeFiles, purgeFolders } from './routes/trash.queries';

// Permanently removes items that have been in Trash for more than 30 days.
// S3 objects are deleted first (individual failures are tolerated and logged),
// then the DB rows for files and folders are purged.
export async function purgeTrash(): Promise<{ files: number }> {
  const keys = await selectPurgeableFileKeys.run(undefined, pool);
  for (const k of keys) {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: k.storage_key }));
    } catch (e) {
      console.error('purge S3 error:', e);
    }
  }
  await purgeFiles.run(undefined, pool);
  await purgeFolders.run(undefined, pool);
  return { files: keys.length };
}

if (require.main === module) {
  purgeTrash()
    .then((r) => {
      console.log('purged', r);
      return pool.end();
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
