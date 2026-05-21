import { BrowserWindow } from 'electron';
import path from 'path';
import EventSource from 'eventsource';
import axios from 'axios';
import fs from 'fs';
import { startWatcher, markAsDownloaded } from '../../../sync/src/watcher';
import { downloadFile, deleteLocalFile, setSyncToken as setDownloaderToken } from '../../../sync/src/downloader';
import { setSyncToken as setUploaderToken } from '../../../sync/src/uploader';
import { getLastSyncAt, setLastSyncAt } from '../../../sync/src/state';

const API_URL = process.env.API_URL || 'http://localhost:3000';
const SYNC_FOLDER = path.join(process.cwd(), 'sync-folder');
const POLL_INTERVAL_MS = 30000;

// Patch setChecksum once at module load to detect completed uploads
let currentWin: BrowserWindow | null = null;
const stateModule = require('../../../sync/src/state') as typeof import('../../../sync/src/state');
const origSetChecksum = stateModule.setChecksum;
stateModule.setChecksum = (filePath: string, checksum: string) => {
  origSetChecksum(filePath, checksum);
  if (currentWin && !currentWin.isDestroyed() && filePath.startsWith(SYNC_FOLDER)) {
    emitActivity(currentWin, 'upload', path.basename(filePath));
  }
};

// ── State ────────────────────────────────────────────────────────────────────

interface SyncStatus {
  connected: boolean;
  mode: 'sse' | 'poll' | 'off';
  email: string;
}

let status: SyncStatus = { connected: false, mode: 'off', email: '' };
let watcher: ReturnType<typeof startWatcher> | null = null;
let es: EventSource | null = null;
let pollInterval: ReturnType<typeof setInterval> | null = null;
let currentToken: string = '';

export function getSyncStatus(): SyncStatus {
  return { ...status };
}

// ── Activity emission ─────────────────────────────────────────────────────────

function emitActivity(win: BrowserWindow, type: 'upload' | 'download', fileName: string) {
  if (win.isDestroyed()) return;
  win.webContents.send('activity', {
    type,
    fileName,
    timestamp: new Date().toISOString(),
  });
}

// ── Polling fallback ──────────────────────────────────────────────────────────

function makeApi() {
  return axios.create({
    baseURL: API_URL,
    headers: { Authorization: `Bearer ${currentToken}` },
  });
}

async function poll(win: BrowserWindow) {
  const since = getLastSyncAt();
  try {
    const { data } = await makeApi().get(`/sync/changes?since=${since}`);
    for (const event of data as { file_id: string; event_type: string }[]) {
      if (event.event_type === 'created' || event.event_type === 'updated') {
        const beforeFiles = fs.existsSync(SYNC_FOLDER) ? fs.readdirSync(SYNC_FOLDER) : [];
        await downloadFile(event.file_id);
        const afterFiles = fs.existsSync(SYNC_FOLDER) ? fs.readdirSync(SYNC_FOLDER) : [];
        const newFile = afterFiles.find(f => !beforeFiles.includes(f));
        if (newFile) {
          markAsDownloaded(path.join(SYNC_FOLDER, newFile));
          emitActivity(win, 'download', newFile);
        }
      } else if (event.event_type === 'deleted') {
        await deleteLocalFile(event.file_id);
      }
    }
    setLastSyncAt(new Date().toISOString());
  } catch (err) {
    console.error('[desktop sync] poll error:', err);
  }
}

// ── SSE connection ────────────────────────────────────────────────────────────

function connectSSE(win: BrowserWindow) {
  es = new EventSource(`${API_URL}/sync/events`, {
    headers: { Authorization: `Bearer ${currentToken}` },
  });

  es.onopen = () => {
    status.connected = true;
    status.mode = 'sse';
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  };

  es.onmessage = async (e) => {
    try {
      const event = JSON.parse(e.data) as { fileId: string; eventType: string };
      if (event.eventType === 'created' || event.eventType === 'updated') {
        const beforeFiles = fs.existsSync(SYNC_FOLDER) ? fs.readdirSync(SYNC_FOLDER) : [];
        await downloadFile(event.fileId);
        const afterFiles = fs.existsSync(SYNC_FOLDER) ? fs.readdirSync(SYNC_FOLDER) : [];
        const newFile = afterFiles.find(f => !beforeFiles.includes(f));
        if (newFile) {
          markAsDownloaded(path.join(SYNC_FOLDER, newFile));
          emitActivity(win, 'download', newFile);
        }
      } else if (event.eventType === 'deleted') {
        await deleteLocalFile(event.fileId);
      }
      setLastSyncAt(new Date().toISOString());
    } catch (err) {
      console.error('[desktop sync] SSE event error:', err);
    }
  };

  es.onerror = () => {
    status.connected = false;
    status.mode = 'poll';
    es?.close();
    es = null;
    if (!pollInterval) {
      pollInterval = setInterval(() => poll(win), POLL_INTERVAL_MS);
    }
    setTimeout(() => connectSSE(win), 5000);
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function startSync(token: string, email: string, win: BrowserWindow) {
  currentToken = token;
  status.email = email;
  setDownloaderToken(token);
  setUploaderToken(token);

  // Ensure sync-folder exists
  if (!fs.existsSync(SYNC_FOLDER)) {
    fs.mkdirSync(SYNC_FOLDER, { recursive: true });
  }

  currentWin = win;

  // Catch up on missed remote changes
  await poll(win);

  // Start chokidar watcher for local → remote
  watcher = startWatcher();

  // Start SSE for remote → local
  connectSSE(win);
}

export function stopSync() {
  watcher?.close();
  watcher = null;
  es?.close();
  es = null;
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  status = { connected: false, mode: 'off', email: '' };
  currentToken = '';
  currentWin = null;
}
