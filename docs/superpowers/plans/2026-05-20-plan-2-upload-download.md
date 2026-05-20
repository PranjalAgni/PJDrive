# File Upload + Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement chunked resumable file upload directly to MinIO/S3, presigned download URLs via CDN, and a React dashboard for browsing, uploading, and downloading files.

**Architecture:** Client splits files into 10MB chunks, requests presigned URLs from API, uploads chunks directly to MinIO in parallel, then notifies API to complete the multipart upload. Downloads use short-lived presigned URLs. API never proxies file bytes. SHA-256 checksum computed client-side before upload to detect duplicates and enable resumability.

**Tech Stack:** `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `crypto` (Node built-in), `crypto-js` (browser), MinIO (local), React, Axios

**Prerequisites:** Plan 1 complete (auth middleware available, all DB tables created).

---

## File Structure

```
apps/api/src/
├── storage.ts                   ← MinIO/S3 client singleton + presigned URL helpers
├── routes/
│   ├── upload.ts                ← POST /upload/init, GET /upload/status/:id, POST /upload/complete
│   ├── upload.test.ts
│   ├── files.ts                 ← GET /files, GET /files/:id, DELETE /files/:id, GET /files/:id/download-url
│   └── files.test.ts
apps/web/src/
├── pages/
│   └── Dashboard.tsx            ← file list + upload button
├── components/
│   ├── FileList.tsx             ← table of user's files
│   └── Uploader.tsx             ← chunked upload UI with progress bar
├── lib/
│   ├── chunker.ts               ← splits File into chunks + computes SHA-256
│   └── upload.ts                ← orchestrates chunk upload, presigned URLs, resume
```

---

### Task 1: MinIO setup + storage service

**Files:**
- Create: `apps/api/src/storage.ts`

- [ ] **Step 1: Start MinIO locally**

```bash
# Using Docker:
docker run -d \
  -p 9000:9000 \
  -p 9001:9001 \
  --name pjdrive-minio \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  quay.io/minio/minio server /data --console-address ":9001"
```

Open `http://localhost:9001`, login with `minioadmin/minioadmin`, create a bucket named `pjdrive`.

- [ ] **Step 2: Add AWS SDK to api dependencies**

In `apps/api/package.json` add:
```json
"@aws-sdk/client-s3": "^3.600.0",
"@aws-sdk/s3-request-presigner": "^3.600.0"
```

Run:
```bash
npm install
```

- [ ] **Step 3: Create apps/api/src/storage.ts**

```typescript
import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
  region: process.env.S3_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || 'minioadmin',
    secretAccessKey: process.env.S3_SECRET_KEY || 'minioadmin',
  },
  forcePathStyle: true, // required for MinIO
});

export const BUCKET = process.env.S3_BUCKET || 'pjdrive';

export async function initiateMultipart(key: string): Promise<string> {
  const cmd = new CreateMultipartUploadCommand({ Bucket: BUCKET, Key: key });
  const res = await s3.send(cmd);
  return res.UploadId!;
}

export async function presignChunkUpload(
  key: string,
  uploadId: string,
  partNumber: number
): Promise<string> {
  const cmd = new UploadPartCommand({
    Bucket: BUCKET,
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
  });
  return getSignedUrl(s3, cmd, { expiresIn: 3600 });
}

export async function completeMultipart(
  key: string,
  uploadId: string,
  parts: { PartNumber: number; ETag: string }[]
): Promise<void> {
  const cmd = new CompleteMultipartUploadCommand({
    Bucket: BUCKET,
    Key: key,
    UploadId: uploadId,
    MultipartUpload: { Parts: parts },
  });
  await s3.send(cmd);
}

export async function presignDownload(key: string, expiresIn = 3600): Promise<string> {
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, cmd, { expiresIn });
}
```

---

### Task 2: Upload API routes

