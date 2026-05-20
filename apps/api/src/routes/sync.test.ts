import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { pool } from '../db';

let token: string;
let userId: string;
let fileId: string;

beforeAll(async () => {
  await pool.query("DELETE FROM users WHERE email='sync-test@example.com'");
  const reg = await request(app).post('/auth/register').send({ email: 'sync-test@example.com', password: 'pass12345' });
  token = reg.body.token;
  userId = reg.body.user.id;

  const f = await pool.query(
    "INSERT INTO files (owner_id,name,mime_type,size_bytes,storage_key,checksum) VALUES ($1,'sync.txt','text/plain',100,'key/sync','abc') RETURNING id",
    [userId]
  );
  fileId = f.rows[0].id;

  await pool.query(
    "INSERT INTO sync_log (user_id, file_id, event_type) VALUES ($1,$2,'created')",
    [userId, fileId]
  );
});

afterAll(async () => {
  await pool.query("DELETE FROM users WHERE email='sync-test@example.com'");
  await pool.end();
});

describe('GET /sync/changes', () => {
  it('requires auth', async () => {
    expect((await request(app).get('/sync/changes')).status).toBe(401);
  });

  it('returns sync events since timestamp', async () => {
    const since = new Date(Date.now() - 60000).toISOString();
    const res = await request(app)
      .get(`/sync/changes?since=${since}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].file_id).toBe(fileId);
    expect(res.body[0].event_type).toBe('created');
  });

  it('returns empty array when nothing changed', async () => {
    const since = new Date(Date.now() + 10000).toISOString();
    const res = await request(app)
      .get(`/sync/changes?since=${since}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
