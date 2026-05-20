import fs from 'fs';
import path from 'path';

const STATE_FILE = path.join(__dirname, '..', '.sync-state.json');

interface SyncState {
  checksums: Record<string, string>;
  lastSyncAt: string;
}

function load(): SyncState {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { checksums: {}, lastSyncAt: new Date(0).toISOString() };
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

export function getLastSyncAt(): string {
  return load().lastSyncAt;
}

export function setLastSyncAt(ts: string) {
  const state = load();
  state.lastSyncAt = ts;
  save(state);
}
