import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import {
  checkFileOwnership,
  getUserByEmail,
  insertUserShare,
  getExistingUserShare,
  insertLinkShare,
} from './sharing.queries';
import { ShareUserBody, ShareLinkBody, parseBody } from '../schemas';

export const sharingRouter = Router();

sharingRouter.post('/:id/share', requireAuth, async (req: AuthRequest, res) => {
  const parsed = parseBody(ShareUserBody, req.body, res);
  if (!parsed.ok) return;
  const { email, role } = parsed.data;

  try {
    const fileRows = await checkFileOwnership.run({ fileId: req.params.id, ownerId: req.userId! }, pool);
    if (fileRows.length === 0) return res.status(403).json({ error: 'access denied' });

    const userRows = await getUserByEmail.run({ email }, pool);
    if (userRows.length === 0) return res.status(404).json({ error: 'user not found' });

    const sharedWith = userRows[0].id;
    const rows = await insertUserShare.run({
      fileId: req.params.id, ownerId: req.userId!, sharedWith, role,
    }, pool);

    if (rows.length === 0) {
      const existing = await getExistingUserShare.run({ fileId: req.params.id, sharedWith }, pool);
      return res.status(200).json(existing[0]);
    }
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error('sharing user share error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

sharingRouter.post('/:id/share/link', requireAuth, async (req: AuthRequest, res) => {
  const parsed = parseBody(ShareLinkBody, req.body, res);
  if (!parsed.ok) return;
  const { role } = parsed.data;

  try {
    const fileRows = await checkFileOwnership.run({ fileId: req.params.id, ownerId: req.userId! }, pool);
    if (fileRows.length === 0) return res.status(403).json({ error: 'access denied' });

    const shareToken = uuidv4();
    const rows = await insertLinkShare.run({
      fileId: req.params.id, ownerId: req.userId!, role, shareToken,
    }, pool);

    const shareUrl = `${process.env.APP_URL || 'http://localhost:5173'}/share/${shareToken}`;
    return res.status(201).json({ ...rows[0], shareToken, shareUrl });
  } catch (err) {
    console.error('sharing link error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

// Revoke stays as raw pool.query — pgtyped DELETE doesn't expose rowCount
sharingRouter.delete('/:id/share/:shareId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM shared_files WHERE id=$1 AND file_id=$2 AND owner_id=$3',
      [req.params.shareId, req.params.id, req.userId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'share not found' });
    return res.status(204).send();
  } catch (err) {
    console.error('sharing revoke error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});
