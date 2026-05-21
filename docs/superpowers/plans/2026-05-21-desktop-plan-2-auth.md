# Desktop App — Plan 2: Auth

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the full auth flow — safeStorage, IPC channels, login screen UI, and auto-login on launch.

**Architecture:** `auth.ts` in main process handles safeStorage read/write. `ipc.ts` registers `ipcMain.handle` for `auth:login`, `auth:logout`, `auth:check`. `preload.ts` exposes these as `window.api.auth.*`. `app.js` and `index.html` render the login screen and route to dashboard on success.

**Tech Stack:** Electron safeStorage, ipcMain/ipcRenderer, contextBridge, axios (for API call in main process), vanilla JS renderer

**Prerequisites:** Plan 1 complete — Electron window opens, `window.api` is `{}`.

---

## File Structure

```
apps/desktop/src/
├── main/
│   ├── index.ts          ← modified: import and call registerIpc()
│   ├── auth.ts           ← NEW: safeStorage helpers
│   └── ipc.ts            ← NEW: ipcMain.handle registrations
├── preload/
│   └── preload.ts        ← modified: expose window.api.auth.*
└── renderer/
    ├── index.html        ← modified: login form + dashboard skeleton
    ├── styles.css        ← modified: login screen styles
    └── app.js            ← modified: login form logic, screen routing
```

---

### Task 1: auth.ts — safeStorage helpers

**Files:**
- Create: `apps/desktop/src/main/auth.ts`

- [ ] **Step 1: Create apps/desktop/src/main/auth.ts**

```typescript
import { safeStorage } from 'electron';

const TOKEN_KEY = 'pjdrive-jwt';
const EMAIL_KEY = 'pjdrive-email';

export function storeCredentials(token: string, email: string): void {
  safeStorage.setEncryptionKey?.('pjdrive-desktop');
  localStorage.setItem?.(TOKEN_KEY, token);
  // safeStorage works with files — store encrypted on disk
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const { app } = require('electron') as typeof import('electron');
  const dir = app.getPath('userData');
  fs.writeFileSync(path.join(dir, `${TOKEN_KEY}.enc`), safeStorage.encryptString(token));
  fs.writeFileSync(path.join(dir, `${EMAIL_KEY}.txt`), email);
}

export function getStoredToken(): string | null {
  try {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const { app } = require('electron') as typeof import('electron');
    const dir = app.getPath('userData');
    const encPath = path.join(dir, `${TOKEN_KEY}.enc`);
    if (!fs.existsSync(encPath)) return null;
    const buf = fs.readFileSync(encPath);
    return safeStorage.decryptString(buf);
  } catch {
    return null;
  }
}

export function getStoredEmail(): string | null {
  try {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const { app } = require('electron') as typeof import('electron');
    const dir = app.getPath('userData');
    const emailPath = path.join(dir, `${EMAIL_KEY}.txt`);
    if (!fs.existsSync(emailPath)) return null;
    return fs.readFileSync(emailPath, 'utf8');
  } catch {
    return null;
  }
}

export function clearCredentials(): void {
  try {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const { app } = require('electron') as typeof import('electron');
    const dir = app.getPath('userData');
    const tokenPath = path.join(dir, `${TOKEN_KEY}.enc`);
    const emailPath = path.join(dir, `${EMAIL_KEY}.txt`);
    if (fs.existsSync(tokenPath)) fs.unlinkSync(tokenPath);
    if (fs.existsSync(emailPath)) fs.unlinkSync(emailPath);
  } catch {
    // ignore
  }
}
```

- [ ] **Step 2: Build and check for TypeScript errors**

```bash
cd apps/desktop && npx tsc --noEmit
```

Expected: zero errors.

---

### Task 2: ipc.ts — IPC handlers

**Files:**
- Create: `apps/desktop/src/main/ipc.ts`

- [ ] **Step 1: Create apps/desktop/src/main/ipc.ts**

