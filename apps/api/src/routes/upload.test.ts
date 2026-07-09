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

  it('returns fresh presigned chunk URLs for an in-progress upload so a resume can re-PUT parts', async () => {
    const initRes = await request(app)
      .post('/upload/init')
      .set('Authorization', `Bearer ${token}`)
      .send({ fileName: 'resume-urls.txt', mimeType: 'text/plain', sizeBytes: 3 * 10485760, totalChunks: 3, checksum: 'urls123' });

    const { uploadId } = initRes.body;

    const res = await request(app)
      .get(`/upload/status/${uploadId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('in_progress');
    expect(res.body.chunkUrls).toHaveLength(3);
    expect(res.body.chunkUrls[0]).toContain('partNumber=1');
  });
});

describe('POST /upload/chunk', () => {
  async function initUpload(totalChunks: number) {
    const initRes = await request(app)
      .post('/upload/init')
      .set('Authorization', `Bearer ${token}`)
      .send({ fileName: 'chunk-test.txt', mimeType: 'text/plain', sizeBytes: totalChunks * 10485760, totalChunks, checksum: 'chk789' });
    return initRes.body.uploadId as string;
  }

  it('requires auth', async () => {
    const res = await request(app).post('/upload/chunk').send({});
    expect(res.status).toBe(401);
  });

  it('records a completed chunk so it surfaces in status and enables resume', async () => {
    const uploadId = await initUpload(2);

    const chunkRes = await request(app)
      .post('/upload/chunk')
      .set('Authorization', `Bearer ${token}`)
      .send({ uploadId, partNumber: 1, eTag: '"etag-abc"' });
    expect(chunkRes.status).toBe(200);

    const statusRes = await request(app)
      .get(`/upload/status/${uploadId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(statusRes.body.uploadedChunks).toEqual(['1:"etag-abc"']);
    expect(statusRes.body.totalChunks).toBe(2);
  });

  it('is idempotent - recording the same chunk twice does not duplicate it', async () => {
    const uploadId = await initUpload(2);

    await request(app)
      .post('/upload/chunk')
      .set('Authorization', `Bearer ${token}`)
      .send({ uploadId, partNumber: 1, eTag: '"etag-dup"' });
    await request(app)
      .post('/upload/chunk')
      .set('Authorization', `Bearer ${token}`)
      .send({ uploadId, partNumber: 1, eTag: '"etag-dup"' });

    const statusRes = await request(app)
      .get(`/upload/status/${uploadId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(statusRes.body.uploadedChunks).toEqual(['1:"etag-dup"']);
  });

  it('rejects recording a chunk for another user\'s upload', async () => {
    const uploadId = await initUpload(1);

    await pool.query("DELETE FROM users WHERE email = 'other-upload@example.com'");
    const otherRes = await request(app)
      .post('/auth/register')
      .send({ email: 'other-upload@example.com', password: 'password123' });
    const otherToken = otherRes.body.token;

    const chunkRes = await request(app)
      .post('/upload/chunk')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ uploadId, partNumber: 1, eTag: '"etag-x"' });
    expect(chunkRes.status).toBe(404);

    await pool.query("DELETE FROM users WHERE email = 'other-upload@example.com'");
  });
});
