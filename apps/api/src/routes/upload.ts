import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { initiateMultipart, presignChunkUpload, completeMultipart } from '../storage';
import { broadcastSyncEvent } from './sync';
import {
  insertFile,
  insertUpload,
  getUploadStatus,
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
    const rows = await getUploadStatus.run(
      { uploadId: req.params.uploadId, ownerId: req.userId! },
      pool,
    );
    if (rows.length === 0) return res.status(404).json({ error: 'upload not found' });
    return res.json({ uploadedChunks: rows[0].uploaded_chunks, totalChunks: rows[0].total_chunks });
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

    const rows = await recordChunk.run(
      {
        uploadId,
        ownerId: req.userId!,
        partNumber: String(partNumber),
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
    const { uploadId, parts } = parsed.data;

    const uploadRows = await getUploadWithFile.run({ uploadId, ownerId: req.userId! }, pool);
    if (uploadRows.length === 0) return res.status(404).json({ error: 'upload not found' });

    const upload = uploadRows[0];

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
