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
| `packages/shared` | Shared TypeScript types across all apps |

---

## Features

- **Chunked resumable upload** — files split into 10MB chunks, SHA-256 checksum, uploaded directly to S3/MinIO via presigned URLs (API never proxies bytes)
- **Download** — short-lived presigned URLs, CDN-cacheable
- **Sharing** — share by email (editor/viewer role) or generate a public link with a token
- **Access control** — owner → user share → link share → 403, checked on every request
- **Real-time sync** — SSE push to connected clients on upload/delete; 30s poll fallback when SSE drops
- **Local sync** — `chokidar` watches `sync-folder/`, debounces changes, diffs checksums before uploading
- **pgtyped** — all SQL lives in `.sql` files with named queries, fully typed TypeScript generated at codegen time

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
│   └── sync/
│       └── src/
│           ├── index.ts         # entry: watcher + SSE + polling
│           ├── watcher.ts       # chokidar file watcher
│           ├── uploader.ts      # chunked upload to API
│           ├── downloader.ts    # download from API to sync-folder
│           └── state.ts         # checksum + last-sync-at persistence
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

## Regenerating typed SQL

After editing any `.sql` file:

```bash
DATABASE_URL=postgres://localhost:5432/pjdrive npm run codegen --prefix apps/api
```

This rewrites the `.queries.ts` files next to each `.sql` file. Commit both together.

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
