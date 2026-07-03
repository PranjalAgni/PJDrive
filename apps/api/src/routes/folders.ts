import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { parseBody, CreateFolderBody, UpdateFolderBody } from '../schemas';
import {
  insertFolder,
  getFolderByIdAndOwner,
  listSubfoldersRoot,
  listSubfoldersInParent,
  listAllFoldersByOwner,
  listFilesInFolderRoot,
  listFilesInFolder,
  getBreadcrumb,
  getDescendantFolderIds,
  updateFolder,
  deleteFolderCascade,
} from './folders.queries';

export const foldersRouter = Router();

// POST /folders — create a folder (parentId optional; null = root)
foldersRouter.post('/', requireAuth, async (req: AuthRequest, res) => {
  const parsed = parseBody(CreateFolderBody, req.body, res);
  if (!parsed.ok) return;
  try {
    const parentId = parsed.data.parentId ?? null;
    // If a parent is given, ensure it belongs to the caller.
    if (parentId) {
      const parent = await getFolderByIdAndOwner.run({ folderId: parentId, ownerId: req.userId! }, pool);
      if (parent.length === 0) return res.status(404).json({ error: 'parent folder not found' });
    }
    const rows = await insertFolder.run({ ownerId: req.userId!, parentId, name: parsed.data.name }, pool);
    return res.status(201).json({ folder: rows[0] });
  } catch (err) {
    console.error('folder create error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

// GET /folders — flat list of all the caller's folders (for the move picker)
foldersRouter.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await listAllFoldersByOwner.run({ ownerId: req.userId! }, pool);
    return res.json({ subfolders: rows });
  } catch (err) {
    console.error('folder list error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

// GET /folders/:id — listing for a folder (":id" may be "root")
foldersRouter.get('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const isRoot = req.params.id === 'root';

    let folder = null;
    let breadcrumb: Array<{ id: string; name: string }> = [];
    let subfolders;
    let files;

    if (isRoot) {
      subfolders = await listSubfoldersRoot.run({ ownerId: req.userId! }, pool);
      files = await listFilesInFolderRoot.run({ ownerId: req.userId! }, pool);
    } else {
      const f = await getFolderByIdAndOwner.run({ folderId: req.params.id, ownerId: req.userId! }, pool);
      if (f.length === 0) return res.status(404).json({ error: 'folder not found' });
      folder = f[0];
      const crumb = await getBreadcrumb.run({ folderId: req.params.id, ownerId: req.userId! }, pool);
      breadcrumb = crumb.map((c) => ({ id: c.id!, name: c.name! }));
      subfolders = await listSubfoldersInParent.run({ ownerId: req.userId!, parentId: req.params.id }, pool);
      files = await listFilesInFolder.run({ ownerId: req.userId!, folderId: req.params.id }, pool);
    }

    return res.json({ folder, breadcrumb, subfolders, files });
  } catch (err) {
    console.error('folder get error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

// PATCH /folders/:id — rename and/or move
foldersRouter.patch('/:id', requireAuth, async (req: AuthRequest, res) => {
  const parsed = parseBody(UpdateFolderBody, req.body, res);
  if (!parsed.ok) return;
  try {
    const own = await getFolderByIdAndOwner.run({ folderId: req.params.id, ownerId: req.userId! }, pool);
    if (own.length === 0) return res.status(404).json({ error: 'folder not found' });

    const setParent = parsed.data.parentId !== undefined;
    if (setParent && parsed.data.parentId) {
      if (parsed.data.parentId === req.params.id) {
        return res.status(400).json({ error: 'cannot move a folder into itself' });
      }
      const descendants = await getDescendantFolderIds.run(
        { folderId: req.params.id, ownerId: req.userId! },
        pool
      );
      if (descendants.some((d) => d.id === parsed.data.parentId)) {
        return res.status(400).json({ error: 'cannot move a folder into its own subtree' });
      }
      const target = await getFolderByIdAndOwner.run(
        { folderId: parsed.data.parentId, ownerId: req.userId! },
        pool
      );
      if (target.length === 0) return res.status(404).json({ error: 'target folder not found' });
    }

    const rows = await updateFolder.run(
      {
        folderId: req.params.id,
        ownerId: req.userId!,
        name: parsed.data.name ?? null,
        setParent,
        parentId: parsed.data.parentId ?? null,
      },
      pool
    );
    return res.json({ folder: rows[0] });
  } catch (err) {
    console.error('folder update error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

// DELETE /folders/:id — hard-delete (files cascade to root via ON DELETE SET NULL).
// Becomes a soft-delete in Plan B (Trash).
foldersRouter.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const own = await getFolderByIdAndOwner.run({ folderId: req.params.id, ownerId: req.userId! }, pool);
    if (own.length === 0) return res.status(404).json({ error: 'folder not found' });
    await deleteFolderCascade.run({ folderId: req.params.id, ownerId: req.userId! }, pool);
    return res.status(204).send();
  } catch (err) {
    console.error('folder delete error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});
