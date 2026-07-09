import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { initiateMultipart, presignChunkUpload, completeMultipart } from '../storage';
import { broadcastSyncEvent } from './sync';
import {
  insertFile,
  insertUpload,
  getUploadWithFile,
  recordChunk,
  completeUpload,
  insertSyncLogCreated,
  getFileById,
} from './upload.queries';
import { InitUploadBody, RecordChunkBody, CompleteUploadBody, parseBody } from '../schemas';

export const uploadRouter = Router();

uploadRouter.post('/init', requireAuth, async (req: AuthRequest, res) => {
  try {
    const parsed = parseBody(InitUploadBody, req.body, res);
    if (!parsed.ok) return;
    const { fileName, mimeType, sizeBytes, totalChunks, checksum, folderId } = parsed.data;

    const storageKey = `${req.userId}/${uuidv4()}/${fileName}`;

    const fileRows = await insertFile.run(
      { ownerId: req.userId!, name: fileName, mimeType, sizeBytes, storageKey, checksum, folderId: folderId ?? null },
      pool,
    );
    const fileId = fileRows[0].id;

    const s3UploadId = await initiateMultipart(storageKey);

    const chunkUrls: string[] = [];
    for (let i = 1; i <= totalChunks; i++) {
      chunkUrls.push(await presignChunkUpload(storageKey, s3UploadId, i));
    }

    const uploadRows = await insertUpload.run(
      { fileId, ownerId: req.userId!, uploadId: s3UploadId, totalChunks },
      pool,
    );

    return res.json({ uploadId: uploadRows[0].id, chunkUrls });
  } catch (err) {
    console.error('upload init error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

uploadRouter.get('/status/:uploadId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await getUploadWithFile.run(
      { uploadId: req.params.uploadId, ownerId: req.userId! },
      pool,
    );
    if (rows.length === 0) return res.status(404).json({ error: 'upload not found' });

    const upload = rows[0];
    // Re-presign fresh chunk URLs so a resumed upload can PUT its remaining parts
    // even after the original init-time URLs have expired (they are never persisted client-side).
    // Only meaningful while the upload is still in progress, and only for genuine
    // resume callers that opt in via ?presign=1 - presigning every part is costly
    // (up to 10,000 signatures) and pointless for callers that only poll progress.
    const chunkUrls: string[] = [];
    if (upload.status === 'in_progress' && req.query.presign === '1') {
      for (let i = 1; i <= upload.total_chunks; i++) {
        chunkUrls.push(await presignChunkUpload(upload.storage_key, upload.upload_id, i));
      }
    }

    return res.json({
      uploadedChunks: upload.uploaded_chunks,
      totalChunks: upload.total_chunks,
      status: upload.status,
      chunkUrls,
    });
  } catch (err) {
    console.error('upload status error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

uploadRouter.post('/chunk', requireAuth, async (req: AuthRequest, res) => {
  try {
    const parsed = parseBody(RecordChunkBody, req.body, res);
    if (!parsed.ok) return;
    const { uploadId, partNumber, eTag } = parsed.data;

    const uploadRows = await getUploadWithFile.run({ uploadId, ownerId: req.userId! }, pool);
    // No row => upload doesn't exist or isn't owned by this user.
    if (uploadRows.length === 0) return res.status(404).json({ error: 'upload not found' });

    const upload = uploadRows[0];
    if (upload.status !== 'in_progress') {
      return res.status(409).json({ error: 'upload not in progress' });
    }
    // Reject parts outside the declared range so a client cannot record a bogus
    // high part that was never PUT to S3, which would later fail completion.
    if (partNumber > upload.total_chunks) {
      return res.status(400).json({
        error: 'partNumber out of range',
        partNumber,
        totalChunks: upload.total_chunks,
      });
    }

    const rows = await recordChunk.run(
      {
        uploadId,
        ownerId: req.userId!,
        partNumber,
        chunkEntry: `${partNumber}:${eTag}`,
      },
      pool,
    );
    // No row updated => upload doesn't exist, isn't owned by this user, or is already complete.
    if (rows.length === 0) return res.status(404).json({ error: 'upload not found' });

    return res.json({ ok: true });
  } catch (err) {
    console.error('upload chunk error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

uploadRouter.post('/complete', requireAuth, async (req: AuthRequest, res) => {
  try {
    const parsed = parseBody(CompleteUploadBody, req.body, res);
    if (!parsed.ok) return;
    const { uploadId } = parsed.data;

    const uploadRows = await getUploadWithFile.run({ uploadId, ownerId: req.userId! }, pool);
    if (uploadRows.length === 0) return res.status(404).json({ error: 'upload not found' });

    const upload = uploadRows[0];

    // The server is the source of truth for which parts landed: it records every
    // chunk's ETag in uploaded_chunks as each PUT succeeds. We ignore the client's
    // self-reported parts list here so a buggy or resumed client can't finalize a
    // silently truncated file by omitting a part. Reconstruct the parts from the
    // recorded chunks and refuse to complete unless every part 1..total_chunks is present.
    const recorded = new Map<number, string>();
    for (const entry of (upload.uploaded_chunks as string[] | null) ?? []) {
      const idx = entry.indexOf(':');
      if (idx <= 0) continue;
      const partNumber = parseInt(entry.slice(0, idx), 10);
      const eTag = entry.slice(idx + 1);
      if (Number.isInteger(partNumber) && eTag) recorded.set(partNumber, eTag);
    }

    const missing: number[] = [];
    for (let i = 1; i <= upload.total_chunks; i++) {
      if (!recorded.has(i)) missing.push(i);
    }
    if (missing.length > 0) {
      return res.status(409).json({
        error: 'upload incomplete',
        missingParts: missing,
        recordedParts: recorded.size,
        totalChunks: upload.total_chunks,
      });
    }

    // Build the manifest strictly from in-range parts 1..total_chunks (already
    // proven present above) so a stray recorded part beyond total_chunks can
    // never be sent to S3, which would otherwise reject the whole completion.
    const parts: { partNumber: number; eTag: string }[] = [];
    for (let i = 1; i <= upload.total_chunks; i++) {
      parts.push({ partNumber: i, eTag: recorded.get(i)! });
    }

    await completeMultipart(
      upload.storage_key,
      upload.upload_id,
      parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.eTag })),
    );

    await completeUpload.run({ uploadId }, pool);
    await insertSyncLogCreated.run({ userId: req.userId!, fileId: upload.file_id }, pool);
    broadcastSyncEvent(req.userId!, { fileId: upload.file_id!, eventType: 'created' });

    const fileRows = await getFileById.run({ fileId: upload.file_id }, pool);
    return res.json({ file: fileRows[0] });
  } catch (err) {
    console.error('upload complete error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});
