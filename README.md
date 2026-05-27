# PJDrive

A full-stack Google Drive clone built as a learning project. Covers chunked file upload, file sharing, real-time sync, and typed SQL — all in a Turborepo monorepo.

![Architecture](https://github.com/user-attachments/assets/1d589f7a-a2a3-43a9-9193-1ab992bd00e4)

---

## What's inside

| App / Package | Description |
|---|---|
| `apps/api` | Node.js + Express API — auth, upload, files, sharing, sync SSE |
| `apps/web` | React + Vite frontend — dashboard, upload UI, sharing, sync |
| `apps/sync` | Node.js sync client — watches `sync-folder/`, syncs via SSE |
| `apps/desktop` | Electron desktop app — login, sync status, activity feed |
| `packages/shared` | Shared TypeScript types across all apps |

---

## Features

### Web app
- **Chunked resumable upload** — files split into 10MB chunks, SHA-256 checksum, uploaded directly to S3/MinIO via presigned URLs (API never proxies bytes)
- **Resume support** — interrupted uploads resume from the last successful chunk, not from scratch
- **Download** — short-lived presigned URLs, CDN-cacheable
- **File management** — list, download, delete files from the dashboard
- **Sharing by email** — share a file with another user as editor or viewer
- **Public link sharing** — generate a shareable token URL; anyone with the link can access at the set role
- **Access control** — owner → user share → link share → 403, checked on every file request
- **Shared with me** — view all files other users have shared with you

### Sync
- **Real-time sync** — SSE push to all connected clients on upload or delete; instant notification
- **Polling fallback** — automatic 30s poll when SSE connection drops; reconnects when server recovers
- **Local → remote** — `chokidar` watches `sync-folder/`, debounces 500ms, diffs SHA-256 checksums before uploading (skips unchanged files)
- **Remote → local** — downloads new/updated files into `sync-folder/` on SSE event or poll
- **Echo prevention** — downloaded files are marked to prevent the watcher from re-uploading them

### API
- **JWT auth** — bcrypt password hashing, 7-day tokens, email normalisation
- **Zod validation** — all request bodies validated at runtime with a central `schemas.ts`
- **pgtyped** — all SQL lives in `.sql` files with named queries, fully typed TypeScript generated at codegen time
- **Transactional deletes** — file row + sync_log written atomically; S3 object deleted after commit

### Electron desktop app
- **Secure login** — email/password login with JWT stored encrypted in OS keychain via `safeStorage`
- **Auto-login** — token persists across restarts; dashboard opens directly on launch
- **Live sync status** — green dot (SSE), amber dot (polling), grey (offline); updates instantly on connection change
- **Real-time activity feed** — `↑` uploads and `↓` downloads appear live, with relative timestamps that refresh
- **Stats section** — file count, total storage size, last sync time, connection mode; refreshes every 30 seconds
- **Sync folder shortcut** — `[Open]` button reveals `sync-folder/` in Finder/Explorer
- **Deduplication** — same file never appears twice in the activity feed from overlapping poll + SSE events(this might not work)

---

## Tech stack

| Layer | Technology |
|---|---|
| Monorepo | Turborepo |
| API | Node.js, TypeScript, Express |
| Frontend | React 18, Vite, Zustand, Axios |
| Database | PostgreSQL (5 tables) |
| Object storage | MinIO (local) / AWS S3 (prod) |
| CDN | CloudFront (prod) |
| Typed SQL | pgtyped |
| Auth | bcrypt + JWT |
| Sync transport | SSE + polling fallback |
| File watching | chokidar |
| Desktop app | Electron 34, contextBridge IPC, safeStorage |

---

## Getting started

### Prerequisites

- Node.js 22+
- PostgreSQL running locally
- Docker (for MinIO)

### 1. Clone and install

```bash
git clone <repo>
cd pjdrive
npm install
```

### 2. Start MinIO

```bash
docker run -d \
  -p 9002:9000 \
  -p 9003:9001 \
  --name pjdrive-minio \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  quay.io/minio/minio server /data --console-address ":9001"

# Create the bucket
docker exec pjdrive-minio mc alias set local http://localhost:9000 minioadmin minioadmin
docker exec pjdrive-minio mc mb local/pjdrive
```

### 3. Create database and run migrations

```bash
createdb pjdrive
DATABASE_URL=postgres://localhost:5432/pjdrive npx tsx apps/api/src/migrate.ts
```

### 4. Configure environment

Create `apps/api/.env`:

```env
DATABASE_URL=postgres://localhost:5432/pjdrive
S3_ENDPOINT=http://localhost:9002
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=pjdrive
JWT_SECRET=dev-secret-change-in-prod
PORT=3000
```

### 5. Start the API and web app

```bash
# Terminal 1 — API (reads apps/api/.env automatically)
npx tsx apps/api/src/index.ts

# Terminal 2 — Web
npx vite apps/web
```

Open `http://localhost:5173`.

### 6. (Optional) Start the sync client

1. Log in at `http://localhost:5173`
2. Open DevTools → Application → Local Storage → copy the `token` value
3. Run:

```bash
SYNC_TOKEN=<your-jwt-token> API_URL=http://localhost:3000 npx tsx apps/sync/src/index.ts
```

Drop files into `sync-folder/` — they'll appear in your dashboard within a second.

### 7. (Optional) Run the Electron desktop app

```bash
# Build TypeScript (run from apps/desktop)
cd apps/desktop && npm run build

# Launch from repo root so sync-folder/ is resolved correctly
cd ../..
npx electron apps/desktop
```

The app stores your JWT in the OS keychain via Electron `safeStorage` — no need to copy tokens manually. On next launch it auto-logs in and starts syncing immediately.

**What the desktop app shows:**
- Login screen → stores credentials encrypted in OS keychain
- Dashboard with live sync status (green = SSE, amber = polling, grey = offline)
- Recent activity feed — `↑` uploads, `↓` downloads, updates in real time
- Sync folder path with `[Open]` button to reveal in Finder

---

## Packaging the desktop app (Raycast / Spotlight searchable)

To make the app launchable from Raycast or Spotlight, package it into a `.app` bundle:

**1. Install electron-builder**

```bash
npm install electron-builder --workspace=apps/desktop --save-dev
```

**2. Add to `apps/desktop/package.json`**

```json
"build": {
  "appId": "com.pjdrive.desktop",
  "productName": "PJDrive",
  "mac": { "category": "public.app-category.productivity" },
  "directories": { "output": "release" },
  "files": ["dist/**/*", "src/renderer/**/*"]
},
"scripts": {
  "package": "npm run build && electron-builder --mac"
}
```

**3. Build and install**

```bash
cd apps/desktop && npm run package
cp -r release/mac/PJDrive.app /Applications/
```

Raycast and Spotlight will discover it automatically within seconds of copying to `/Applications`.

> **Note:** Before packaging, change `sync-folder` from a `process.cwd()`-relative path to a fixed location like `~/Documents/PJDrive` — otherwise the packaged app won't find the folder when launched from `/Applications`. Update `SYNC_FOLDER` in `apps/desktop/src/main/sync.ts` and `apps/sync/src/watcher.ts` to use `app.getPath('documents') + '/PJDrive'`.

---

## Project structure

```
pjdrive/
├── apps/
│   ├── api/
│   │   ├── migrations/          # SQL schema (001–005)
│   │   ├── src/
│   │   │   ├── routes/          # auth, upload, files, sharing, sync
│   │   │   │   ├── *.ts         # route handlers
│   │   │   │   ├── *.sql        # named pgtyped queries
│   │   │   │   └── *.queries.ts # generated typed functions (don't edit)
│   │   │   ├── middleware/      # requireAuth, requireFileAccess
│   │   │   ├── db.ts            # pg Pool singleton
│   │   │   ├── storage.ts       # S3Client + presigned URL helpers
│   │   │   └── config.ts        # JWT_SECRET, BCRYPT_ROUNDS
│   │   └── pgtyped.config.json
│   ├── web/
│   │   └── src/
│   │       ├── pages/           # Login, Register, Dashboard, SharedWithMe
│   │       ├── components/      # FileList, Uploader, ShareModal
│   │       ├── lib/             # chunker.ts, upload.ts
│   │       ├── api/client.ts    # Axios instance + interceptors
│   │       └── store/auth.ts    # Zustand auth store
│   ├── sync/
│   │   └── src/
│   │       ├── index.ts         # entry: watcher + SSE + polling
│   │       ├── watcher.ts       # chokidar file watcher
│   │       ├── uploader.ts      # chunked upload to API
│   │       ├── downloader.ts    # download from API to sync-folder
│   │       └── state.ts         # checksum + last-sync-at persistence
│   └── desktop/
│       └── src/
│           ├── main/            # Electron main process (TypeScript)
│           │   ├── index.ts     # BrowserWindow, app lifecycle
│           │   ├── auth.ts      # safeStorage: store/retrieve/clear JWT
│           │   ├── ipc.ts       # ipcMain.handle registrations
│           │   └── sync.ts      # watcher + SSE lifecycle, activity events
│           ├── preload/
│           │   └── preload.ts   # contextBridge: exposes window.api
│           └── renderer/        # vanilla HTML/CSS/JS (no bundler)
│               ├── index.html   # login screen + dashboard
│               ├── styles.css
│               └── app.js       # screen routing, IPC calls, activity list
├── packages/
│   └── shared/src/types.ts      # User, File, UploadJob, ShareRecord, SyncEvent
├── sync-folder/                 # watched directory (contents gitignored)
└── docs/
    ├── superpowers/specs/       # design spec
    └── superpowers/plans/       # implementation plans (Plans 1–4 + pgtyped)
```

---

## Database schema

```
users          — id, email, password_hash
files          — id, owner_id, name, mime_type, size_bytes, storage_key, checksum
uploads        — id, file_id, owner_id, upload_id, total_chunks, uploaded_chunks, status
shared_files   — id, file_id, owner_id, shared_with, share_type, role, share_token, expires_at
sync_log       — id, user_id, file_id, event_type, created_at
```

---

## Useful commands

All commands run from the **repo root** unless noted.

### Running individual packages

```bash
# Run a single package's dev server
npx turbo run dev --filter=@pjdrive/api
npx turbo run dev --filter=@pjdrive/web
npx turbo run dev --filter=@pjdrive/desktop

# Build a single package
npx turbo run build --filter=@pjdrive/desktop

# Run all dev servers together
npx turbo run dev

# Equivalent with npm workspaces (no Turbo)
npm run dev --workspace=apps/api
npm run build --workspace=apps/desktop
```

### Testing

```bash
# Run all API tests
cd apps/api && DATABASE_URL=postgres://localhost:5432/pjdrive S3_ENDPOINT=http://localhost:9002 npx vitest run

# Run a single test file
cd apps/api && DATABASE_URL=postgres://localhost:5432/pjdrive npx vitest run src/routes/auth.test.ts

# Run tests for all packages
npx turbo run test
```

### Database

```bash
# Run migrations (first time or after adding a new migration)
DATABASE_URL=postgres://localhost:5432/pjdrive npx tsx apps/api/src/migrate.ts

# Open psql shell
psql postgres://localhost:5432/pjdrive

# Useful psql commands
\dt          # list all tables
\d files     # describe the files table
SELECT * FROM files LIMIT 5;
\q           # quit
```

### Regenerating typed SQL

After editing any `.sql` file in `apps/api/src/routes/`:

```bash
DATABASE_URL=postgres://localhost:5432/pjdrive npm run codegen --prefix apps/api
# or with Turbo:
DATABASE_URL=postgres://localhost:5432/pjdrive npx turbo run codegen --filter=@pjdrive/api
```

This rewrites the `.queries.ts` files next to each `.sql` file. Commit both together.

### Desktop app

```bash
# Build TypeScript (required before running)
npx turbo run build --filter=@pjdrive/desktop

# Run (must be from repo root so sync-folder/ is found at process.cwd())
npx electron apps/desktop

# Watch mode for development (recompiles on save, restart electron manually)
npm run dev --workspace=apps/desktop
```

---

## Upload flow

![Chunked Upload Pipeline](https://github.com/user-attachments/assets/2ae86ee2-923c-40a4-88ff-5d86832a85bd)

```
Client                         API                    MinIO/S3
  |                             |                        |
  |─ POST /upload/init ────────>|                        |
  |                             |─ CreateMultipartUpload>|
  |<── uploadId + chunkUrls ───|<─── uploadId ──────────|
  |                             |                        |
  |─ PUT chunk 1 (presigned) ─────────────────────────>|
  |─ PUT chunk 2 (presigned) ─────────────────────────>|  parallel
  |─ PUT chunk N (presigned) ─────────────────────────>|
  |                             |                        |
  |─ POST /upload/complete ────>|                        |
  |                             |─ CompleteMultipart ───>|
  |                             |─ INSERT sync_log       |
  |                             |─ broadcastSyncEvent    |
  |<── file metadata ──────────|                        |
```

---

## Sync flow

```
Local → Remote:
  sync-folder/ change
    → chokidar event (debounced 500ms)
    → SHA-256 checksum diff (skip if unchanged)
    → chunked upload to API

Remote → Local:
  upload/delete via web or another client
    → broadcastSyncEvent (SSE)
    → EventSource receives event
    → downloadFile / deleteLocalFile
    → markAsDownloaded (prevents echo re-upload)

Fallback:
  SSE drops → onerror → start 30s poll interval
  SSE reconnects → onopen → clear poll interval
```
