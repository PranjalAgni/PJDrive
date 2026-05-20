# PJDrive — System Design Spec

**Date:** 2026-05-20  
**Project:** PJDrive (Google Drive clone)  
**Purpose:** Learning project — full-stack implementation of core Drive functionality  
**Scale:** Small team (10–100 users)

---

## 1. Functional Requirements

1. Users can upload a file from any device
2. Users can download a file from any device
3. Users can share a file with specific users (by email) or via a public link, with editor/viewer access control
4. Files automatically sync across devices via a designated sync folder

---

## 2. Non-Functional Requirements

- **High availability** — prioritize availability over consistency
- **Large file support** — files up to 50GB
- **Reliability** — files are recoverable if lost or corrupted
- **Low latency** — upload, download, and sync are as fast as possible
- **Cost-effective** — CDN used lazily (cache on access, not proactively)

---

## 3. Tech Stack

| Layer | Technology |
|---|---|
| Monorepo | Turborepo |
| Frontend | React (Vite) |
| Backend | Node.js + TypeScript |
| Metadata DB | PostgreSQL |
| File Storage | MinIO (local) / AWS S3 (prod) |
| CDN | CloudFront (prod only) |
| Sync notifications | SSE (primary) + polling fallback |
| File watching | chokidar |

---

## 4. Monorepo Structure

```
pjdrive/
├── apps/
│   ├── web/          ← React frontend
│   ├── api/          ← Node.js + TypeScript backend
│   └── sync/         ← Node.js sync client (file watcher)
├── packages/
│   └── shared/       ← shared TypeScript types and utilities
├── sync-folder/      ← watched directory for desktop sync
```

---

## 5. Architecture

### Components

- **Web App (React)** — browser UI for upload, download, sharing, and browsing files
- **API Server (Node.js + TypeScript)** — handles auth, file metadata, permissions, presigned URLs, SSE
- **Sync Client (Node.js + chokidar)** — watches `sync-folder/`, detects changes, syncs with API
- **PostgreSQL** — stores all metadata: users, files, permissions, upload state, sync log
- **MinIO / S3** — stores raw file bytes; API never proxies file content
- **CDN (CloudFront)** — caches frequently accessed files at edge; private files bypass CDN

### Request Flow (Upload)

1. Client calls `POST /upload/init` with filename, size, total chunks
2. API creates upload record in PostgreSQL, initiates S3 multipart upload
3. API returns `uploadId` + presigned URLs for each chunk
4. Client uploads chunks **directly to MinIO/S3 in parallel** (API not in data path)
5. Client calls `POST /upload/complete` with `uploadId` + eTags
6. API completes multipart, creates file record in PostgreSQL, writes sync_log event
7. API pushes SSE event to other connected clients for this user

### Request Flow (Download)

1. Client calls `GET /files/:id/download-url`
2. API checks permissions in PostgreSQL
3. API returns short-lived presigned URL pointing to CDN (prod) or MinIO (local)
4. Client downloads directly — API not in data path
5. CDN serves from edge on cache hit; fetches from S3 and caches on miss

### Request Flow (Sync — Remote → Local)

1. Sync client connects to `GET /sync/events` (SSE)
2. On file change by another device/web app, server pushes `{ type, fileId }` event
3. Sync client fetches download URL and writes file to `sync-folder/`
4. If SSE disconnects, sync client polls `GET /sync/changes?since=:timestamp` every 30s
5. SSE reconnects automatically when network restores

### Request Flow (Sync — Local → Remote)

1. `chokidar` watches `sync-folder/` for `add`, `change`, `unlink` events
2. On change: debounce 500ms, compute SHA-256 checksum
3. Compare checksum with last known value — skip if unchanged
4. If changed: chunked upload flow (same as manual upload)
5. On delete: call `DELETE /files/:id`

---

## 6. Data Model

