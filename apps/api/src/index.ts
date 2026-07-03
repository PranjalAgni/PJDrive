import express from 'express';
import cors from 'cors';
import { authRouter } from './routes/auth';
import { requireAuth, AuthRequest } from './middleware/auth';
import { filesRouter } from './routes/files';
import { uploadRouter } from './routes/upload';
import { sharingRouter } from './routes/sharing';
import { sharedWithMeRouter } from './routes/sharedWithMe';
import { syncRouter } from './routes/sync';
import { statsRouter } from './routes/stats';
import { foldersRouter } from './routes/folders';
import { trashRouter } from './routes/trash';
import { purgeTrash } from './purge';
import { pool } from './db';
import { resolveShareToken } from './index.queries';

export const app = express();

app.use(cors());
app.use(express.json());
app.use('/auth', authRouter);

app.get('/share/:token', async (req, res) => {
  try {
    const rows = await resolveShareToken.run({ shareToken: req.params.token }, pool);
    if (rows.length === 0) return res.status(404).json({ error: 'share not found' });
    const row = rows[0];
    return res.json({
      file: { id: row.file_id, name: row.name, mime_type: row.mime_type, size_bytes: row.size_bytes },
      role: row.role,
    });
  } catch (err) {
    console.error('share token resolve error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

app.use('/files/shared-with-me', sharedWithMeRouter);
app.use('/files', sharingRouter);
app.use('/files', filesRouter);
app.use('/upload', uploadRouter);
app.use('/sync', syncRouter);
app.use('/stats', statsRouter);
app.use('/folders', foldersRouter);
app.use('/trash', trashRouter);

app.get('/auth/me', requireAuth, (req: AuthRequest, res) => {
  res.json({ userId: req.userId });
});

app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('unhandled error:', err);
  res.status(500).json({ error: 'internal server error' });
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`API running on port ${PORT}`));
  // Auto-purge trash older than 30 days, every 6 hours.
  setInterval(() => {
    purgeTrash().catch((e) => console.error('purge interval error:', e));
  }, 6 * 60 * 60 * 1000);
}
