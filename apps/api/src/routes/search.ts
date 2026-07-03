import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { parseQuery, SearchQuery } from '../schemas';
import { searchFiles, searchFolders } from './search.queries';

export const searchRouter = Router();

// GET /search — full-text + ILIKE search over the caller's file and folder
// names, excluding trashed rows, with optional mime-type and date filters.
searchRouter.get('/', requireAuth, async (req: AuthRequest, res) => {
  const parsed = parseQuery(SearchQuery, req.query, res);
  if (!parsed.ok) return;
  const { q, type, after, before, limit } = parsed.data;
  try {
    const files = await searchFiles.run(
      {
        ownerId: req.userId!,
        q,
        like: `%${q}%`,
        typePrefix: type ? `${type}%` : null,
        afterTs: after ?? null,
        beforeTs: before ?? null,
        maxResults: limit,
      },
      pool
    );
    const folders = await searchFolders.run(
      {
        ownerId: req.userId!,
        q,
        like: `%${q}%`,
        afterTs: after ?? null,
        beforeTs: before ?? null,
        maxResults: limit,
      },
      pool
    );
    return res.json({ files, folders });
  } catch (err) {
    console.error('search error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});
