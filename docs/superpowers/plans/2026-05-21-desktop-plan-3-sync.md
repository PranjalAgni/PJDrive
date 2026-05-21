# Desktop App — Plan 3: Sync Integration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing `apps/sync` logic (watcher + SSE) into the Electron main process, emit `activity` events to the renderer, and expose real sync status.

**Architecture:** `sync.ts` in the main process imports from `apps/sync/src/` directly. It manages watcher + SSE lifecycle (start on login, stop on logout/quit). It emits `activity` IPC events to the renderer via `BrowserWindow.webContents.send('activity', ...)`. The `sync:status` IPC handler returns live connection state.

**Tech Stack:** chokidar (via apps/sync), eventsource (via apps/sync), Electron IPC

**Prerequisites:** Plan 2 complete — auth works, Dashboard shows "Disconnected".

---

## File Structure

```
apps/desktop/src/
└── main/
    ├── index.ts     ← modified: call startSync on launch if token exists, stopSync on quit
    ├── ipc.ts       ← modified: sync:status returns real state
    └── sync.ts      ← NEW: start/stop watcher + SSE, emit activity events
```

---

### Task 1: Create sync.ts — watcher + SSE manager

**Files:**
- Create: `apps/desktop/src/main/sync.ts`

- [ ] **Step 1: Create apps/desktop/src/main/sync.ts**

```typescript
import { BrowserWindow } from 'electron';
import path from 'path';
import EventSource from 'eventsource';
import { startWatcher, markAsDownloaded } from '../../../sync/src/watcher';
import { downloadFile, deleteLocalFile } from '../../../sync/src/downloader';
import { getLastSyncAt, setLastSyncAt } from '../../../sync/src/state';
import axios from 'axios';
import type { FSWatcher } from 'chokidar';

const API_URL = process.env.API_URL || 'http://localhost:3000';
const SYNC_FOLDER = path.join(process.cwd(), 'sync-folder');
const POLL_INTERVAL_MS = 30000;

// ── State ────────────────────────────────────────────────────────────────────

interface SyncStatus {
  connected: boolean;
  mode: 'sse' | 'poll' | 'off';
  email: string;
}

let status: SyncStatus = { connected: false, mode: 'off', email: '' };
let watcher: FSWatcher | null = null;
let es: EventSource | null = null;
let pollInterval: ReturnType<typeof setInterval> | null = null;
let token: string = '';

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

// ── SSE connection ────────────────────────────────────────────────────────────

function connectSSE(win: BrowserWindow) {
  es = new EventSource(`${API_URL}/sync/events`, {
    headers: { Authorization: `Bearer ${token}` },
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
        const before = require('fs').readdirSync(SYNC_FOLDER);
        await downloadFile(event.fileId);
        const after = require('fs').readdirSync(SYNC_FOLDER);
        const newFile = after.find((f: string) => !before.includes(f));
        emitActivity(win, 'download', newFile ?? event.fileId);
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

// ── Polling fallback ──────────────────────────────────────────────────────────

async function poll(win: BrowserWindow) {
  const since = getLastSyncAt();
  try {
    const api = axios.create({ baseURL: API_URL, headers: { Authorization: `Bearer ${token}` } });
    const { data } = await api.get(`/sync/changes?since=${since}`);
    for (const event of data as { file_id: string; event_type: string }[]) {
      if (event.event_type === 'created' || event.event_type === 'updated') {
        await downloadFile(event.file_id);
        emitActivity(win, 'download', event.file_id);
      } else if (event.event_type === 'deleted') {
        await deleteLocalFile(event.file_id);
      }
      setLastSyncAt(new Date().toISOString());
    }
  } catch (err) {
    console.error('[desktop sync] poll error:', err);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function startSync(storedToken: string, email: string, win: BrowserWindow) {
  token = storedToken;
  status.email = email;

  // Initial poll to catch up on missed events
  await poll(win);

  // Start chokidar watcher — wrap to intercept upload completions
  watcher = startWatcher();

  // Patch uploader to emit activity events
  // The watcher calls uploadFile internally; we listen via the watcher's add/change events
  // to emit after the fact — but the cleanest approach is to patch the uploader module
  // We use a simple event from the watcher's scheduleUpload via monkey-patching state
  // Instead: override the setChecksum call to detect new uploads
  const stateModule = require('../../../sync/src/state');
  const origSetChecksum = stateModule.setChecksum;
  stateModule.setChecksum = (filePath: string, checksum: string) => {
    origSetChecksum(filePath, checksum);
    const fileName = require('path').basename(filePath);
    emitActivity(win, 'upload', fileName);
  };

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
  token = '';
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/desktop && npx tsc --noEmit
```

