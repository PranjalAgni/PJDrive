import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { presignDownload } from '../storage';
import { parseBody, UpdateFileBody } from '../schemas';
import {
  listFilesByOwner,
  getFileByIdAndOwner,
  getFileByIdWithAccess,
  getFileStorageKeyWithAccess,
  updateFile,
} from './files.queries';
import { softDeleteFile } from './trash.queries';

export const filesRouter = Router();

// PATCH /files/:id — rename and/or move to a folder (folderId null = root)
filesRouter.patch('/:id', requireAuth, async (req: AuthRequest, res) => {
  const parsed = parseBody(UpdateFileBody, req.body, res);
  if (!parsed.ok) return;
  try {
    const own = await getFileByIdAndOwner.run({ fileId: req.params.id, ownerId: req.userId! }, pool);
    if (own.length === 0) return res.status(404).json({ error: 'file not found' });
    const setFolder = parsed.data.folderId !== undefined;
    const rows = await updateFile.run(
      {
        fileId: req.params.id,
        ownerId: req.userId!,
        name: parsed.data.name ?? null,
        setFolder,
        folderId: parsed.data.folderId ?? null,
      },
      pool
    );
    return res.json({ file: rows[0] });
  } catch (err) {
    console.error('file update error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

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

// DELETE /files/:id — soft-delete (move to Trash)
filesRouter.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await softDeleteFile.run({ fileId: req.params.id, ownerId: req.userId! }, pool);
    if (rows.length === 0) return res.status(404).json({ error: 'file not found' });
    return res.status(204).send();
  } catch (err) {
    console.error('files trash error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});
