import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { getSharedWithMe } from './sharedWithMe.queries';

export const sharedWithMeRouter = Router();

sharedWithMeRouter.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await getSharedWithMe.run({ userId: req.userId! }, pool);
    return res.json(rows);
  } catch (err) {
    console.error('shared-with-me error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});
