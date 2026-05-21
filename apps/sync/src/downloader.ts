import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import axios from 'axios';
import { setChecksum } from './state';
import { markAsDownloaded } from './watcher';

const API_URL = process.env.API_URL || 'http://localhost:3000';
let currentToken = process.env.SYNC_TOKEN || '';
const SYNC_FOLDER = path.join(process.cwd(), 'sync-folder');

export function setSyncToken(token: string) {
  currentToken = token;
}

function getApi() {
  return axios.create({
    baseURL: API_URL,
    headers: { Authorization: `Bearer ${currentToken}` },
  });
}

export async function downloadFile(fileId: string): Promise<void> {
  const { data: fileMeta } = await getApi().get(`/files/${fileId}`);
  const destPath = path.join(SYNC_FOLDER, fileMeta.name);
  // Guard against path traversal
  const resolved = path.resolve(destPath);
  if (!resolved.startsWith(path.resolve(SYNC_FOLDER) + path.sep)) {
    throw new Error(`Unsafe file path: ${fileMeta.name}`);
  }

  const { data: urlData } = await getApi().get(`/files/${fileId}/download-url`);

  const response = await axios.get(urlData.url, { responseType: 'stream' });
  const writer = fs.createWriteStream(destPath);

  await new Promise<void>((resolve, reject) => {
    response.data.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', reject);
  });

  markAsDownloaded(destPath);

  // Prefer server-provided checksum; fall back to local computation
  const checksum = fileMeta.checksum || crypto.createHash('sha256').update(fs.readFileSync(destPath)).digest('hex');
  setChecksum(destPath, checksum);

  console.log(`[sync] downloaded ${fileMeta.name}`);
}

export async function deleteLocalFile(fileId: string): Promise<void> {
  try {
    const { data: fileMeta } = await getApi().get(`/files/${fileId}`);
    const destPath = path.join(SYNC_FOLDER, fileMeta.name);
    const resolved = path.resolve(destPath);
    if (!resolved.startsWith(path.resolve(SYNC_FOLDER) + path.sep)) {
      throw new Error(`Unsafe file path: ${fileMeta.name}`);
    }
    if (fs.existsSync(destPath)) {
      fs.unlinkSync(destPath);
      console.log(`[sync] deleted local ${fileMeta.name}`);
    }
  } catch {
    // File already gone from DB — ignore
  }
}
