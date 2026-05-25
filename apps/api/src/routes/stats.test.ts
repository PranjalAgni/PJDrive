import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { pool } from '../db';

let token: string;
let userId: string;

beforeAll(async () => {
  await pool.query("DELETE FROM users WHERE email = 'stats-test@example.com'");
  const res = await request(app)
    .post('/auth/register')
    .send({ email: 'stats-test@example.com', password: 'password123' });
  token = res.body.token;
  userId = res.body.user.id;
});

afterAll(async () => {
  await pool.query("DELETE FROM users WHERE email = 'stats-test@example.com'");
  await pool.end();
});

describe('GET /stats', () => {
  it('requires auth', async () => {
    expect((await request(app).get('/stats')).status).toBe(401);
  });

  it('returns fileCount 0 and totalBytes 0 for a new user with no files', async () => {
    const res = await request(app)
      .get('/stats')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.fileCount).toBe(0);
    expect(res.body.totalBytes).toBe(0);
  });

  it('returns correct counts after inserting files', async () => {
    await pool.query(
      "INSERT INTO files (owner_id, name, mime_type, size_bytes, storage_key, checksum) VALUES ($1,'a.txt','text/plain',1000,'key/a','abc'), ($1,'b.txt','text/plain',2000,'key/b','def')",
      [userId]
    );

    const res = await request(app)
      .get('/stats')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.fileCount).toBe(2);
    expect(res.body.totalBytes).toBe(3000);
  });
});