**Files:**
- Create: `apps/api/src/routes/upload.ts`
- Create: `apps/api/src/routes/upload.test.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/api/src/routes/upload.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { pool } from '../db';

let token: string;
let userId: string;

beforeAll(async () => {
  await pool.query("DELETE FROM users WHERE email = 'test-upload@example.com'");
  const res = await request(app)
    .post('/auth/register')
    .send({ email: 'test-upload@example.com', password: 'password123' });
  token = res.body.token;
  userId = res.body.user.id;
});

afterAll(async () => {
  await pool.query("DELETE FROM users WHERE email = 'test-upload@example.com'");
  await pool.end();
});

describe('POST /upload/init', () => {
  it('requires auth', async () => {
    const res = await request(app).post('/upload/init').send({});
    expect(res.status).toBe(401);
  });

  it('returns uploadId and presigned chunk URLs', async () => {
    const res = await request(app)
      .post('/upload/init')
      .set('Authorization', `Bearer ${token}`)
      .send({ fileName: 'test.txt', mimeType: 'text/plain', sizeBytes: 20971520, totalChunks: 2, checksum: 'abc123' });

    expect(res.status).toBe(200);
    expect(res.body.uploadId).toBeDefined();
    expect(res.body.chunkUrls).toHaveLength(2);
  });
});

describe('GET /upload/status/:uploadId', () => {
  it('returns uploaded chunks for a known upload', async () => {
    const initRes = await request(app)
      .post('/upload/init')
      .set('Authorization', `Bearer ${token}`)
      .send({ fileName: 'status-test.txt', mimeType: 'text/plain', sizeBytes: 10485760, totalChunks: 1, checksum: 'def456' });

    const { uploadId } = initRes.body;

    const res = await request(app)
      .get(`/upload/status/${uploadId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.uploadedChunks).toEqual([]);
    expect(res.body.totalChunks).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
DATABASE_URL=postgres://localhost:5432/pjdrive cd apps/api && npx vitest run src/routes/upload.test.ts
```

Expected: FAIL — `Cannot find module` or 404 responses.

- [ ] **Step 3: Create apps/api/src/routes/upload.ts**

```typescript
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { initiateMultipart, presignChunkUpload, completeMultipart } from '../storage';

export const uploadRouter = Router();

uploadRouter.post('/init', requireAuth, async (req: AuthRequest, res) => {
  const { fileName, mimeType, sizeBytes, totalChunks, checksum } = req.body as {
    fileName: string; mimeType: string; sizeBytes: number; totalChunks: number; checksum: string;
  };

  if (!fileName || !totalChunks) return res.status(400).json({ error: 'fileName and totalChunks required' });

  const storageKey = `${req.userId}/${uuidv4()}/${fileName}`;

  // Create file record placeholder
  const fileRes = await pool.query(
    'INSERT INTO files (owner_id, name, mime_type, size_bytes, storage_key, checksum) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    [req.userId, fileName, mimeType, sizeBytes, storageKey, checksum]
  );
  const fileId = fileRes.rows[0].id;

  const s3UploadId = await initiateMultipart(storageKey);

  const chunkUrls: string[] = [];
  for (let i = 1; i <= totalChunks; i++) {
    chunkUrls.push(await presignChunkUpload(storageKey, s3UploadId, i));
  }

  const uploadRes = await pool.query(
    'INSERT INTO uploads (file_id, owner_id, upload_id, total_chunks) VALUES ($1,$2,$3,$4) RETURNING id',
    [fileId, req.userId, s3UploadId, totalChunks]
  );

  return res.json({ uploadId: uploadRes.rows[0].id, chunkUrls });
});

uploadRouter.get('/status/:uploadId', requireAuth, async (req: AuthRequest, res) => {
  const { rows } = await pool.query(
    'SELECT uploaded_chunks, total_chunks FROM uploads WHERE id=$1 AND owner_id=$2',
    [req.params.uploadId, req.userId]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'upload not found' });
  return res.json({ uploadedChunks: rows[0].uploaded_chunks, totalChunks: rows[0].total_chunks });
});

