import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { pool } from '../db';

async function putChunk(url: string, body: Buffer): Promise<string> {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: new Uint8Array(body),
  });
  if (!res.ok) throw new Error(`PUT chunk failed: ${res.status}`);
  const eTag = res.headers.get('etag');
  if (!eTag) throw new Error('missing ETag');
  return eTag;
}

let token: string;
beforeAll(async () => {
  await pool.query("DELETE FROM users WHERE email = 'e2e-resume@example.com'");
  const res = await request(app).post('/auth/register').send({ email: 'e2e-resume@example.com', password: 'password123' });
  token = res.body.token;
});
afterAll(async () => {
  await pool.query("DELETE FROM users WHERE email = 'e2e-resume@example.com'");
  await pool.end();
});

describe('E2E resumable multipart', () => {
  it('records real chunks and completes reusing recorded eTags', async () => {
    // 5MB min part size for S3 multipart (except last part)
    const partSize = 5 * 1024 * 1024;
    const chunk1 = Buffer.alloc(partSize, 0x41);
    const chunk2 = Buffer.from('tail-data-second-part');

    const init = await request(app).post('/upload/init').set('Authorization', `Bearer ${token}`)
      .send({ fileName: 'e2e.bin', mimeType: 'application/octet-stream', sizeBytes: chunk1.length + chunk2.length, totalChunks: 2, checksum: 'e2echk' });
    const { uploadId, chunkUrls } = init.body;

    // Upload part 1, record it. Simulate crash before part 2.
    const etag1 = await putChunk(chunkUrls[0], chunk1);
    await request(app).post('/upload/chunk').set('Authorization', `Bearer ${token}`).send({ uploadId, partNumber: 1, eTag: etag1 });

    // --- RESUME: read status, see part 1 already done ---
    const status = await request(app).get(`/upload/status/${uploadId}`).set('Authorization', `Bearer ${token}`);
    expect(status.body.uploadedChunks).toEqual([`1:${etag1}`]);

    const resumedParts = status.body.uploadedChunks.map((e: string) => {
      const [num, ...rest] = e.split(':');
      return { partNumber: parseInt(num, 10), eTag: rest.join(':') };
    });

    // Only upload the missing part 2
    const etag2 = await putChunk(chunkUrls[1], chunk2);
    resumedParts.push({ partNumber: 2, eTag: etag2 });
    resumedParts.sort((a: any, b: any) => a.partNumber - b.partNumber);

    // Complete using the resumed (part1) + new (part2) eTags -> proves recorded eTag is valid for S3
    const complete = await request(app).post('/upload/complete').set('Authorization', `Bearer ${token}`).send({ uploadId, parts: resumedParts });
    expect(complete.status).toBe(200);
    expect(complete.body.file).toBeDefined();
    expect(complete.body.file.name).toBe('e2e.bin');
  }, 30000);
});
