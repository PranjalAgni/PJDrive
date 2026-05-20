import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { pool } from '../db';

let token: string;
let fileId: string;

beforeAll(async () => {
  await pool.query("DELETE FROM users WHERE email = 'test-files@example.com'");
  const res = await request(app)
    .post('/auth/register')
    .send({ email: 'test-files@example.com', password: 'password123' });
  token = res.body.token;
  const userId = res.body.user.id;

  const fileRes = await pool.query(
    "INSERT INTO files (owner_id, name, mime_type, size_bytes, storage_key, checksum) VALUES ($1,'hello.txt','text/plain',100,'test/key','abc') RETURNING id",
    [userId]
  );
  fileId = fileRes.rows[0].id;
});

afterAll(async () => {
  await pool.query("DELETE FROM users WHERE email = 'test-files@example.com'");
  await pool.end();
});

describe('GET /files', () => {
  it('requires auth', async () => {
    expect((await request(app).get('/files')).status).toBe(401);
  });

  it('returns list of owned files', async () => {
    const res = await request(app).get('/files').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });
});

describe('GET /files/:id', () => {
  it('returns file metadata for owner', async () => {
    const res = await request(app).get(`/files/${fileId}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(fileId);
  });
});

describe('DELETE /files/:id', () => {
  it('deletes file owned by user', async () => {
    const { rows } = await pool.query(
      "INSERT INTO files (owner_id, name, storage_key, checksum) SELECT owner_id,'del.txt','del/key','xyz' FROM files WHERE id=$1 RETURNING id",
      [fileId]
    );
    const delId = rows[0].id;
    const res = await request(app).delete(`/files/${delId}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });
});