```typescript
import { ipcMain, BrowserWindow, shell } from 'electron';
import axios from 'axios';
import path from 'path';
import { storeCredentials, getStoredToken, getStoredEmail, clearCredentials } from './auth';

const API_URL = process.env.API_URL || 'http://localhost:3000';

// Tracks the main window so sync.ts can send events to renderer
let mainWindow: BrowserWindow | null = null;

export function setMainWindow(win: BrowserWindow) {
  mainWindow = win;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function registerIpcHandlers() {
  // auth:check — called on launch to see if we already have a token
  ipcMain.handle('auth:check', async () => {
    const token = getStoredToken();
    const email = getStoredEmail();
    return { loggedIn: !!token, email: email ?? undefined };
  });

  // auth:login — called when user submits login form
  ipcMain.handle('auth:login', async (_event, { email, password }: { email: string; password: string }) => {
    try {
      const res = await axios.post(`${API_URL}/auth/login`, { email, password });
      const { token, user } = res.data as { token: string; user: { email: string } };
      storeCredentials(token, user.email);
      return { ok: true };
    } catch (err: any) {
      const message = err.response?.data?.error ?? 'Login failed — check your credentials';
      return { ok: false, error: message };
    }
  });

  // auth:logout — clear stored credentials
  ipcMain.handle('auth:logout', async () => {
    clearCredentials();
  });

  // sync:folder — return absolute path to sync-folder
  ipcMain.handle('sync:folder', async () => {
    const syncFolder = path.join(process.cwd(), 'sync-folder');
    return { path: syncFolder };
  });

  // folder:open — open sync-folder in Finder/Explorer
  ipcMain.handle('folder:open', async () => {
    const syncFolder = path.join(process.cwd(), 'sync-folder');
    await shell.openPath(syncFolder);
  });

  // sync:status — return current sync state (stubbed for Plan 2, real in Plan 3)
  ipcMain.handle('sync:status', async () => {
    const email = getStoredEmail();
    return { connected: false, mode: 'off' as const, email: email ?? '' };
  });
}
```

- [ ] **Step 2: Build and check for TypeScript errors**

```bash
cd apps/desktop && npx tsc --noEmit
```

Expected: zero errors.

---

### Task 3: Update main/index.ts to wire IPC

**Files:**
- Modify: `apps/desktop/src/main/index.ts`

- [ ] **Step 1: Update apps/desktop/src/main/index.ts**

```typescript
import { app, BrowserWindow } from 'electron';
import path from 'path';
import { registerIpcHandlers, setMainWindow } from './ipc';

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

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

---

### Task 4: Update preload.ts — expose window.api.auth

**Files:**
- Modify: `apps/desktop/src/preload/preload.ts`

- [ ] **Step 1: Update apps/desktop/src/preload/preload.ts**

```typescript
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  auth: {
    check: () => ipcRenderer.invoke('auth:check'),
    login: (email: string, password: string) =>
      ipcRenderer.invoke('auth:login', { email, password }),
    logout: () => ipcRenderer.invoke('auth:logout'),
  },
  sync: {
    getStatus: () => ipcRenderer.invoke('sync:status'),
    getFolder: () => ipcRenderer.invoke('sync:folder'),
  },
  folder: {
    open: () => ipcRenderer.invoke('folder:open'),
  },
  onActivity: (callback: (event: { type: string; fileName: string; timestamp: string }) => void) => {
    ipcRenderer.on('activity', (_event, data) => callback(data));
  },
});
```

---

### Task 5: Login screen HTML + CSS

**Files:**
- Modify: `apps/desktop/src/renderer/index.html`
- Modify: `apps/desktop/src/renderer/styles.css`

- [ ] **Step 1: Update apps/desktop/src/renderer/index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'" />
  <title>PJDrive</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <!-- Login Screen -->
  <div id="screen-login" class="screen">
    <div class="login-container">
      <h1 class="app-title">PJDrive</h1>
      <form id="login-form" class="login-form">
        <div class="field">
          <label for="email">Email</label>
          <input id="email" type="email" placeholder="you@example.com" required autocomplete="email" />
        </div>
        <div class="field">
          <label for="password">Password</label>
          <input id="password" type="password" placeholder="••••••••" required autocomplete="current-password" />
        </div>
        <button id="login-btn" type="submit">Login</button>
        <p id="login-error" class="error-msg hidden"></p>
      </form>
    </div>
  </div>

  <!-- Dashboard Screen (hidden until logged in) -->
  <div id="screen-dashboard" class="screen hidden">
    <div class="dashboard-container">
      <header class="dashboard-header">
        <span class="app-title-sm">PJDrive</span>
        <button id="logout-btn" class="btn-ghost">Logout</button>
      </header>

      <section class="section">
        <div class="section-label">Sync Status</div>
        <div class="status-row">
          <span id="status-dot" class="dot dot-off"></span>
          <span id="status-text">Connecting...</span>
        </div>
      </section>

      <section class="section">
        <div class="section-label">Sync Folder</div>
        <div class="folder-row">
          <span id="folder-path" class="folder-path">—</span>
          <button id="open-folder-btn" class="btn-ghost">Open</button>
        </div>
      </section>

      <section class="section section-activity">
        <div class="section-label">Recent Activity</div>
        <div class="divider"></div>
        <ul id="activity-list" class="activity-list">
          <li class="activity-empty">No activity yet</li>
        </ul>
      </section>
    </div>
  </div>

  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Update apps/desktop/src/renderer/styles.css**

```css
:root {
  --bg: #ffffff;
  --surface: #f8fafc;
  --border: #e2e8f0;
  --text: #1e293b;
  --text-muted: #64748b;
  --accent: #3b82f6;
  --accent-hover: #2563eb;
  --green: #22c55e;
  --amber: #f59e0b;
  --red: #ef4444;
  --radius: 8px;
  --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: var(--font);
  background: var(--bg);
  color: var(--text);
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

#app { width: 100%; height: 100vh; }

/* ── Screens ── */
.screen { width: 100%; height: 100vh; }
.hidden { display: none !important; }

/* ── Login ── */
.login-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 32px 40px;
  gap: 24px;
}

