# PJDrive

A full-stack Google Drive clone built as a learning project. Covers chunked file upload, file sharing, nested folders, trash, search, real-time sync, and typed SQL — all in a Turborepo monorepo.

![Architecture](https://github.com/user-attachments/assets/1d589f7a-a2a3-43a9-9193-1ab992bd00e4)

---

## What's inside

| App / Package | Description |
|---|---|
| `apps/api` | Node.js + Express API — auth, upload, files, folders, trash, search, sharing, sync SSE |
| `apps/web` | React + Vite frontend — dashboard, upload UI, folders, trash, search, sharing, sync |
| `apps/sync` | Node.js sync client — watches `sync-folder/`, syncs via SSE |
| `apps/desktop` | Electron desktop app — login, sync status, activity feed |
| `packages/shared` | Shared TypeScript types across all apps |

---

## Features

### Web app
- **Chunked resumable upload** — files split into 10MB chunks, SHA-256 checksum, uploaded directly to S3/MinIO via presigned URLs (API never proxies bytes)
- **Resume support** — interrupted uploads resume from the last successful chunk, not from scratch
- **Download** — short-lived presigned URLs, CDN-cacheable
- **File management** - list, download, rename, move, delete files from the dashboard
- **Nested folders** - create folders inside folders, navigate the hierarchy, move files/folders between them, breadcrumb navigation; moving a folder into its own subtree is rejected
- **Trash** - deletes are soft (moved to Trash); restore or permanently delete individual items, or empty the whole trash; deleting a folder trashes its entire subtree together and restore brings it back together; items are auto-purged after 30 days
- **Search** - Postgres full-text (FTS) + `ILIKE` search over file and folder names, with optional mime-type and date-range filters; trashed items are excluded
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
- **Soft delete + Trash** - file/folder deletes set `trashed_at` instead of removing rows; permanent delete writes sync_log + deletes the row atomically, then removes the S3 object after commit
- **Auto-purge** - a background interval (every 6 hours) permanently removes trashed items older than 30 days; also runnable as a one-off script (`apps/api/src/purge.ts`)

### Electron desktop app
- **Secure login** — email/password login with JWT stored encrypted in OS keychain via `safeStorage`
- **Auto-login** — token persists across restarts; dashboard opens directly on launch
- **Live sync status** — green dot (SSE), amber dot (polling), grey (offline); updates instantly on connection change
- **Real-time activity feed** — `↑` uploads and `↓` downloads appear live, with relative timestamps that refresh
- **Stats section** — file count, total storage size, last sync time, connection mode; refreshes every 30 seconds
- **Sync folder shortcut** — `[Open]` button reveals `sync-folder/` in Finder/Explorer
- **Deduplication** — same file never appears twice in the activity feed from overlapping poll + SSE events(this might not work need to correct this)

---

## Tech stack

| Layer | Technology |
|---|---|
| Monorepo | Turborepo |
| API | Node.js, TypeScript, Express |
| Frontend | React 18, Vite, Zustand, Axios |
| Database | PostgreSQL (6 tables) |
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
│   │   ├── migrations/          # SQL schema (001–009)
│   │   ├── src/
│   │   │   ├── routes/          # auth, upload, files, folders, trash, search, sharing, sync
│   │   │   │   ├── *.ts         # route handlers
│   │   │   │   ├── *.sql        # named pgtyped queries
│   │   │   │   └── *.queries.ts # generated typed functions (don't edit)
│   │   │   ├── middleware/      # requireAuth, requireFileAccess
│   │   │   ├── db.ts            # pg Pool singleton
│   │   │   ├── storage.ts       # S3Client + presigned URL helpers
│   │   │   ├── purge.ts         # 30-day trash purge (interval + one-off script)
│   │   │   └── config.ts        # JWT_SECRET, BCRYPT_ROUNDS
│   │   └── pgtyped.config.json
│   ├── web/
│   │   └── src/
│   │       ├── pages/           # Login, Register, Dashboard, SharedWithMe, Trash
│   │       ├── components/      # FileList, Uploader, ShareModal, Breadcrumb, MoveModal, NewFolderButton, SearchBox, SearchResults
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
│   └── shared/src/types.ts      # User, File, Folder, UploadJob, ShareRecord, SyncEvent
├── sync-folder/                 # watched directory (contents gitignored)
└── docs/
    ├── superpowers/specs/       # design specs (incl. Folders/Trash/Search)
    └── superpowers/plans/       # implementation plans (Plans 1–4 + pgtyped + Folders/Trash/Search)
```

---

## Database schema

```
users          — id, email, password_hash
folders        — id, owner_id, parent_id, name, trashed_at, created_at, updated_at
files          — id, owner_id, folder_id, name, mime_type, size_bytes, storage_key, checksum, trashed_at
uploads        — id, file_id, owner_id, upload_id, total_chunks, uploaded_chunks, status
shared_files   — id, file_id, owner_id, shared_with, share_type, role, share_token, expires_at
sync_log       — id, user_id, file_id, event_type, created_at
```

`folders.parent_id` self-references `folders.id` (nested hierarchy; `NULL` = root). `files.folder_id` references `folders.id` (`NULL` = root). A `NULL` `trashed_at` means the item is live; a non-null timestamp means it's in Trash (shared across a folder's subtree so it restores together). Full-text (GIN) indexes on `files.name` and `folders.name` back search.

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
  |─ POST /upload/chunk (1:etag)>|─ persist to           |  after each
  |                             |  uploaded_chunks       |  successful PUT
  |─ PUT chunk N (presigned) ─────────────────────────>|
  |─ POST /upload/chunk (N:etag)>|                        |
  |                             |                        |
  |  (on retry: GET /upload/status → skip done chunks)   |
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

---

## Learning notes

This project was built as a learning exercise. Here are the key concepts and design decisions worth understanding.

### Why chunked upload?

A naive upload sends the whole file to the API server, which then writes it to S3. This breaks at large files — a 50GB file would exhaust the server's memory and a single network hiccup means starting over.

Chunked multipart upload solves both problems:
1. The client splits the file into 10MB `Blob` slices using `file.slice(offset, offset + CHUNK_SIZE)`
2. The API creates a multipart upload session in S3 and returns presigned PUT URLs — one per chunk
3. The client uploads each chunk **directly to S3** via `axios.put(presignedUrl, chunk)` — the API never touches the bytes
4. After each chunk succeeds, the client posts its `partNumber:eTag` to `/upload/chunk`, which the API persists into the `uploads.uploaded_chunks` array
5. The client calls `/upload/complete` with the ETags returned by S3, and S3 assembles the file

The API only handles ~200 bytes of metadata per request regardless of file size. Resumability: because each completed chunk's ETag is persisted server-side as soon as it lands, a retry calls `GET /upload/status/:uploadId`, filters out chunks that already finished, and re-uploads only what is missing — then completes reusing the stored ETags. An interrupted upload picks up from the last successful chunk instead of starting over.

### Why SSE instead of WebSockets for sync?

Server-Sent Events (SSE) are a one-way stream from server to client over a regular HTTP connection. When a file is uploaded or deleted, the API calls `broadcastSyncEvent(userId, event)` which writes to all open SSE streams for that user.

WebSockets would add bidirectional complexity we don't need — the client never needs to push events to the server over the persistent connection. SSE is simpler to implement, works through most proxies, and auto-reconnects via the browser's `EventSource` API.

The polling fallback (`GET /sync/changes?since=<timestamp>`) exists for environments where SSE is unreliable (corporate proxies, sleep/wake cycles). The sync client switches automatically.

### Why pgtyped for SQL?

Most ORMs hide SQL behind method chains, which makes it hard to understand what queries are actually running. Raw `pool.query('SELECT ...', [params])` works but gives you no type safety — a typo in a column name fails at runtime, not compile time.

pgtyped takes a middle path: you write plain SQL in `.sql` files with named parameter annotations (`:userId` instead of `$1`), and a codegen step introspects the live database schema to generate fully-typed TypeScript functions. The result:

```typescript
// Before pgtyped
const { rows } = await pool.query(
  'SELECT id, name FROM files WHERE owner_id = $1',
  [req.userId]
);
// rows is any[] — no type safety

// After pgtyped
const rows = await listFilesByOwner.run({ ownerId: req.userId! }, pool);
// rows is Array<{ id: string; name: string; ... }> — fully typed
```

Column renames, missing parameters, and wrong types all become compile errors.

### Design patterns used

See [`docs/design-patterns.md`](docs/design-patterns.md) for a full walkthrough of the patterns in this codebase, each with exact code examples:

| Pattern | Where |
|---|---|
| Middleware Chain | `requireAuth` → route handler |
| Middleware Factory | `requireFileAccess('viewer')` returns a configured middleware |
| Facade | `storage.ts` hides the S3 SDK behind 4 simple functions |
| Observer | SSE broadcast — `clients` Map + `broadcastSyncEvent` |
| Strategy | Sync: SSE (primary) swaps to polling (fallback) at runtime |
| Repository | pgtyped `.sql` files separate SQL from business logic |
| Debounce | `watcher.ts` — 500ms debounce before uploading changed files |
| Idempotency Key | `uploadId` enables resumable chunked uploads |
| Singleton | `pool` and `s3` instantiated once, shared everywhere |
| Guard Clause | Early returns flatten nested conditionals in route handlers |
| Transactional Outbox | SSE broadcast fires only after DB COMMIT |
| Content Addressable Storage | SHA-256 checksum prevents redundant uploads |

### Electron: main process vs renderer

Electron runs two processes:

- **Main process** (Node.js) — has full OS access. Creates windows, manages files, makes network requests, stores secrets.
- **Renderer process** (Chromium) — runs the UI. Cannot access Node.js APIs directly.

They communicate via IPC (inter-process communication). `contextBridge` in the preload script is the security boundary — it explicitly whitelists which functions the renderer can call:

```
Renderer (app.js)
  window.api.stats.get()          ← defined by contextBridge in preload.ts
       ↓ ipcRenderer.invoke('stats:get')
Main process (ipc.ts)
  ipcMain.handle('stats:get', async () => { ... })   ← full Node.js access
```

`contextIsolation: true` and `nodeIntegration: false` ensure the renderer cannot escape this boundary even if it runs untrusted content.

### Why the sync token is stored with safeStorage

The desktop app needs to make authenticated API requests from the main process, which means storing the JWT somewhere persistent. Options:

- **Plain file** — readable by anyone with filesystem access
- **localStorage** — only accessible from the renderer, not the main process
- **safeStorage** — Electron API that encrypts the value using the OS keychain (Keychain on macOS, DPAPI on Windows, libsecret on Linux)

`safeStorage.encryptString(token)` returns a `Buffer` that can only be decrypted on the same machine by the same OS user. The encrypted bytes are stored in the app's userData directory. Even if someone copies the file, they cannot read the token without the OS credentials.

### Monorepo with Turborepo

Turborepo is a build system for monorepos. It understands the dependency graph between packages and:
- Runs tasks in the right order (build `shared` before `api` or `web`)
- Caches task outputs — if nothing changed, `turbo build` skips the build entirely
- Runs independent tasks in parallel

The `--filter` flag targets a specific package:
```bash
npx turbo run build --filter=@pjdrive/desktop   # build only desktop
npx turbo run test --filter=@pjdrive/api        # test only api
```
