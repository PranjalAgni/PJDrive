import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { getUserStats } from './stats.queries';

export const statsRouter = Router();

statsRouter.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await getUserStats.run({ userId: req.userId! }, pool);
    const row = rows[0];
    return res.json({
      fileCount: Number(row.file_count),
      totalBytes: Number(row.total_bytes),
    });
  } catch (err) {
    console.error('stats error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});