.app-title {
  font-size: 28px;
  font-weight: 700;
  color: var(--accent);
  letter-spacing: -0.5px;
}

.login-form {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.field { display: flex; flex-direction: column; gap: 4px; }

.field label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.field input {
  padding: 9px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-size: 14px;
  font-family: var(--font);
  outline: none;
  transition: border-color 0.15s;
}

.field input:focus { border-color: var(--accent); }

button[type="submit"] {
  margin-top: 4px;
  padding: 10px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: var(--radius);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}

button[type="submit"]:hover { background: var(--accent-hover); }
button[type="submit"]:disabled { opacity: 0.6; cursor: not-allowed; }

.error-msg {
  font-size: 12px;
  color: var(--red);
  text-align: center;
  min-height: 16px;
}

/* ── Dashboard ── */
.dashboard-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border);
}

.app-title-sm {
  font-size: 16px;
  font-weight: 700;
  color: var(--accent);
}

.btn-ghost {
  background: none;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 4px 10px;
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}

.btn-ghost:hover { border-color: var(--accent); color: var(--accent); }

.section {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.section-activity {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border-bottom: none;
}

.section-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.status-row { display: flex; align-items: center; gap: 8px; }

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dot-green { background: var(--green); }
.dot-amber { background: var(--amber); }
.dot-off   { background: var(--border); }
.dot-red   { background: var(--red); }

.folder-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.folder-path {
  font-size: 12px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 260px;
}

.divider { height: 1px; background: var(--border); margin-bottom: 4px; }

.activity-list {
  list-style: none;
  overflow-y: auto;
  flex: 1;
}

.activity-empty {
  font-size: 12px;
  color: var(--text-muted);
  padding: 8px 0;
  text-align: center;
}

.activity-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 0;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}

.activity-item:last-child { border-bottom: none; }

.activity-arrow { font-size: 11px; color: var(--text-muted); flex-shrink: 0; width: 12px; }
.activity-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.activity-time { font-size: 11px; color: var(--text-muted); flex-shrink: 0; }
```

---

### Task 6: Login screen JS logic

**Files:**
- Modify: `apps/desktop/src/renderer/app.js`

- [ ] **Step 1: Update apps/desktop/src/renderer/app.js**

```javascript
// ── Screen routing ──────────────────────────────────────────────────────────

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(`screen-${name}`).classList.remove('hidden');
}

// ── Login screen ────────────────────────────────────────────────────────────

