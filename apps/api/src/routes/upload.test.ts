import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { pool } from '../db';

let token: string;
let userId: string;

beforeAll(async () => {
  await pool.query("DELETE FROM users WHERE email = 'test-upload@example.com'");
  const res = await request(app)
    .post('/auth/register')
    .send({ email: 'test-upload@example.com', password: 'password123' });
  token = res.body.token;
  userId = res.body.user.id;
});

afterAll(async () => {
  await pool.query("DELETE FROM users WHERE email = 'test-upload@example.com'");
  await pool.end();
});

describe('POST /upload/init', () => {
  it('requires auth', async () => {
    const res = await request(app).post('/upload/init').send({});
    expect(res.status).toBe(401);
  });

  it('returns uploadId and presigned chunk URLs', async () => {
    const res = await request(app)
      .post('/upload/init')
      .set('Authorization', `Bearer ${token}`)
      .send({ fileName: 'test.txt', mimeType: 'text/plain', sizeBytes: 20971520, totalChunks: 2, checksum: 'abc123' });

    expect(res.status).toBe(200);
    expect(res.body.uploadId).toBeDefined();
    expect(res.body.chunkUrls).toHaveLength(2);
  });
});

describe('GET /upload/status/:uploadId', () => {
  it('returns uploaded chunks for a known upload', async () => {
    const initRes = await request(app)
      .post('/upload/init')
      .set('Authorization', `Bearer ${token}`)
      .send({ fileName: 'status-test.txt', mimeType: 'text/plain', sizeBytes: 10485760, totalChunks: 1, checksum: 'def456' });

    const { uploadId } = initRes.body;

    const res = await request(app)
      .get(`/upload/status/${uploadId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.uploadedChunks).toEqual([]);
    expect(res.body.totalChunks).toBe(1);
  });
});
