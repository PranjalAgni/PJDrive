# PJDrive Desktop App — Design Spec

**Date:** 2026-05-21
**Purpose:** Learning Electron — main/renderer processes, IPC, safeStorage, and OS integration
**Scope:** Minimal desktop app with Login + Dashboard UI, wrapping the existing sync client logic

---

## 1. Goals

- Learn Electron's core concepts: main process, renderer process, IPC, contextBridge, safeStorage
- Eliminate the manual JWT copy-paste and terminal workflow for the sync client
- Replace `sync-folder/` manual file dropping with an app-managed background sync
- Keep the renderer as vanilla HTML/CSS/JS — no framework, so Electron's boundaries are clear

---

## 2. Non-Goals

- System tray icon (future)
- Custom sync folder picker dialog (future)
- Packaging / distributing the app (future)
- Sharing UI or file browser (use the web app for that)

---

## 3. Architecture

```
apps/desktop/
├── package.json
├── tsconfig.json
└── src/
    ├── main/
    │   ├── index.ts        ← BrowserWindow creation, app lifecycle, IPC registration
    │   ├── auth.ts         ← safeStorage: store/retrieve/clear JWT
    │   ├── sync.ts         ← start/stop watcher + SSE, emit activity events
    │   └── ipc.ts          ← all ipcMain.handle registrations
    ├── preload/
    │   └── preload.ts      ← contextBridge: exposes window.api to renderer
    └── renderer/
        ├── index.html      ← single HTML file, two screens toggled by JS
        ├── styles.css      ← CSS variables, clean minimal design
        └── app.js          ← vanilla JS: screen routing, IPC calls via window.api
```

### Process model

```
Main Process (Node.js)                    Renderer Process (Chromium)
─────────────────────────────────         ───────────────────────────
index.ts                                  index.html + app.js
  ├── auth.ts (safeStorage)     IPC       window.api.auth.login()
  ├── sync.ts (chokidar+SSE)  ←────────→ window.api.sync.getStatus()
  └── ipc.ts (handlers)         IPC       window.api.folder.open()
                                          window.api.onActivity(cb)
```

**contextIsolation: true** — renderer has zero direct Node.js access. All communication goes through `window.api` exposed by the preload script.

### Reuse from apps/sync

The main process imports sync logic directly — no copy/paste:

```typescript
import { startWatcher } from '../../sync/src/watcher';
import { downloadFile, deleteLocalFile } from '../../sync/src/downloader';
import { getLastSyncAt, setLastSyncAt } from '../../sync/src/state';
```

`sync.ts` in the desktop app manages the watcher lifecycle (start on login, stop on logout) and forwards events to the renderer via `BrowserWindow.webContents.send()`.

---

## 4. IPC Channels

All channels exposed via `window.api` through the contextBridge preload.

| Channel | Direction | Payload | Returns |
|---|---|---|---|
| `auth:login` | renderer → main | `{ email, password }` | `{ ok: true }` or `{ ok: false, error: string }` |
| `auth:logout` | renderer → main | — | `void` |
| `auth:check` | renderer → main | — | `{ loggedIn: boolean, email?: string }` |
| `sync:status` | renderer → main | — | `{ connected: boolean, mode: 'sse' \| 'poll' \| 'off', email: string }` |
| `sync:folder` | renderer → main | — | `{ path: string }` |
| `folder:open` | renderer → main | — | `void` (opens in Finder/Explorer) |
| `activity` | main → renderer | `{ type: 'upload' \| 'download', fileName: string, timestamp: string }` | — |

---

## 5. UI Screens

### Login Screen

Shown on first launch or after logout. Centred, minimal.

```
┌─────────────────────────────────┐
│                                 │
│           PJDrive               │
│                                 │
│   Email    [________________]   │
│   Password [________________]   │
│                                 │
│           [  Login  ]           │
│                                 │
│   ● Error message (if any)      │
│                                 │
└─────────────────────────────────┘
```

- On submit: calls `window.api.auth.login({ email, password })`
- On success: main stores JWT via `safeStorage.encryptString()`, renderer navigates to Dashboard
- On failure: shows error message inline
- Window size: 400×380px, not resizable

### Dashboard Screen

Shown after login. Auto-shown on subsequent launches if token exists.

```
┌─────────────────────────────────┐
│  PJDrive              [Logout]  │
├─────────────────────────────────┤
│  Sync Status                    │
│  ● Connected   user@email.com   │
│                                 │
│  Sync Folder                    │
│  /Users/.../sync-folder  [Open] │
│                                 │
│  Recent Activity                │
│  ─────────────────────────────  │
│  ↑ report.pdf        just now   │
│  ↓ notes.txt         2 min ago  │
│  ↑ photo.jpg         5 min ago  │
│  ↑ video.mp4        10 min ago  │
│                                 │
└─────────────────────────────────┘
```

- **Status dot:** green = SSE connected, amber = polling fallback, red = disconnected
- **↑** = uploaded (local→remote), **↓** = downloaded (remote→local)
- **Activity list:** last 10 events, newest at top, updates live via `window.api.onActivity(callback)`
- **[Open]:** calls `window.api.folder.open()` → `shell.openPath(syncFolderPath)`
- **[Logout]:** calls `window.api.auth.logout()`, clears token, shows Login screen
- Window size: 400×500px, not resizable

---

## 6. Auth Flow

```
App launch
  └── auth:check
        ├── token exists → start sync → show Dashboard
        └── no token → show Login

Login submit
  └── auth:login(email, password)
        ├── POST /auth/login to API
        ├── success → safeStorage.encryptString(token) → start sync → show Dashboard
        └── failure → show error on Login screen

Logout
  └── auth:logout
        ├── stop watcher + SSE
        ├── safeStorage.deleteString()
        └── show Login screen
```

---

## 7. Sync Lifecycle

- **Start:** triggered after successful login or on launch when token exists
  1. Connect SSE to `GET /sync/events` with stored JWT
  2. Start chokidar watcher on `sync-folder/`
  3. Emit `activity` events to renderer as files sync
- **Stop:** triggered on logout or app quit
  1. Close SSE connection
  2. Stop chokidar watcher
- **Status updates:** `sync.ts` updates the status object (`connected`, `mode`) and renderer polls via `sync:status` every 5 seconds OR receives a push on SSE state change

---

## 8. Tech Stack

| Concern | Choice |
|---|---|
| Electron version | Latest stable (v34+) |
| Main process language | TypeScript (via tsx in dev, tsc for build) |
| Renderer | Vanilla HTML + CSS + JS (no bundler) |
| Auth storage | `electron.safeStorage` |
| IPC pattern | `contextBridge` + `ipcMain.handle` + `ipcRenderer.invoke` |
| Sync logic | Imported from `apps/sync/src/` |
| Dev runner | `concurrently` — tsx watch for main, electron for app |
| Monorepo location | `apps/desktop/` |

---

## 9. Out of Scope

- System tray icon and background daemon mode
- Custom sync folder path (uses repo's `sync-folder/` for now)
- App packaging / auto-update
- Windows / Linux testing (macOS first)
- File browser or sharing UI