const loginForm = document.getElementById('login-form');
const loginBtn  = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  loginBtn.disabled = true;
  loginBtn.textContent = 'Logging in...';
  loginError.classList.add('hidden');
  loginError.textContent = '';

  const result = await window.api.auth.login(email, password);

  if (result.ok) {
    await initDashboard();
    showScreen('dashboard');
  } else {
    loginError.textContent = result.error;
    loginError.classList.remove('hidden');
    loginBtn.disabled = false;
    loginBtn.textContent = 'Login';
  }
});

// ── Dashboard screen ─────────────────────────────────────────────────────────

async function initDashboard() {
  // Load folder path
  const { path: folderPath } = await window.api.sync.getFolder();
  document.getElementById('folder-path').textContent = folderPath;

  // Load initial sync status
  await refreshStatus();
}

async function refreshStatus() {
  const status = await window.api.sync.getStatus();
  const dot  = document.getElementById('status-dot');
  const text = document.getElementById('status-text');

  dot.className = 'dot';
  if (status.connected && status.mode === 'sse') {
    dot.classList.add('dot-green');
    text.textContent = `Connected  ${status.email}`;
  } else if (status.connected && status.mode === 'poll') {
    dot.classList.add('dot-amber');
    text.textContent = `Polling  ${status.email}`;
  } else {
    dot.classList.add('dot-off');
    text.textContent = 'Disconnected';
  }
}

// Poll status every 5 seconds when on dashboard
setInterval(() => {
  if (!document.getElementById('screen-dashboard').classList.contains('hidden')) {
    refreshStatus();
  }
}, 5000);

// Logout button
document.getElementById('logout-btn').addEventListener('click', async () => {
  await window.api.auth.logout();
  showScreen('login');
});

// Open folder button
document.getElementById('open-folder-btn').addEventListener('click', () => {
  window.api.folder.open();
});

// ── Activity list ────────────────────────────────────────────────────────────

const MAX_ACTIVITY = 10;

function relativeTime(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 10)  return 'just now';
  if (s < 60)  return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function addActivityItem(event) {
  const list = document.getElementById('activity-list');

  // Remove empty placeholder
  const empty = list.querySelector('.activity-empty');
  if (empty) empty.remove();

  const arrow = event.type === 'upload' ? '↑' : '↓';
  const li = document.createElement('li');
  li.className = 'activity-item';
  li.innerHTML = `
    <span class="activity-arrow">${arrow}</span>
    <span class="activity-name" title="${event.fileName}">${event.fileName}</span>
    <span class="activity-time">${relativeTime(event.timestamp)}</span>
  `;

  list.prepend(li);

  // Keep max 10 items
  while (list.children.length > MAX_ACTIVITY) {
    list.removeChild(list.lastChild);
  }
}

// Listen for activity events pushed from main process
window.api.onActivity(addActivityItem);

// ── App startup ──────────────────────────────────────────────────────────────

async function init() {
  const { loggedIn } = await window.api.auth.check();
  if (loggedIn) {
    await initDashboard();
    showScreen('dashboard');
  } else {
    showScreen('login');
  }
}

init();
```

---

### Task 7: Verify auth flow end to end

- [ ] **Step 1: Build**

```bash
cd apps/desktop && npx tsc
```

Expected: zero TypeScript errors.

- [ ] **Step 2: Start the API**

```bash
# In a separate terminal, from repo root:
npx tsx apps/api/src/index.ts
```

Expected: `API running on port 3000`

- [ ] **Step 3: Run the desktop app**

```bash
cd apps/desktop && npx electron .
```

Expected: Login screen appears (400×380px).

- [ ] **Step 4: Test failed login**

Enter a wrong password. Expected: red error message "invalid credentials" appears inline. Login button re-enables.

- [ ] **Step 5: Test successful login**

Enter correct credentials for a user in your `pjdrive` database. Expected: screen switches to Dashboard showing folder path and "Disconnected" status (sync not wired yet — that's Plan 3).

- [ ] **Step 6: Test auto-login**

Quit the app and reopen it. Expected: Dashboard appears directly without Login screen (token was stored in safeStorage).

- [ ] **Step 7: Test logout**

Click Logout. Expected: Login screen appears. Quit and reopen — Login screen appears again (token was cleared).
