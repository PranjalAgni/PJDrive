import fs from 'fs';
import path from 'path';

const STATE_FILE = path.join(__dirname, '..', '.sync-state.json');

// An upload that was started but not yet completed. Persisted so that if the
// process crashes or restarts mid-upload, the next attempt resumes the same S3
// multipart upload instead of re-uploading every chunk from scratch.
export interface PendingUpload {
  uploadId: string;
  checksum: string;
}

interface SyncState {
  checksums: Record<string, string>;
  pendingUploads: Record<string, PendingUpload>;
  lastSyncAt: string;
}

function load(): SyncState {
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return { pendingUploads: {}, ...parsed };
  } catch {
    return { checksums: {}, pendingUploads: {}, lastSyncAt: new Date(0).toISOString() };
  }
}

function save(state: SyncState) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export function getChecksum(filePath: string): string | undefined {
  return load().checksums[filePath];
}

export function setChecksum(filePath: string, checksum: string) {
  const state = load();
  state.checksums[filePath] = checksum;
  save(state);
}

export function removeChecksum(filePath: string) {
  const state = load();
  delete state.checksums[filePath];
  save(state);
}

export function getPendingUpload(filePath: string): PendingUpload | undefined {
  return load().pendingUploads[filePath];
}

export function setPendingUpload(filePath: string, pending: PendingUpload) {
  const state = load();
  state.pendingUploads[filePath] = pending;
  save(state);
}

export function clearPendingUpload(filePath: string) {
  const state = load();
  delete state.pendingUploads[filePath];
  save(state);
}

export function getLastSyncAt(): string {
  return load().lastSyncAt;
}

export function setLastSyncAt(ts: string) {
  const state = load();
  state.lastSyncAt = ts;
  save(state);
}