uploadRouter.post('/complete', requireAuth, async (req: AuthRequest, res) => {
  const { uploadId, parts } = req.body as {
    uploadId: string;
    parts: { partNumber: number; eTag: string }[];
  };

  const { rows } = await pool.query(
    'SELECT u.*, f.storage_key FROM uploads u JOIN files f ON f.id=u.file_id WHERE u.id=$1 AND u.owner_id=$2',
    [uploadId, req.userId]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'upload not found' });

  const upload = rows[0];

  await completeMultipart(
    upload.storage_key,
    upload.upload_id,
    parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.eTag }))
  );

  await pool.query("UPDATE uploads SET status='complete' WHERE id=$1", [uploadId]);
  await pool.query(
    "INSERT INTO sync_log (user_id, file_id, event_type) VALUES ($1,$2,'created')",
    [req.userId, upload.file_id]
  );

  const { rows: fileRows } = await pool.query('SELECT * FROM files WHERE id=$1', [upload.file_id]);
  return res.json({ file: fileRows[0] });
});
```

Add `uuid` to `apps/api/package.json`:
```json
"uuid": "^10.0.0",
"@types/uuid": "^10.0.0"
```

- [ ] **Step 4: Register upload router in apps/api/src/index.ts**

```typescript
import { uploadRouter } from './routes/upload';
// add after existing route registration:
app.use('/upload', uploadRouter);
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
DATABASE_URL=postgres://localhost:5432/pjdrive S3_ENDPOINT=http://localhost:9000 cd apps/api && npx vitest run src/routes/upload.test.ts
```

Expected: all 3 tests PASS.

---

### Task 3: Files API routes (list, metadata, delete, download URL)

**Files:**
- Create: `apps/api/src/routes/files.ts`
- Create: `apps/api/src/routes/files.test.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/api/src/routes/files.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { pool } from '../db';

let token: string;
let fileId: string;

beforeAll(async () => {
  await pool.query("DELETE FROM users WHERE email = 'test-files@example.com'");
  const res = await request(app)
    .post('/auth/register')
    .send({ email: 'test-files@example.com', password: 'password123' });
  token = res.body.token;
  const userId = res.body.user.id;

  const fileRes = await pool.query(
    "INSERT INTO files (owner_id, name, mime_type, size_bytes, storage_key, checksum) VALUES ($1,'hello.txt','text/plain',100,'test/key','abc') RETURNING id",
    [userId]
  );
  fileId = fileRes.rows[0].id;
});

afterAll(async () => {
  await pool.query("DELETE FROM users WHERE email = 'test-files@example.com'");
  await pool.end();
});

describe('GET /files', () => {
  it('requires auth', async () => {
    expect((await request(app).get('/files')).status).toBe(401);
  });

  it('returns list of owned files', async () => {
    const res = await request(app).get('/files').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });
});

