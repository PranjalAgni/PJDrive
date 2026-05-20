import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import axios from 'axios';
import { setChecksum } from './state';

const API_URL = process.env.API_URL || 'http://localhost:3000';
const TOKEN = process.env.SYNC_TOKEN || '';
const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB

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

const api = axios.create({
  baseURL: API_URL,
  headers: { Authorization: `Bearer ${TOKEN}` },
});

export async function uploadFile(filePath: string, fileName: string): Promise<void> {
  const stat = fs.statSync(filePath);
  if (stat.size === 0) throw new Error(`Cannot upload empty file: ${fileName}`);

  const checksum = computeChecksum(filePath);
  const totalChunks = Math.ceil(stat.size / CHUNK_SIZE);

  const { data: initData } = await api.post('/upload/init', {
    fileName,
    mimeType: 'application/octet-stream',
    sizeBytes: stat.size,
    totalChunks,
    checksum,
  });

  const { uploadId, chunkUrls } = initData as { uploadId: string; chunkUrls: string[] };
  const parts: { partNumber: number; eTag: string }[] = [];
  const fd = fs.openSync(filePath, 'r');
  try {
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, stat.size);
      const chunkBuf = Buffer.allocUnsafe(end - start);
      fs.readSync(fd, chunkBuf, 0, end - start, start);

      const res = await axios.put(chunkUrls[i], chunkBuf, {
        headers: { 'Content-Type': 'application/octet-stream' },
      });
      const eTag = res.headers.etag;
      if (!eTag) throw new Error(`Missing ETag for chunk ${i + 1} of ${fileName}`);
      parts.push({ partNumber: i + 1, eTag });
      console.log(`[sync] uploaded chunk ${i + 1}/${totalChunks} of ${fileName}`);
    }
  } finally {
    fs.closeSync(fd);
  }

  parts.sort((a, b) => a.partNumber - b.partNumber);
  await api.post('/upload/complete', { uploadId, parts });
  setChecksum(filePath, checksum);
  console.log(`[sync] uploaded ${fileName}`);
}
