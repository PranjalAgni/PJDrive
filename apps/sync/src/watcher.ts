import chokidar from 'chokidar';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getChecksum, setChecksum, removeChecksum } from './state';
import { uploadFile } from './uploader';

const SYNC_FOLDER = path.join(process.cwd(), 'sync-folder');
const DEBOUNCE_MS = 500;
const HASH_BLOCK = 10 * 1024 * 1024; // 10MB

function computeChecksum(filePath: string): string {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.allocUnsafe(HASH_BLOCK);
    let bytesRead: number;
    do {
      bytesRead = fs.readSync(fd, buf, 0, HASH_BLOCK, null);
      if (bytesRead > 0) hash.update(buf.subarray(0, bytesRead));
    } while (bytesRead === HASH_BLOCK);
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

const recentlyDownloaded = new Set<string>();

export function markAsDownloaded(filePath: string) {
  recentlyDownloaded.add(filePath);
  // Clear after 2s to allow legitimate re-uploads later
  setTimeout(() => recentlyDownloaded.delete(filePath), 2000);
}

function scheduleUpload(filePath: string) {
  const existing = debounceTimers.get(filePath);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(async () => {
    debounceTimers.delete(filePath);
    if (recentlyDownloaded.has(filePath)) return; // skip echo
    try {
      const checksum = computeChecksum(filePath);
      const cached = getChecksum(filePath);
      if (checksum === cached) return;

      const fileName = path.basename(filePath);
      await uploadFile(filePath, fileName);
    } catch (err) {
      console.error(`[watcher] upload failed for ${filePath}:`, err);
    }
  }, DEBOUNCE_MS);

  debounceTimers.set(filePath, timer);
}

export function startWatcher() {
  const watcher = chokidar.watch(SYNC_FOLDER, {
    ignoreInitial: false,
    ignored: /(^|[/\\])\../,
  });

  watcher
    .on('add', (filePath) => {
      console.log(`[watcher] add: ${path.basename(filePath)}`);
      scheduleUpload(filePath);
    })
    .on('change', (filePath) => {
      console.log(`[watcher] change: ${path.basename(filePath)}`);
      scheduleUpload(filePath);
    })
    .on('unlink', (filePath) => {
      console.log(`[watcher] delete: ${path.basename(filePath)}`);
      removeChecksum(filePath);
    });

  console.log(`[watcher] watching ${SYNC_FOLDER}`);
  return watcher;
}