describe('GET /files/:id', () => {
  it('returns file metadata for owner', async () => {
    const res = await request(app).get(`/files/${fileId}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(fileId);
  });
});

describe('DELETE /files/:id', () => {
  it('deletes file owned by user', async () => {
    const { rows } = await pool.query(
      "INSERT INTO files (owner_id, name, storage_key, checksum) SELECT owner_id,'del.txt','del/key','xyz' FROM files WHERE id=$1 RETURNING id",
      [fileId]
    );
    const delId = rows[0].id;
    const res = await request(app).delete(`/files/${delId}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
DATABASE_URL=postgres://localhost:5432/pjdrive cd apps/api && npx vitest run src/routes/files.test.ts
```

Expected: FAIL — 404s.

- [ ] **Step 3: Create apps/api/src/routes/files.ts**

```typescript
import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { presignDownload } from '../storage';

export const filesRouter = Router();

filesRouter.get('/', requireAuth, async (req: AuthRequest, res) => {
  const { rows } = await pool.query(
    'SELECT id, name, mime_type, size_bytes, checksum, created_at, updated_at FROM files WHERE owner_id=$1 ORDER BY created_at DESC',
    [req.userId]
  );
  return res.json(rows);
});

filesRouter.get('/:id', requireAuth, async (req: AuthRequest, res) => {
  const { rows } = await pool.query(
    'SELECT id, name, mime_type, size_bytes, checksum, created_at, updated_at FROM files WHERE id=$1 AND owner_id=$2',
    [req.params.id, req.userId]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'file not found' });
  return res.json(rows[0]);
});

filesRouter.get('/:id/download-url', requireAuth, async (req: AuthRequest, res) => {
  const { rows } = await pool.query(
    'SELECT storage_key FROM files WHERE id=$1 AND owner_id=$2',
    [req.params.id, req.userId]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'file not found' });
  const url = await presignDownload(rows[0].storage_key);
  return res.json({ url });
});

filesRouter.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  const { rowCount } = await pool.query(
    'DELETE FROM files WHERE id=$1 AND owner_id=$2',
    [req.params.id, req.userId]
  );
  if (rowCount === 0) return res.status(404).json({ error: 'file not found' });
  return res.status(204).send();
});
```

- [ ] **Step 4: Register files router in apps/api/src/index.ts**

```typescript
import { filesRouter } from './routes/files';
// add after upload router:
app.use('/files', filesRouter);
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
DATABASE_URL=postgres://localhost:5432/pjdrive S3_ENDPOINT=http://localhost:9000 cd apps/api && npx vitest run src/routes/files.test.ts
```

Expected: all 4 tests PASS.

---

### Task 4: Frontend — chunker + upload orchestrator

**Files:**
- Create: `apps/web/src/lib/chunker.ts`
- Create: `apps/web/src/lib/upload.ts`

- [ ] **Step 1: Add crypto-js dependency**

In `apps/web/package.json`:
```json
"crypto-js": "^4.2.0",
"@types/crypto-js": "^4.2.2"
```

Run:
```bash
npm install
```

- [ ] **Step 2: Create apps/web/src/lib/chunker.ts**

```typescript
import CryptoJS from 'crypto-js';

export const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB

export function splitIntoChunks(file: File): Blob[] {
  const chunks: Blob[] = [];
  let offset = 0;
  while (offset < file.size) {
    chunks.push(file.slice(offset, offset + CHUNK_SIZE));
    offset += CHUNK_SIZE;
  }
  return chunks;
}

export async function computeChecksum(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const wordArray = CryptoJS.lib.WordArray.create(e.target!.result as ArrayBuffer);
      resolve(CryptoJS.SHA256(wordArray).toString());
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}
```

- [ ] **Step 3: Create apps/web/src/lib/upload.ts**

```typescript
import axios from 'axios';
import { apiClient } from '../api/client';
import { splitIntoChunks, computeChecksum } from './chunker';

export interface UploadProgress {
  chunksCompleted: number;
  totalChunks: number;
}

export async function uploadFile(
  file: File,
  onProgress: (p: UploadProgress) => void
): Promise<{ id: string; name: string }> {
  const checksum = await computeChecksum(file);
  const chunks = splitIntoChunks(file);
  const totalChunks = chunks.length;

  // Init upload
  const { data: initData } = await apiClient.post('/upload/init', {
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    totalChunks,
    checksum,
  });

  const { uploadId, chunkUrls } = initData as { uploadId: string; chunkUrls: string[] };

  // Check resumability — find already uploaded chunks
  const statusRes = await apiClient.get(`/upload/status/${uploadId}`);
  const alreadyUploaded: number[] = statusRes.data.uploadedChunks.map((e: string) =>
    parseInt(e.split(':')[0])
  );

  // Upload chunks in parallel (batches of 3)
  const parts: { partNumber: number; eTag: string }[] = [];

  for (let i = 0; i < totalChunks; i += 3) {
    const batch = chunks.slice(i, i + 3);
    const batchResults = await Promise.all(
      batch.map(async (chunk, j) => {
        const partNumber = i + j + 1;
        if (alreadyUploaded.includes(partNumber)) return null;

        const res = await axios.put(chunkUrls[i + j], chunk, {
          headers: { 'Content-Type': 'application/octet-stream' },
        });
        return { partNumber, eTag: res.headers.etag as string };
      })
    );

    batchResults.forEach((r) => { if (r) parts.push(r); });
    onProgress({ chunksCompleted: Math.min(i + 3, totalChunks), totalChunks });
  }

  // Complete upload
  const { data: completeData } = await apiClient.post('/upload/complete', { uploadId, parts });
  return completeData.file;
}
```

---

### Task 5: Frontend — Dashboard, FileList, Uploader

**Files:**
- Create: `apps/web/src/components/FileList.tsx`
- Create: `apps/web/src/components/Uploader.tsx`
- Create: `apps/web/src/pages/Dashboard.tsx`
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Create apps/web/src/components/FileList.tsx**

```tsx
import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import type { File as DriveFile } from '@pjdrive/shared';

interface Props {
  refresh: number;
}

export function FileList({ refresh }: Props) {
  const [files, setFiles] = useState<DriveFile[]>([]);

  useEffect(() => {
    apiClient.get('/files').then((r) => setFiles(r.data));
  }, [refresh]);

  async function handleDownload(file: DriveFile) {
    const { data } = await apiClient.get(`/files/${file.id}/download-url`);
    window.open(data.url, '_blank');
  }

  async function handleDelete(file: DriveFile) {
    if (!confirm(`Delete ${file.name}?`)) return;
    await apiClient.delete(`/files/${file.id}`);
    setFiles((prev) => prev.filter((f) => f.id !== file.id));
  }

  if (files.length === 0) return <p>No files yet. Upload one!</p>;

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={{ textAlign: 'left' }}>Name</th>
          <th style={{ textAlign: 'left' }}>Size</th>
          <th style={{ textAlign: 'left' }}>Uploaded</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {files.map((f) => (
          <tr key={f.id} style={{ borderTop: '1px solid #eee' }}>
            <td>{f.name}</td>
            <td>{(f.size_bytes / 1024 / 1024).toFixed(2)} MB</td>
            <td>{new Date(f.created_at).toLocaleDateString()}</td>
            <td>
              <button onClick={() => handleDownload(f)} style={{ marginRight: 8 }}>Download</button>
              <button onClick={() => handleDelete(f)}>Delete</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 2: Create apps/web/src/components/Uploader.tsx**

```tsx
import { useRef, useState } from 'react';
import { uploadFile, UploadProgress } from '../lib/upload';

interface Props {
  onUploaded: () => void;
}

export function Uploader({ onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState('');

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setProgress({ chunksCompleted: 0, totalChunks: 1 });

    try {
      await uploadFile(file, setProgress);
      setProgress(null);
      onUploaded();
    } catch (err: any) {
      setError(err.message || 'Upload failed');
      setProgress(null);
    }
  }

  const pct = progress
    ? Math.round((progress.chunksCompleted / progress.totalChunks) * 100)
    : 0;

  return (
    <div style={{ marginBottom: 24 }}>
      <input ref={inputRef} type="file" style={{ display: 'none' }} onChange={handleChange} />
      <button onClick={() => inputRef.current?.click()} disabled={!!progress}>
        {progress ? `Uploading… ${pct}%` : 'Upload File'}
      </button>
      {progress && (
        <div style={{ marginTop: 8, background: '#eee', borderRadius: 4, height: 8 }}>
          <div style={{ width: `${pct}%`, background: '#4caf50', height: '100%', borderRadius: 4 }} />
        </div>
      )}
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Create apps/web/src/pages/Dashboard.tsx**

```tsx
import { useState } from 'react';
import { useAuthStore } from '../store/auth';
import { FileList } from '../components/FileList';
import { Uploader } from '../components/Uploader';

export function Dashboard() {
  const [refreshKey, setRefreshKey] = useState(0);
  const { email, clearAuth } = useAuthStore();

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1>PJDrive</h1>
        <div>
          <span style={{ marginRight: 16 }}>{email}</span>
          <button onClick={clearAuth}>Logout</button>
        </div>
      </div>
      <Uploader onUploaded={() => setRefreshKey((k) => k + 1)} />
      <FileList refresh={refreshKey} />
    </div>
  );
}
```

- [ ] **Step 4: Update apps/web/src/App.tsx to use Dashboard**

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Dashboard } from './pages/Dashboard';
import { useAuthStore } from './store/auth';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 5: Run dev and verify manually**

```bash
DATABASE_URL=postgres://localhost:5432/pjdrive S3_ENDPOINT=http://localhost:9000 npx turbo run dev
```

Open `http://localhost:5173`. Verify:
- File list shows after login
- Clicking "Upload File" opens file picker
- Uploading a small file (<10MB, single chunk) shows progress and appears in the list
- Uploading a file >10MB shows chunked progress
- Clicking "Download" opens the file in a new tab
- Clicking "Delete" removes the file from the list

