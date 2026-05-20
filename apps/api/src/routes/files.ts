import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { s3, BUCKET, presignDownload } from '../storage';
import { broadcastSyncEvent } from './sync';
import {
  listFilesByOwner,
  getFileByIdAndOwner,
  getFileByIdWithAccess,
  getFileStorageKey,
  getFileStorageKeyWithAccess,
  getFileStorageKeyForDelete,
  insertSyncLogDeleted,
} from './files.queries';

export const filesRouter = Router();

filesRouter.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await listFilesByOwner.run({ ownerId: req.userId! }, pool);
    return res.json(rows);
  } catch (err) {
    console.error('files list error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

filesRouter.get('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await getFileByIdWithAccess.run({ fileId: req.params.id, userId: req.userId! }, pool);
    if (rows.length === 0) return res.status(404).json({ error: 'file not found' });
    return res.json(rows[0]);
  } catch (err) {
    console.error('files get error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

filesRouter.get('/:id/download-url', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await getFileStorageKeyWithAccess.run({ fileId: req.params.id, userId: req.userId! }, pool);
    if (rows.length === 0) return res.status(404).json({ error: 'file not found' });
    const url = await presignDownload(rows[0].storage_key);
    return res.json({ url });
  } catch (err) {
    console.error('files download-url error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

filesRouter.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const rows = await getFileStorageKeyForDelete.run(
        { fileId: req.params.id, ownerId: req.userId! },
        client
      );

      if (rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'file not found' });
      }

      await insertSyncLogDeleted.run({ userId: req.userId!, fileId: req.params.id }, client);

      // DELETE stays raw — no RETURNING needed, inside transaction
      await client.query('DELETE FROM files WHERE id=$1', [req.params.id]);

      await client.query('COMMIT');

      broadcastSyncEvent(req.userId!, { fileId: req.params.id, eventType: 'deleted' });

      try {
        await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: rows[0].storage_key }));
      } catch (s3Err) {
        console.error('files delete S3 error (DB already committed):', s3Err);
      }

      return res.status(204).send();
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('files delete error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});