Expected: zero errors.

---

### Task 2: Update ipc.ts — real sync:status + start/stop on login/logout

**Files:**
- Modify: `apps/desktop/src/main/ipc.ts`

- [ ] **Step 1: Update ipc.ts to import sync and return real status**

Replace the `sync:status` stub and add `startSync`/`stopSync` calls in `auth:login` and `auth:logout`. Full updated `ipc.ts`:

```typescript
import { ipcMain, BrowserWindow, shell } from 'electron';
import axios from 'axios';
import path from 'path';
import { storeCredentials, getStoredToken, getStoredEmail, clearCredentials } from './auth';
import { startSync, stopSync, getSyncStatus } from './sync';

const API_URL = process.env.API_URL || 'http://localhost:3000';

let mainWindow: BrowserWindow | null = null;

export function setMainWindow(win: BrowserWindow) {
  mainWindow = win;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function registerIpcHandlers() {
  ipcMain.handle('auth:check', async () => {
    const token = getStoredToken();
    const email = getStoredEmail();
    return { loggedIn: !!token, email: email ?? undefined };
  });

  ipcMain.handle('auth:login', async (_event, { email, password }: { email: string; password: string }) => {
    try {
      const res = await axios.post(`${API_URL}/auth/login`, { email, password });
      const { token, user } = res.data as { token: string; user: { email: string } };
      storeCredentials(token, user.email);
      if (mainWindow) await startSync(token, user.email, mainWindow);
      return { ok: true };
    } catch (err: any) {
      const message = err.response?.data?.error ?? 'Login failed — check your credentials';
      return { ok: false, error: message };
    }
  });

  ipcMain.handle('auth:logout', async () => {
    stopSync();
    clearCredentials();
  });

  ipcMain.handle('sync:status', async () => {
    return getSyncStatus();
  });

  ipcMain.handle('sync:folder', async () => {
    const syncFolder = path.join(process.cwd(), 'sync-folder');
    return { path: syncFolder };
  });

  ipcMain.handle('folder:open', async () => {
    const syncFolder = path.join(process.cwd(), 'sync-folder');
    await shell.openPath(syncFolder);
  });
}
```

---

### Task 3: Update main/index.ts — start sync on launch if token exists, stop on quit

**Files:**
- Modify: `apps/desktop/src/main/index.ts`

- [ ] **Step 1: Update apps/desktop/src/main/index.ts**

```typescript
import { app, BrowserWindow } from 'electron';
import path from 'path';
import { registerIpcHandlers, setMainWindow } from './ipc';
import { getStoredToken, getStoredEmail } from './auth';
import { startSync, stopSync } from './sync';

function createWindow() {
  const win = new BrowserWindow({
    width: 400,
    height: 380,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, '../../src/renderer/index.html'));
  setMainWindow(win);
  return win;
}

app.whenReady().then(async () => {
  registerIpcHandlers();
  const win = createWindow();

  // Auto-start sync if we have a stored token
  const token = getStoredToken();
  const email = getStoredEmail();
  if (token && email) {
    await startSync(token, email, win);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopSync();
  if (process.platform !== 'darwin') app.quit();
});
```

---

### Task 4: Verify end-to-end sync

- [ ] **Step 1: Start the API and MinIO**

```bash
# Terminal 1 — ensure MinIO is running (docker ps | grep minio)
# Terminal 2 — start API
npx tsx apps/api/src/index.ts
```

- [ ] **Step 2: Build and run desktop app**

```bash
cd apps/desktop && npx tsc && npx electron .
```

- [ ] **Step 3: Login and check status dot turns green**

Login with valid credentials. Within 2 seconds the status dot should turn **green** (SSE connected).

- [ ] **Step 4: Test Local → Remote sync**

```bash
echo "hello from desktop" > sync-folder/test-desktop.txt
```

Expected within 1 second: dashboard shows `↑ test-desktop.txt  just now` in the activity list.

Verify in the web app at `http://localhost:5173` — `test-desktop.txt` should appear in the file list.

- [ ] **Step 5: Test Remote → Local sync**

Upload a new file via the web app (`http://localhost:5173`).

Expected within 2 seconds: dashboard shows `↓ <filename>  just now` in the activity list. File appears in `sync-folder/`.

- [ ] **Step 6: Test SSE fallback**

Stop and restart the API server. Expected: status dot turns **amber** (polling fallback). When API comes back, dot returns to **green** within 5 seconds.
