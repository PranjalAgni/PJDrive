import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { app } from '../index';
import { pool } from '../db';
import { s3, BUCKET } from '../storage';
import { GetObjectCommand, ListMultipartUploadsCommand } from '@aws-sdk/client-s3';

// End-to-end demonstration of resumable multipart upload against the live
// MinIO + Postgres, mirroring exactly what a client (web/sync) does:
//   1. init -> get uploadId + presigned chunk URLs
//   2. PUT only chunk 1 to S3, then "crash" (never send chunk 2)
//   3. re-init with same owner/checksum/totalChunks/name -> SAME uploadId,
//      reuses the SAME live S3 multipart session (no orphaned session)
//   4. GET /status -> S3 ListParts reports chunk 1 already present
//   5. client PUTs only the MISSING chunk 2
//   6. complete -> final object in S3 equals chunk1 + chunk2 bytes
let token: string;

// Two 5MB chunks (S3 multipart requires >=5MB for non-final parts).
const CHUNK = 5 * 1024 * 1024;
const chunk1 = Buffer.alloc(CHUNK, 0x41); // 'A'
const chunk2 = Buffer.alloc(CHUNK, 0x42); // 'B'
const fullBody = Buffer.concat([chunk1, chunk2]);
const checksum = crypto.createHash('sha256').update(fullBody).digest('hex');
const fileName = 'resume-e2e.bin';

async function putChunk(url: string, body: Buffer): Promise<string> {
  const res = await fetch(url, {
    method: 'PUT',
    body: new Uint8Array(body),
    headers: { 'Content-Type': 'application/octet-stream' },
  });
  if (!res.ok) throw new Error(`PUT chunk failed: ${res.status} ${await res.text()}`);
  const etag = res.headers.get('etag');
  if (!etag) throw new Error('missing etag');
  return etag;
}

beforeAll(async () => {
  await pool.query("DELETE FROM users WHERE email = 'resume-e2e@example.com'");
  const res = await request(app)
    .post('/auth/register')
    .send({ email: 'resume-e2e@example.com', password: 'password123' });
  token = res.body.token;
});

afterAll(async () => {
  await pool.query("DELETE FROM users WHERE email = 'resume-e2e@example.com'");
  await pool.end();
});