### `users`
```sql
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### `files`
```sql
CREATE TABLE files (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID NOT NULL REFERENCES users(id),
  name         VARCHAR(500) NOT NULL,
  mime_type    VARCHAR(255),
  size_bytes   BIGINT,
  storage_key  VARCHAR(1000) NOT NULL,  -- S3/MinIO object key
  checksum     VARCHAR(64),             -- SHA-256 for dedup and sync
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
```

### `uploads` (tracks in-progress chunked uploads)
```sql
CREATE TABLE uploads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id         UUID REFERENCES files(id),
  owner_id        UUID NOT NULL REFERENCES users(id),
  upload_id       VARCHAR(500) NOT NULL,   -- S3 multipart upload ID
  total_chunks    INT NOT NULL,
  uploaded_chunks JSONB DEFAULT '[]',      -- array of completed eTags
  status          VARCHAR(20) DEFAULT 'in_progress',  -- in_progress | complete | failed
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### `shared_files`
```sql
CREATE TABLE shared_files (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id     UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  owner_id    UUID NOT NULL REFERENCES users(id),
  shared_with UUID REFERENCES users(id),           -- null for link shares
  share_type  VARCHAR(10) NOT NULL CHECK (share_type IN ('user', 'link')),
  role        VARCHAR(10) NOT NULL CHECK (role IN ('editor', 'viewer')),
  share_token VARCHAR(64) UNIQUE,                  -- only for link shares
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT user_share_check CHECK (
    (share_type = 'user' AND shared_with IS NOT NULL) OR
    (share_type = 'link' AND share_token IS NOT NULL)
  )
);

CREATE INDEX idx_shared_files_user ON shared_files(shared_with);
CREATE INDEX idx_shared_files_file ON shared_files(file_id);
CREATE UNIQUE INDEX idx_share_token ON shared_files(share_token) WHERE share_token IS NOT NULL;
```

### `sync_log`
```sql
CREATE TABLE sync_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id),
  file_id    UUID NOT NULL REFERENCES files(id),
  event_type VARCHAR(20) NOT NULL,  -- created | updated | deleted
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sync_log_user_time ON sync_log(user_id, created_at);
```

---

## 7. API Endpoints

### Auth
- `POST /auth/register` — create account
- `POST /auth/login` — return JWT

### Files
- `GET /files` — list user's files
- `GET /files/:id` — file metadata
- `DELETE /files/:id` — delete file

### Upload
- `POST /upload/init` — initiate chunked upload, returns presigned URLs
- `GET /upload/status/:uploadId` — check which chunks are uploaded (resumability)
- `POST /upload/complete` — finalize upload

### Download
- `GET /files/:id/download-url` — returns presigned download URL

### Sharing
- `POST /files/:id/share` — share with user by email `{ email, role }`
- `POST /files/:id/share/link` — generate public link `{ role }`
- `GET /files/shared-with-me` — list files shared with current user
- `GET /share/:token` — resolve public link share
- `DELETE /files/:id/share/:shareId` — revoke access

### Sync
- `GET /sync/events` — SSE stream for real-time change notifications
- `GET /sync/changes?since=:timestamp` — polling fallback

---

## 8. Key Design Decisions

| Decision | Choice | Reason |
|---|---|---|
| File storage | MinIO/S3 | Never proxy file bytes through API server |
| Upload strategy | Chunked multipart + presigned URLs | Supports 50GB, resumable, parallel |
| Download strategy | Presigned URLs + CDN | Low latency, API not in data path |
| CDN caching | Lazy (cache on access) | Cost-effective for small user base |
| Sync notifications | SSE + polling fallback | Real-time without WebSocket complexity |
| Permission check order | Owner → user share → link share → deny | Least privilege, explicit deny last |
| Checksum | SHA-256 on client before upload | Avoid redundant uploads, detect corruption |

---

## 9. Out of Scope (Future)

- Folder hierarchy
- File versioning / history
- Real-time collaborative editing
- Mobile apps
- Email invite for non-registered users
