import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { s3, BUCKET } from '../storage';
import { broadcastSyncEvent } from './sync';
import {
  listTrashedFiles,
  listTrashedFolders,
  restoreFile,
  detachRestoredFileIfFolderTrashed,
  restoreFolderGroup,
  restoreFolderGroupFiles,
  detachRestoredFolderIfParentTrashed,
  getTrashedFileStorageKey,
  hardDeleteFile,
  hardDeleteFolder,
  insertSyncLogDeleted,
  listAllTrashedFileKeys,
  emptyTrashFiles,
  emptyTrashFolders,
} from './trash.queries';

export const trashRouter = Router();

// GET /trash — list trashed files and folders
trashRouter.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const files = await listTrashedFiles.run({ ownerId: req.userId! }, pool);
    const folders = await listTrashedFolders.run({ ownerId: req.userId! }, pool);
    return res.json({ files, folders });
  } catch (err) {
    console.error('trash list error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

// POST /trash/:type/:id/restore
trashRouter.post('/:type/:id/restore', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.params.type === 'files') {
      const rows = await restoreFile.run({ fileId: req.params.id, ownerId: req.userId! }, pool);
      if (rows.length === 0) return res.status(404).json({ error: 'not found' });
      // If the file's folder is (still) trashed, move it to root.
      await detachRestoredFileIfFolderTrashed.run({ fileId: req.params.id, ownerId: req.userId! }, pool);
      return res.json({ restored: rows[0].id });
    }
    if (req.params.type === 'folders') {
      const own = await getTrashedFolder(req.params.id, req.userId!);
      if (!own) return res.status(404).json({ error: 'not found' });
      // Restore files BEFORE folders: the file query matches on the folder's
      // trashed_at, which restoreFolderGroup would null out first.
      await restoreFolderGroupFiles.run({ folderId: req.params.id, ownerId: req.userId! }, pool);
      await restoreFolderGroup.run({ folderId: req.params.id, ownerId: req.userId! }, pool);
      await detachRestoredFolderIfParentTrashed.run({ folderId: req.params.id, ownerId: req.userId! }, pool);
      return res.json({ restored: req.params.id });
    }
    return res.status(400).json({ error: 'invalid type' });
  } catch (err) {
    console.error('trash restore error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

// DELETE /trash/:type/:id — permanent delete
trashRouter.delete('/:type/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.params.type === 'files') {
      const keys = await getTrashedFileStorageKey.run({ fileId: req.params.id, ownerId: req.userId! }, pool);
      if (keys.length === 0) return res.status(404).json({ error: 'not found' });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await insertSyncLogDeleted.run({ userId: req.userId!, fileId: req.params.id }, client);
        await hardDeleteFile.run({ fileId: req.params.id, ownerId: req.userId! }, client);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }

      broadcastSyncEvent(req.userId!, { fileId: req.params.id, eventType: 'deleted' });
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: keys[0].storage_key }));
      } catch (s3Err) {
        console.error('trash permanent-delete S3 error (DB committed):', s3Err);
      }
      return res.status(204).send();
    }
    if (req.params.type === 'folders') {
      const own = await getTrashedFolder(req.params.id, req.userId!);
      if (!own) return res.status(404).json({ error: 'not found' });
      await hardDeleteFolder.run({ folderId: req.params.id, ownerId: req.userId! }, pool);
      return res.status(204).send();
    }
    return res.status(400).json({ error: 'invalid type' });
  } catch (err) {
    console.error('trash delete error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

// DELETE /trash — empty the whole trash
trashRouter.delete('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const keys = await listAllTrashedFileKeys.run({ ownerId: req.userId! }, pool);
    await emptyTrashFiles.run({ ownerId: req.userId! }, pool);
    await emptyTrashFolders.run({ ownerId: req.userId! }, pool);
    for (const k of keys) {
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: k.storage_key }));
      } catch (e) {
        console.error('empty-trash S3 error:', e);
      }
    }
    return res.status(204).send();
  } catch (err) {
    console.error('empty trash error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

// Confirms a folder is trashed and owned by the caller (used to gate restore/permanent-delete).
async function getTrashedFolder(folderId: string, ownerId: string): Promise<boolean> {
  const { rows } = await pool.query(
    'SELECT id FROM folders WHERE id=$1 AND owner_id=$2 AND trashed_at IS NOT NULL',
    [folderId, ownerId]
  );
  return rows.length > 0;
}
