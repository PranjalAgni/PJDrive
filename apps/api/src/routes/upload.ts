import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { initiateMultipart, presignChunkUpload, completeMultipart, listParts, abortMultipart } from '../storage';
import { broadcastSyncEvent } from './sync';
import {
  insertFile,
  insertUpload,
  getInProgressUpload,
  getUploadWithFile,
  completeUpload,
  failUpload,
  trashOrphanedUploadFile,
  insertSyncLogCreated,
  getFileById,
} from './upload.queries';
import { InitUploadBody, CompleteUploadBody, parseBody } from '../schemas';

export const uploadRouter = Router();

uploadRouter.post('/init', requireAuth, async (req: AuthRequest, res) => {
  try {
    const parsed = parseBody(InitUploadBody, req.body, res);
    if (!parsed.ok) return;
    const { fileName, mimeType, sizeBytes, totalChunks, checksum, folderId } = parsed.data;

    // Resume path: if the same owner is retrying an in-progress upload for the
    // same content (checksum), shape (totalChunks), and destination
    // (fileName + folderId), reuse the existing file row + S3 multipart
    // session instead of orphaning them.
    const existingRows = await getInProgressUpload.run(
      { ownerId: req.userId!, checksum, totalChunks, fileName, folderId: folderId ?? null },
      pool,
    );
    if (existingRows.length > 0) {
      const existing = existingRows[0];
      // The S3 multipart session must still be alive for a resume to work.
      // If it has been aborted/expired (bucket lifecycle, manual abort, MinIO
      // restart), listParts throws NoSuchUpload; re-presigning against the dead
      // upload_id would wedge every retry forever. Mark the stale row failed and
      // fall through to create a fresh session.
      let sessionAlive = true;
      try {
        await listParts(existing.storage_key, existing.upload_id);
      } catch (err) {
        const code = (err as { name?: string; Code?: string }).name
          ?? (err as { name?: string; Code?: string }).Code;
        if (code === 'NoSuchUpload') {
          // MinIO can spuriously throw NoSuchUpload on an empty-but-alive
          // session (see /status). Abort before abandoning so a live-but-empty
          // session is cleaned up rather than orphaned; on a truly dead session
          // the abort is a harmless no-op that may itself throw NoSuchUpload.
          try {
            await abortMultipart(existing.storage_key, existing.upload_id);
          } catch (abortErr) {
            const abortCode = (abortErr as { name?: string; Code?: string }).name
              ?? (abortErr as { name?: string; Code?: string }).Code;
            if (abortCode !== 'NoSuchUpload') throw abortErr;
          }
          await failUpload.run({ uploadId: existing.id }, pool);
          if (existing.file_id) {
            await trashOrphanedUploadFile.run(
              { fileId: existing.file_id, ownerId: req.userId! },
              pool,
            );
          }
          sessionAlive = false;
        } else {
          throw err;
        }
      }
      if (sessionAlive) {
        const chunkUrls: string[] = [];
        for (let i = 1; i <= totalChunks; i++) {
          chunkUrls.push(await presignChunkUpload(existing.storage_key, existing.upload_id, i));
        }
        return res.json({ uploadId: existing.id, chunkUrls });
      }
    }

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

    // S3 is the source of truth for uploaded parts (correct eTags, no DB writes
    // per chunk). If the multipart session is gone (NoSuchUpload / expired /
    // aborted, and MinIO's occasional quirks on empty sessions), treat it as
    // "nothing uploaded yet" so the client can proceed or re-init cleanly.
    let parts: { PartNumber: number; ETag: string }[] = [];
    try {
      parts = await listParts(upload.storage_key, upload.upload_id);
    } catch (err) {
      const code = (err as { name?: string; Code?: string }).name
        ?? (err as { name?: string; Code?: string }).Code;
      if (code === 'NoSuchUpload') {
        parts = [];
      } else {
        throw err;
      }
    }

    return res.json({
      uploadedChunks: parts.map((p) => ({ partNumber: p.PartNumber, eTag: p.ETag })),
      totalChunks: upload.total_chunks,
    });
  } catch (err) {
    console.error('upload status error:', err);
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
