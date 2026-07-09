import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import axios from 'axios';
import {
  setChecksum,
  getPendingUpload,
  setPendingUpload,
  clearPendingUpload,
} from './state';
import { withRetry } from './retry';

const API_URL = process.env.API_URL || 'http://localhost:3000';
let currentToken = process.env.SYNC_TOKEN || '';
const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB

export function setSyncToken(token: string) {
  currentToken = token;
}

function getApi() {
  return axios.create({
    baseURL: API_URL,
    headers: { Authorization: `Bearer ${currentToken}` },
  });
}

function computeChecksum(filePath: string): string {
  const hash = crypto.createHash('sha256');
  const BLOCK = CHUNK_SIZE;
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.allocUnsafe(BLOCK);
    let bytesRead: number;
    do {
      bytesRead = fs.readSync(fd, buf, 0, BLOCK, null);
      if (bytesRead > 0) hash.update(buf.subarray(0, bytesRead));
    } while (bytesRead === BLOCK);
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

export async function uploadFile(filePath: string, fileName: string): Promise<void> {
  const stat = fs.statSync(filePath);
  if (stat.size === 0) throw new Error(`Cannot upload empty file: ${fileName}`);

  const checksum = computeChecksum(filePath);
  const totalChunks = Math.ceil(stat.size / CHUNK_SIZE);

  let uploadId: string;
  let chunkUrls: string[];
  const parts: { partNumber: number; eTag: string }[] = [];

  // Try to resume a previously-interrupted upload of this exact file (same content).
  // The pending record survives process restarts, so an upload cut short by a crash
  // resumes from its last recorded chunk instead of starting over.
  const pending = getPendingUpload(filePath);
  let resumed = false;
  if (pending && pending.checksum === checksum) {
    try {
      const { data: status } = await getApi().get(`/upload/status/${pending.uploadId}?presign=1`);
      if (status.status === 'in_progress') {
        uploadId = pending.uploadId;
        chunkUrls = status.chunkUrls;
        for (const entry of (status.uploadedChunks || []) as string[]) {
          const [num, ...rest] = entry.split(':');
          parts.push({ partNumber: parseInt(num, 10), eTag: rest.join(':') });
        }
        resumed = true;
        console.log(`[sync] resuming ${fileName}: ${parts.length}/${totalChunks} chunks already uploaded`);
      }
    } catch {
      // Pending upload is gone/expired on the server; fall through to a fresh init.
    }
  }

  if (!resumed) {
    const { data: initData } = await getApi().post('/upload/init', {
      fileName,
      mimeType: 'application/octet-stream',
      sizeBytes: stat.size,
      totalChunks,
      checksum,
    });
    ({ uploadId, chunkUrls } = initData as { uploadId: string; chunkUrls: string[] });
    setPendingUpload(filePath, { uploadId, checksum });
  }

  const uploadedNumbers = new Set(parts.map((p) => p.partNumber));
  const fd = fs.openSync(filePath, 'r');
  try {
    for (let i = 0; i < totalChunks; i++) {
      const partNumber = i + 1;
      if (uploadedNumbers.has(partNumber)) continue; // already uploaded in a prior attempt

      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, stat.size);
      const chunkBuf = Buffer.allocUnsafe(end - start);
      fs.readSync(fd, chunkBuf, 0, end - start, start);

      // Retry a transient chunk failure in place so one network blip retries
      // only this part rather than bubbling up and aborting the file. A crash
      // that outlasts the retries still resumes from the last recorded chunk.
      const eTag = await withRetry(async () => {
        const res = await axios.put(chunkUrls![i], chunkBuf, {
          headers: { 'Content-Type': 'application/octet-stream' },
        });
        const tag = res.headers.etag;
        if (!tag) throw new Error(`Missing ETag for chunk ${partNumber} of ${fileName}`);
        // Persist the completed chunk so a later retry can resume instead of re-uploading it.
        await getApi().post('/upload/chunk', { uploadId: uploadId!, partNumber, eTag: tag });
        return tag;
      }, { onRetry: (attempt, err) => console.warn(`[sync] chunk ${partNumber}/${totalChunks} of ${fileName} failed (attempt ${attempt}), retrying:`, err instanceof Error ? err.message : err) });
      parts.push({ partNumber, eTag });
      console.log(`[sync] uploaded chunk ${partNumber}/${totalChunks} of ${fileName}`);
    }
  } finally {
    fs.closeSync(fd);
  }

  parts.sort((a, b) => a.partNumber - b.partNumber);
  await getApi().post('/upload/complete', { uploadId: uploadId!, parts });
  clearPendingUpload(filePath);
  setChecksum(filePath, checksum);
  console.log(`[sync] uploaded ${fileName}`);
}