describe('resumable multipart upload (E2E vs live MinIO)', () => {
  it('resumes an interrupted upload: same session, re-sends only the missing chunk', async () => {
    const initBody = {
      fileName,
      mimeType: 'application/octet-stream',
      sizeBytes: fullBody.length,
      totalChunks: 2,
      checksum,
    };

    // 1. First init
    const init1 = await request(app)
      .post('/upload/init')
      .set('Authorization', `Bearer ${token}`)
      .send(initBody);
    expect(init1.status).toBe(200);
    const uploadId = init1.body.uploadId;
    const urls1: string[] = init1.body.chunkUrls;
    expect(urls1).toHaveLength(2);

    // Snapshot the live S3 multipart UploadId for this session.
    const row1 = await pool.query('SELECT upload_id, file_id FROM uploads WHERE id = $1', [uploadId]);
    const s3UploadId1 = row1.rows[0].upload_id;

    // 2. Upload ONLY chunk 1, then simulate a crash (never send chunk 2).
    const etag1 = await putChunk(urls1[0], chunk1);
    console.log(`[e2e] uploaded chunk 1, then crashed. s3 uploadId=${s3UploadId1}`);

    // 3. Resume: re-init with identical params -> must return the SAME uploadId
    //    and reuse the SAME S3 multipart session (not orphan it).
    const init2 = await request(app)
      .post('/upload/init')
      .set('Authorization', `Bearer ${token}`)
      .send(initBody);
    expect(init2.status).toBe(200);
    expect(init2.body.uploadId).toBe(uploadId);
    const urls2: string[] = init2.body.chunkUrls;

    const row2 = await pool.query('SELECT upload_id FROM uploads WHERE id = $1', [uploadId]);
    expect(row2.rows[0].upload_id).toBe(s3UploadId1); // same live session reused
    console.log('[e2e] resume returned SAME uploadId and SAME S3 session');

    // Only one in-progress multipart session should exist for this key (no orphans).
    const mpu = await s3.send(new ListMultipartUploadsCommand({ Bucket: BUCKET }));
    const forThisFile = (mpu.Uploads ?? []).filter((u) => u.UploadId === s3UploadId1);
    expect(forThisFile.length).toBe(1);

    // 4. Status: S3 ListParts is source of truth -> chunk 1 already present.
    const status = await request(app)
      .get(`/upload/status/${uploadId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(status.status).toBe(200);
    expect(status.body.totalChunks).toBe(2);
    expect(status.body.uploadedChunks).toHaveLength(1);
    expect(status.body.uploadedChunks[0].partNumber).toBe(1);
    expect(status.body.uploadedChunks[0].eTag).toBe(etag1);
    console.log(`[e2e] /status reports chunk 1 already uploaded: ${JSON.stringify(status.body.uploadedChunks)}`);

    // 5. Client seeds parts from status and re-sends ONLY the missing chunk 2.
    const alreadyUploaded: { partNumber: number; eTag: string }[] = status.body.uploadedChunks;
    const alreadyNums = new Set(alreadyUploaded.map((p) => p.partNumber));
    const parts = [...alreadyUploaded];
    expect(alreadyNums.has(1)).toBe(true); // chunk 1 skipped, not re-sent
    const etag2 = await putChunk(urls2[1], chunk2);
    parts.push({ partNumber: 2, eTag: etag2 });
    console.log('[e2e] skipped chunk 1, uploaded only missing chunk 2');

    // 6. Complete and verify the final object equals chunk1+chunk2.
    const complete = await request(app)
      .post('/upload/complete')
      .set('Authorization', `Bearer ${token}`)
      .send({ uploadId, parts });
    expect(complete.status).toBe(200);
    expect(complete.body.file).toBeDefined();

    const keyRow = await pool.query('SELECT storage_key FROM files WHERE id = $1', [row1.rows[0].file_id]);
    const storageKey = keyRow.rows[0].storage_key;
    const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: storageKey }));
    const bytes = Buffer.from(await obj.Body!.transformToByteArray());
    expect(bytes.length).toBe(fullBody.length);
    const gotChecksum = crypto.createHash('sha256').update(bytes).digest('hex');
    expect(gotChecksum).toBe(checksum);
    console.log(`[e2e] final S3 object verified: ${bytes.length} bytes, sha256 matches (${gotChecksum.slice(0, 12)}...)`);
  }, 30000);

  it('recovers a dead S3 session: marks stale row failed and issues a fresh session', async () => {
    const initBody = {
      fileName: 'dead-session-e2e.bin',
      mimeType: 'application/octet-stream',
      sizeBytes: fullBody.length,
      totalChunks: 2,
      checksum: 'dead-session-checksum',
    };

    const init1 = await request(app)
      .post('/upload/init')
      .set('Authorization', `Bearer ${token}`)
      .send(initBody);
    expect(init1.status).toBe(200);
    const uploadId1 = init1.body.uploadId;

    // Kill the S3 multipart session out from under us (bucket lifecycle / restart).
    const row = await pool.query('SELECT upload_id, file_id FROM uploads WHERE id = $1', [uploadId1]);
    const s3UploadId = row.rows[0].upload_id;
    const fileRow = await pool.query('SELECT storage_key FROM files WHERE id = $1', [row.rows[0].file_id]);
    const storageKey = fileRow.rows[0].storage_key;
    const { AbortMultipartUploadCommand } = await import('@aws-sdk/client-s3');
    await s3.send(new AbortMultipartUploadCommand({ Bucket: BUCKET, Key: storageKey, UploadId: s3UploadId }));
    console.log('[e2e] aborted the S3 multipart session (dead session)');

    // Re-init: should detect NoSuchUpload, fail the stale row, and mint a fresh one.
    const init2 = await request(app)
      .post('/upload/init')
      .set('Authorization', `Bearer ${token}`)
      .send(initBody);
    expect(init2.status).toBe(200);
    expect(init2.body.uploadId).not.toBe(uploadId1);

    const staleStatus = await pool.query('SELECT status FROM uploads WHERE id = $1', [uploadId1]);
    expect(staleStatus.rows[0].status).toBe('failed');
    console.log(`[e2e] dead session recovered: old row -> '${staleStatus.rows[0].status}', new uploadId=${init2.body.uploadId}`);
  }, 30000);
});
