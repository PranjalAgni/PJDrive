import { Router, Response } from 'express';
import { pool } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { getSyncChanges } from './sync.queries';
import { SyncChangesQuery, parseQuery } from '../schemas';

export const syncRouter = Router();

const clients = new Map<string, Set<Response>>();

export function broadcastSyncEvent(userId: string, event: { fileId: string; eventType: string }) {
  const userClients = clients.get(userId);
  if (!userClients) return;
  const data = JSON.stringify(event);
  const dead: Response[] = [];
  userClients.forEach((res) => {
    try {
      res.write(`data: ${data}\n\n`);
    } catch {
      dead.push(res);
    }
  });
  dead.forEach((res) => userClients.delete(res));
  if (userClients.size === 0) clients.delete(userId);
}

syncRouter.get('/events', requireAuth, (req: AuthRequest, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const userId = req.userId!;
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId)!.add(res);

  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    clients.get(userId)?.delete(res);
    if (clients.get(userId)?.size === 0) clients.delete(userId);
  });

  res.on('error', () => {
    clearInterval(heartbeat);
    clients.get(userId)?.delete(res);
    if (clients.get(userId)?.size === 0) clients.delete(userId);
  });
});

syncRouter.get('/changes', requireAuth, async (req: AuthRequest, res) => {
  try {
    const parsed = parseQuery(SyncChangesQuery, req.query, res);
    if (!parsed.ok) return;
    const since = parsed.data.since ? new Date(parsed.data.since) : new Date(0);

    const rows = await getSyncChanges.run({ userId: req.userId!, since }, pool);
    return res.json(rows);
  } catch (err) {
    console.error('sync changes error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});
