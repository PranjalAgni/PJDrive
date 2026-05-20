# pgtyped Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all inline `pool.query()` SQL strings in the API with pgtyped typed query functions, co-locating `.sql` files next to their route files.

**Architecture:** pgtyped reads annotated `.sql` files, introspects the live PostgreSQL schema, and generates `.queries.ts` files with fully-typed functions. Each route file gets a sibling `.sql` file containing its named queries. Transaction control (`BEGIN`/`COMMIT`/`ROLLBACK`), DDL, and the migration runner stay as raw `client.query()` calls — pgtyped does not handle these. The generated `.queries.ts` files are committed to the repo (no runtime codegen needed).

**Tech Stack:** `@pgtyped/runtime`, `@pgtyped/cli`, TypeScript, PostgreSQL

**Prerequisites:**
- PostgreSQL `pjdrive` database running locally
- All 5 tables exist (users, files, uploads, shared_files, sync_log)
- `DATABASE_URL=postgres://localhost:5432/pjdrive`

---

## What pgtyped does NOT handle (stay as raw queries)

These remain as `pool.query()` / `client.query()` calls and are **not migrated**:

| File | Query | Why |
|------|-------|-----|
| `files.ts` | `BEGIN`, `ROLLBACK`, `COMMIT` | Transaction control |
| `files.ts` | `DELETE FROM files WHERE id=$1` | Inside transaction, no RETURNING needed |
| `migrate.ts` | All queries | Dynamic DDL runner |
| `index.ts` error handler | N/A | Not a query |

---

## File Structure

```
apps/api/
├── package.json                        ← add @pgtyped/runtime, @pgtyped/cli
├── pgtyped.config.json                 ← pgtyped configuration
└── src/
    └── routes/
        ├── auth.sql                    ← named queries for auth.ts
        ├── auth.queries.ts             ← GENERATED — do not edit
        ├── auth.ts                     ← modified to use typed functions
        ├── upload.sql
        ├── upload.queries.ts           ← GENERATED
        ├── upload.ts                   ← modified
        ├── files.sql
        ├── files.queries.ts            ← GENERATED
        ├── files.ts                    ← modified
        ├── sharing.sql
        ├── sharing.queries.ts          ← GENERATED
        ├── sharing.ts                  ← modified
        ├── sharedWithMe.sql
        ├── sharedWithMe.queries.ts     ← GENERATED
        ├── sharedWithMe.ts             ← modified
        ├── sync.sql
        ├── sync.queries.ts             ← GENERATED
        └── sync.ts                     ← modified
    └── index.sql                       ← named query for share token resolution
    └── index.queries.ts                ← GENERATED
    └── index.ts                        ← modified
```

---

## pgtyped SQL annotation syntax

pgtyped uses named query annotations in `.sql` files:

```sql
/* @name QueryName */
SELECT id, email FROM users WHERE id = :id;
```

Named parameters use `:paramName` syntax (not `$1`). pgtyped maps these to typed TypeScript parameters. For `INSERT ... RETURNING`, pgtyped infers the return type from the schema.

Calling a typed query:
```typescript
import { queryName } from './file.queries';
const rows = await queryName.run({ paramName: value }, pool);
```

---

### Task 1: Install pgtyped and create config

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/pgtyped.config.json`

- [ ] **Step 1: Add pgtyped dependencies**

In `apps/api/package.json`, add to `dependencies`:
```json
"@pgtyped/runtime": "^2.3.2"
```

Add to `devDependencies`:
```json
"@pgtyped/cli": "^2.3.2"
```

Add to `scripts`:
```json
"codegen": "pgtyped -c pgtyped.config.json"
```

Run from repo root:
```bash
npm install
```

- [ ] **Step 2: Create apps/api/pgtyped.config.json**

```json
{
  "transforms": [
    {
      "mode": "sql",
      "include": "src/**/*.sql",
      "emitTemplate": "{{dir}}/{{name}}.queries.ts"
    }
  ],
  "srcDir": "./",
  "db": {
    "dbName": "pjdrive",
    "host": "localhost",
    "port": 5432,
    "user": "postgres"
  },
  "failOnError": true
}
```

Note: pgtyped reads `db.user` from env `PGUSER` if not set. If your local PostgreSQL uses a different user or no password, adjust accordingly. You can also use `"connectionString"` instead:

```json
{
  "transforms": [
    {
      "mode": "sql",
      "include": "src/**/*.sql",
      "emitTemplate": "{{dir}}/{{name}}.queries.ts"
    }
  ],
  "srcDir": "./",
  "db": {
    "connectionString": "postgres://localhost:5432/pjdrive"
  },
  "failOnError": true
}
```

- [ ] **Step 3: Verify pgtyped CLI is available**

```bash
cd apps/api && npx pgtyped --version
```

Expected: prints a version string like `2.3.x`

---

### Task 2: auth.sql + migrate auth.ts

**Files:**
- Create: `apps/api/src/routes/auth.sql`
- Create: `apps/api/src/routes/auth.queries.ts` (generated)
- Modify: `apps/api/src/routes/auth.ts`

- [ ] **Step 1: Create apps/api/src/routes/auth.sql**

```sql
/* @name InsertUser */
INSERT INTO users (email, password_hash)
VALUES (:email, :passwordHash)
RETURNING id, email, created_at;

/* @name GetUserByEmail */
SELECT id, email, password_hash
FROM users
WHERE email = :email;
```

- [ ] **Step 2: Run pgtyped codegen**

```bash
cd apps/api && DATABASE_URL=postgres://localhost:5432/pjdrive npx pgtyped -c pgtyped.config.json
```

Expected: generates `src/routes/auth.queries.ts` with no errors. You will see output like:
```
Processing src/routes/auth.sql
```

- [ ] **Step 3: Verify auth.queries.ts was generated**

```bash
cat apps/api/src/routes/auth.queries.ts
```

Expected: file contains exported `insertUser` and `getUserByEmail` query objects with TypeScript types.

- [ ] **Step 4: Update apps/api/src/routes/auth.ts**

Replace the two `pool.query()` calls with typed functions. Full updated file:

```typescript
import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../db';
import { JWT_SECRET, BCRYPT_ROUNDS } from '../config';
import { insertUser, getUserByEmail } from './auth.queries';

export const authRouter = Router();

authRouter.post('/register', async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  if (password.length < 8) return res.status(400).json({ error: 'password must be at least 8 characters' });

  const normalizedEmail = email.trim().toLowerCase();
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  try {
    const rows = await insertUser.run({ email: normalizedEmail, passwordHash: hash }, pool);
    const user = rows[0];
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    return res.status(201).json({ token, user: { id: user.id, email: user.email } });
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'email already registered' });
    console.error('register error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const rows = await getUserByEmail.run({ email: normalizedEmail }, pool);
    if (rows.length === 0) return res.status(401).json({ error: 'invalid credentials' });

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'invalid credentials' });

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    return res.status(200).json({ token, user: { id: user.id, email: user.email } });
  } catch (err: any) {
    console.error('login error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});
```

- [ ] **Step 5: Run auth tests to verify**

```bash
cd apps/api && DATABASE_URL=postgres://localhost:5432/pjdrive npx vitest run src/routes/auth.test.ts
```

Expected: all 7 tests PASS.

---

### Task 3: upload.sql + migrate upload.ts

**Files:**
- Create: `apps/api/src/routes/upload.sql`
- Create: `apps/api/src/routes/upload.queries.ts` (generated)
- Modify: `apps/api/src/routes/upload.ts`

- [ ] **Step 1: Create apps/api/src/routes/upload.sql**

```sql
/* @name InsertFile */
INSERT INTO files (owner_id, name, mime_type, size_bytes, storage_key, checksum)
VALUES (:ownerId, :name, :mimeType, :sizeBytes, :storageKey, :checksum)
RETURNING id;

/* @name InsertUpload */
INSERT INTO uploads (file_id, owner_id, upload_id, total_chunks)
VALUES (:fileId, :ownerId, :uploadId, :totalChunks)
RETURNING id;

/* @name GetUploadStatus */
SELECT uploaded_chunks, total_chunks
FROM uploads
WHERE id = :uploadId AND owner_id = :ownerId;

/* @name GetUploadWithFile */
SELECT u.id, u.file_id, u.upload_id, u.total_chunks, u.uploaded_chunks, u.status, f.storage_key
FROM uploads u
JOIN files f ON f.id = u.file_id
WHERE u.id = :uploadId AND u.owner_id = :ownerId;

/* @name CompleteUpload */
UPDATE uploads
SET status = 'complete'
WHERE id = :uploadId;

/* @name InsertSyncLogCreated */
INSERT INTO sync_log (user_id, file_id, event_type)
VALUES (:userId, :fileId, 'created');

/* @name GetFileById */
SELECT id, name, mime_type, size_bytes, checksum, created_at, updated_at
FROM files
WHERE id = :fileId;
```

- [ ] **Step 2: Run codegen**

```bash
cd apps/api && DATABASE_URL=postgres://localhost:5432/pjdrive npx pgtyped -c pgtyped.config.json
```

Expected: generates `src/routes/upload.queries.ts` with no errors.

- [ ] **Step 3: Update apps/api/src/routes/upload.ts**

Full updated file:

```typescript
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { initiateMultipart, presignChunkUpload, completeMultipart } from '../storage';
import { broadcastSyncEvent } from './sync';
import {
  insertFile,
  insertUpload,
  getUploadStatus,
  getUploadWithFile,
  completeUpload,
  insertSyncLogCreated,
  getFileById,
} from './upload.queries';

export const uploadRouter = Router();

uploadRouter.post('/init', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { fileName, mimeType, sizeBytes, totalChunks, checksum } = req.body as {
      fileName: string; mimeType: string; sizeBytes: number; totalChunks: number; checksum: string;
    };

    if (!fileName || !totalChunks) return res.status(400).json({ error: 'fileName and totalChunks required' });

    const storageKey = `${req.userId}/${uuidv4()}/${fileName}`;

    const fileRows = await insertFile.run({
      ownerId: req.userId!, name: fileName, mimeType, sizeBytes, storageKey, checksum,
    }, pool);
    const fileId = fileRows[0].id;

    const s3UploadId = await initiateMultipart(storageKey);

    const chunkUrls: string[] = [];
    for (let i = 1; i <= totalChunks; i++) {
      chunkUrls.push(await presignChunkUpload(storageKey, s3UploadId, i));
    }

    const uploadRows = await insertUpload.run({
      fileId, ownerId: req.userId!, uploadId: s3UploadId, totalChunks,
    }, pool);

    return res.json({ uploadId: uploadRows[0].id, chunkUrls });
  } catch (err) {
    console.error('upload init error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

uploadRouter.get('/status/:uploadId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await getUploadStatus.run({ uploadId: req.params.uploadId, ownerId: req.userId! }, pool);
    if (rows.length === 0) return res.status(404).json({ error: 'upload not found' });
    return res.json({ uploadedChunks: rows[0].uploaded_chunks, totalChunks: rows[0].total_chunks });
  } catch (err) {
    console.error('upload status error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

uploadRouter.post('/complete', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { uploadId, parts } = req.body as {
      uploadId: string;
      parts: { partNumber: number; eTag: string }[];
    };

    if (!Array.isArray(parts) || parts.length === 0) {
      return res.status(400).json({ error: 'parts array required' });
    }

    const uploadRows = await getUploadWithFile.run({ uploadId, ownerId: req.userId! }, pool);
    if (uploadRows.length === 0) return res.status(404).json({ error: 'upload not found' });

    const upload = uploadRows[0];

    await completeMultipart(
      upload.storage_key,
      upload.upload_id,
      parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.eTag }))
    );

    await completeUpload.run({ uploadId }, pool);
    await insertSyncLogCreated.run({ userId: req.userId!, fileId: upload.file_id }, pool);
    broadcastSyncEvent(req.userId!, { fileId: upload.file_id, eventType: 'created' });

    const fileRows = await getFileById.run({ fileId: upload.file_id }, pool);
    return res.json({ file: fileRows[0] });
  } catch (err) {
    console.error('upload complete error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});
```

- [ ] **Step 4: Run upload tests**

```bash
cd apps/api && DATABASE_URL=postgres://localhost:5432/pjdrive S3_ENDPOINT=http://localhost:9002 npx vitest run src/routes/upload.test.ts
```

Expected: all 3 tests PASS.

---

### Task 4: files.sql + migrate files.ts

**Files:**
- Create: `apps/api/src/routes/files.sql`
- Create: `apps/api/src/routes/files.queries.ts` (generated)
- Modify: `apps/api/src/routes/files.ts`

Note: The DELETE handler uses a transaction (`BEGIN`/`COMMIT`/`ROLLBACK`) with a `client` from `pool.connect()`. Transaction control SQL and the `DELETE FROM files` inside the transaction stay as raw `client.query()`. Only the `SELECT` and `INSERT INTO sync_log` within the transaction can use typed functions — but since they must use `client` (not `pool`), and pgtyped's `.run()` accepts any `DatabasePoolType`, we can pass `client` directly.

- [ ] **Step 1: Create apps/api/src/routes/files.sql**

```sql
/* @name ListFilesByOwner */
SELECT id, name, mime_type, size_bytes, checksum, created_at, updated_at
FROM files
WHERE owner_id = :ownerId
ORDER BY created_at DESC;

/* @name GetFileByIdAndOwner */
SELECT id, name, mime_type, size_bytes, checksum, created_at, updated_at
FROM files
WHERE id = :fileId AND owner_id = :ownerId;

/* @name GetFileStorageKey */
SELECT storage_key
FROM files
WHERE id = :fileId AND owner_id = :ownerId;

/* @name GetFileStorageKeyForDelete */
SELECT storage_key
FROM files
WHERE id = :fileId AND owner_id = :ownerId;

/* @name InsertSyncLogDeleted */
INSERT INTO sync_log (user_id, file_id, event_type)
VALUES (:userId, :fileId, 'deleted');
```

- [ ] **Step 2: Run codegen**

```bash
cd apps/api && DATABASE_URL=postgres://localhost:5432/pjdrive npx pgtyped -c pgtyped.config.json
```

Expected: generates `src/routes/files.queries.ts`.

- [ ] **Step 3: Update apps/api/src/routes/files.ts**

Full updated file:

```typescript
import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { s3, BUCKET, presignDownload } from '../storage';
import { broadcastSyncEvent } from './sync';
import {
  listFilesByOwner,
  getFileByIdAndOwner,
  getFileStorageKey,
  getFileStorageKeyForDelete,
  insertSyncLogDeleted,
} from './files.queries';

export const filesRouter = Router();

filesRouter.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await listFilesByOwner.run({ ownerId: req.userId! }, pool);
    return res.json(rows);
  } catch (err) {
    console.error('files list error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

filesRouter.get('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await getFileByIdAndOwner.run({ fileId: req.params.id, ownerId: req.userId! }, pool);
    if (rows.length === 0) return res.status(404).json({ error: 'file not found' });
    return res.json(rows[0]);
  } catch (err) {
    console.error('files get error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

filesRouter.get('/:id/download-url', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await getFileStorageKey.run({ fileId: req.params.id, ownerId: req.userId! }, pool);
    if (rows.length === 0) return res.status(404).json({ error: 'file not found' });
    const url = await presignDownload(rows[0].storage_key);
    return res.json({ url });
  } catch (err) {
    console.error('files download-url error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

filesRouter.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Verify ownership and get storage_key
      const rows = await getFileStorageKeyForDelete.run(
        { fileId: req.params.id, ownerId: req.userId! },
        client
      );

      if (rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'file not found' });
      }

      // Write sync_log before DELETE (FK on file_id requires the files row to exist)
      await insertSyncLogDeleted.run({ userId: req.userId!, fileId: req.params.id }, client);

      // Delete the file row (raw query — no RETURNING needed, stays inside transaction)
      await client.query('DELETE FROM files WHERE id=$1', [req.params.id]);

      await client.query('COMMIT');

      broadcastSyncEvent(req.userId!, { fileId: req.params.id, eventType: 'deleted' });

      // Delete from S3 after DB commit — best effort
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: rows[0].storage_key }));
      } catch (s3Err) {
        console.error('files delete S3 error (DB already committed):', s3Err);
      }

      return res.status(204).send();
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('files delete error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});
```

- [ ] **Step 4: Run files tests**

```bash
cd apps/api && DATABASE_URL=postgres://localhost:5432/pjdrive S3_ENDPOINT=http://localhost:9002 npx vitest run src/routes/files.test.ts
```

Expected: all 4 tests PASS.

---

### Task 5: sharing.sql + migrate sharing.ts + sharedWithMe

**Files:**
- Create: `apps/api/src/routes/sharing.sql`
- Create: `apps/api/src/routes/sharing.queries.ts` (generated)
- Modify: `apps/api/src/routes/sharing.ts`
- Create: `apps/api/src/routes/sharedWithMe.sql`
- Create: `apps/api/src/routes/sharedWithMe.queries.ts` (generated)
- Modify: `apps/api/src/routes/sharedWithMe.ts`

- [ ] **Step 1: Create apps/api/src/routes/sharing.sql**

```sql
/* @name CheckFileOwnership */
SELECT id
FROM files
WHERE id = :fileId AND owner_id = :ownerId;

/* @name GetUserByEmail */
SELECT id
FROM users
WHERE email = :email;

/* @name InsertUserShare */
INSERT INTO shared_files (file_id, owner_id, shared_with, share_type, role)
VALUES (:fileId, :ownerId, :sharedWith, 'user', :role)
ON CONFLICT DO NOTHING
RETURNING id, file_id, owner_id, shared_with, share_type, role, share_token, expires_at, created_at;

/* @name GetExistingUserShare */
SELECT id, file_id, owner_id, shared_with, share_type, role, share_token, expires_at, created_at
FROM shared_files
WHERE file_id = :fileId AND shared_with = :sharedWith AND share_type = 'user';

/* @name InsertLinkShare */
INSERT INTO shared_files (file_id, owner_id, share_type, role, share_token)
VALUES (:fileId, :ownerId, 'link', :role, :shareToken)
RETURNING id, file_id, owner_id, shared_with, share_type, role, share_token, expires_at, created_at;
```

- [ ] **Step 2: Create apps/api/src/routes/sharedWithMe.sql**

```sql
/* @name GetSharedWithMe */
SELECT f.id, f.name, f.mime_type, f.size_bytes, f.created_at, sf.role, u.email AS owner_email
FROM shared_files sf
JOIN files f ON f.id = sf.file_id
JOIN users u ON u.id = sf.owner_id
WHERE sf.shared_with = :userId
  AND sf.share_type = 'user'
  AND (sf.expires_at IS NULL OR sf.expires_at > NOW())
ORDER BY f.created_at DESC;
```

- [ ] **Step 3: Run codegen**

```bash
cd apps/api && DATABASE_URL=postgres://localhost:5432/pjdrive npx pgtyped -c pgtyped.config.json
```

Expected: generates `sharing.queries.ts` and `sharedWithMe.queries.ts`.

- [ ] **Step 4: Update apps/api/src/routes/sharing.ts**

Full updated file:

```typescript
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import {
  checkFileOwnership,
  getUserByEmail,
  insertUserShare,
  getExistingUserShare,
  insertLinkShare,
  deleteShare,
} from './sharing.queries';

export const sharingRouter = Router();

// Share with specific user by email
sharingRouter.post('/:id/share', requireAuth, async (req: AuthRequest, res) => {
  const { email, role } = req.body as { email: string; role: string };
  if (!email) return res.status(400).json({ error: 'email required' });
  if (role !== 'editor' && role !== 'viewer') return res.status(400).json({ error: 'role must be editor or viewer' });
  try {
    const fileRows = await checkFileOwnership.run({ fileId: req.params.id, ownerId: req.userId! }, pool);
    if (fileRows.length === 0) return res.status(403).json({ error: 'access denied' });

    const userRows = await getUserByEmail.run({ email }, pool);
    if (userRows.length === 0) return res.status(404).json({ error: 'user not found' });

    const sharedWith = userRows[0].id;

    const rows = await insertUserShare.run({
      fileId: req.params.id, ownerId: req.userId!, sharedWith, role,
    }, pool);

    if (rows.length === 0) {
      // Share already exists — return it
      const existing = await getExistingUserShare.run({
        fileId: req.params.id, sharedWith,
      }, pool);
      return res.status(200).json(existing[0]);
    }

    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error('sharing user share error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

// Generate public share link
sharingRouter.post('/:id/share/link', requireAuth, async (req: AuthRequest, res) => {
  const { role } = req.body as { role: string };
  if (role !== 'editor' && role !== 'viewer') return res.status(400).json({ error: 'role must be editor or viewer' });
  try {
    const fileRows = await checkFileOwnership.run({ fileId: req.params.id, ownerId: req.userId! }, pool);
    if (fileRows.length === 0) return res.status(403).json({ error: 'access denied' });

    const shareToken = uuidv4();

    const rows = await insertLinkShare.run({
      fileId: req.params.id, ownerId: req.userId!, role, shareToken,
    }, pool);

    const shareUrl = `${process.env.APP_URL || 'http://localhost:5173'}/share/${shareToken}`;
    return res.status(201).json({ ...rows[0], shareToken, shareUrl });
  } catch (err) {
    console.error('sharing link error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

// Revoke share
sharingRouter.delete('/:id/share/:shareId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const result = await deleteShare.run({
      shareId: req.params.shareId, fileId: req.params.id, ownerId: req.userId!,
    }, pool);
    // pgtyped DELETE doesn't return rowCount directly — check result length
    // deleteShare returns affected rows as empty array; use pool.query rowCount for this
    // Workaround: use raw query for the rowCount check
    const { rowCount } = await pool.query(
      'SELECT 1 FROM shared_files WHERE id=$1 AND file_id=$2 AND owner_id=$3',
      [req.params.shareId, req.params.id, req.userId]
    );
    // If the share still exists after delete attempt, it wasn't ours
    // Actually: just re-do delete with pool.query to get rowCount
    return res.status(204).send();
  } catch (err) {
    console.error('sharing revoke error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});
```

**Wait** — pgtyped DELETE queries do not expose `rowCount` easily. For the revoke handler which needs to detect "not found", keep it as a raw `pool.query`:

Replace the revoke handler with:

```typescript
// Revoke share — keep as raw query to access rowCount
sharingRouter.delete('/:id/share/:shareId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM shared_files WHERE id=$1 AND file_id=$2 AND owner_id=$3',
      [req.params.shareId, req.params.id, req.userId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'share not found' });
    return res.status(204).send();
  } catch (err) {
    console.error('sharing revoke error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});
```

And remove `deleteShare` from the imports since it's unused.

Full corrected `sharing.ts`:

```typescript
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import {
  checkFileOwnership,
  getUserByEmail,
  insertUserShare,
  getExistingUserShare,
  insertLinkShare,
} from './sharing.queries';

export const sharingRouter = Router();

sharingRouter.post('/:id/share', requireAuth, async (req: AuthRequest, res) => {
  const { email, role } = req.body as { email: string; role: string };
  if (!email) return res.status(400).json({ error: 'email required' });
  if (role !== 'editor' && role !== 'viewer') return res.status(400).json({ error: 'role must be editor or viewer' });
  try {
    const fileRows = await checkFileOwnership.run({ fileId: req.params.id, ownerId: req.userId! }, pool);
    if (fileRows.length === 0) return res.status(403).json({ error: 'access denied' });

    const userRows = await getUserByEmail.run({ email }, pool);
    if (userRows.length === 0) return res.status(404).json({ error: 'user not found' });

    const sharedWith = userRows[0].id;
    const rows = await insertUserShare.run({
      fileId: req.params.id, ownerId: req.userId!, sharedWith, role,
    }, pool);

    if (rows.length === 0) {
      const existing = await getExistingUserShare.run({ fileId: req.params.id, sharedWith }, pool);
      return res.status(200).json(existing[0]);
    }
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error('sharing user share error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

sharingRouter.post('/:id/share/link', requireAuth, async (req: AuthRequest, res) => {
  const { role } = req.body as { role: string };
  if (role !== 'editor' && role !== 'viewer') return res.status(400).json({ error: 'role must be editor or viewer' });
  try {
    const fileRows = await checkFileOwnership.run({ fileId: req.params.id, ownerId: req.userId! }, pool);
    if (fileRows.length === 0) return res.status(403).json({ error: 'access denied' });

    const shareToken = uuidv4();
    const rows = await insertLinkShare.run({
      fileId: req.params.id, ownerId: req.userId!, role, shareToken,
    }, pool);

    const shareUrl = `${process.env.APP_URL || 'http://localhost:5173'}/share/${shareToken}`;
    return res.status(201).json({ ...rows[0], shareToken, shareUrl });
  } catch (err) {
    console.error('sharing link error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

sharingRouter.delete('/:id/share/:shareId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM shared_files WHERE id=$1 AND file_id=$2 AND owner_id=$3',
      [req.params.shareId, req.params.id, req.userId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'share not found' });
    return res.status(204).send();
  } catch (err) {
    console.error('sharing revoke error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});
```

- [ ] **Step 5: Update apps/api/src/routes/sharedWithMe.ts**

Full updated file:

```typescript
import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { getSharedWithMe } from './sharedWithMe.queries';

export const sharedWithMeRouter = Router();

sharedWithMeRouter.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await getSharedWithMe.run({ userId: req.userId! }, pool);
    return res.json(rows);
  } catch (err) {
    console.error('shared-with-me error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});
```

- [ ] **Step 6: Run sharing tests**

```bash
cd apps/api && DATABASE_URL=postgres://localhost:5432/pjdrive npx vitest run src/routes/sharing.test.ts
```

Expected: all 7 tests PASS.

---

### Task 6: sync.sql + migrate sync.ts + index.ts share route

**Files:**
- Create: `apps/api/src/routes/sync.sql`
- Create: `apps/api/src/routes/sync.queries.ts` (generated)
- Modify: `apps/api/src/routes/sync.ts`
- Create: `apps/api/src/index.sql`
- Create: `apps/api/src/index.queries.ts` (generated)
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Create apps/api/src/routes/sync.sql**

```sql
/* @name GetSyncChanges */
SELECT file_id, event_type, created_at
FROM sync_log
WHERE user_id = :userId AND created_at > :since
ORDER BY created_at ASC
LIMIT 500;
```

- [ ] **Step 2: Create apps/api/src/index.sql**

```sql
/* @name ResolveShareToken */
SELECT sf.file_id, sf.role, f.name, f.mime_type, f.size_bytes
FROM shared_files sf
JOIN files f ON f.id = sf.file_id
WHERE sf.share_token = :shareToken
  AND sf.share_type = 'link'
  AND (sf.expires_at IS NULL OR sf.expires_at > NOW());
```

- [ ] **Step 3: Run codegen**

```bash
cd apps/api && DATABASE_URL=postgres://localhost:5432/pjdrive npx pgtyped -c pgtyped.config.json
```

Expected: generates `sync.queries.ts` and `src/index.queries.ts`.

- [ ] **Step 4: Update apps/api/src/routes/sync.ts**

Replace only the `/changes` handler's query. Full updated sync.ts:

```typescript
import { Router, Response } from 'express';
import { pool } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { getSyncChanges } from './sync.queries';

export const syncRouter = Router();

const clients = new Map<string, Set<Response>>();

export function broadcastSyncEvent(userId: string, event: { fileId: string; eventType: string }) {
  const userClients = clients.get(userId);
  if (!userClients) return;
  const data = JSON.stringify(event);
  const dead: Response[] = [];
  userClients.forEach((res) => {
    try {
      res.write(`data: ${data}\n\n`);
    } catch {
      dead.push(res);
    }
  });
  dead.forEach((res) => userClients.delete(res));
  if (userClients.size === 0) clients.delete(userId);
}

syncRouter.get('/events', requireAuth, (req: AuthRequest, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const userId = req.userId!;
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId)!.add(res);

  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    clients.get(userId)?.delete(res);
    if (clients.get(userId)?.size === 0) clients.delete(userId);
  });

  res.on('error', () => {
    clearInterval(heartbeat);
    clients.get(userId)?.delete(res);
    if (clients.get(userId)?.size === 0) clients.delete(userId);
  });
});

syncRouter.get('/changes', requireAuth, async (req: AuthRequest, res) => {
  try {
    const sinceRaw = req.query.since as string;
    let since: Date;
    if (sinceRaw) {
      const parsed = new Date(sinceRaw);
      if (isNaN(parsed.getTime())) {
        return res.status(400).json({ error: 'invalid since timestamp' });
      }
      since = parsed;
    } else {
      since = new Date(0);
    }

    const rows = await getSyncChanges.run({ userId: req.userId!, since }, pool);
    return res.json(rows);
  } catch (err) {
    console.error('sync changes error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});
```

- [ ] **Step 5: Update apps/api/src/index.ts share token route**

Replace the `pool.query()` in the `/share/:token` handler with the typed query. Full updated index.ts:

```typescript
import express from 'express';
import cors from 'cors';
import { authRouter } from './routes/auth';
import { requireAuth, AuthRequest } from './middleware/auth';
import { filesRouter } from './routes/files';
import { uploadRouter } from './routes/upload';
import { sharingRouter } from './routes/sharing';
import { sharedWithMeRouter } from './routes/sharedWithMe';
import { syncRouter } from './routes/sync';
import { resolveShareToken } from './index.queries';

export const app = express();

app.use(cors());
app.use(express.json());
app.use('/auth', authRouter);

app.get('/share/:token', async (req, res) => {
  try {
    const rows = await resolveShareToken.run({ shareToken: req.params.token }, app.get('pool') ?? require('./db').pool);
    if (rows.length === 0) return res.status(404).json({ error: 'share not found' });
    const row = rows[0];
    return res.json({
      file: { id: row.file_id, name: row.name, mime_type: row.mime_type, size_bytes: row.size_bytes },
      role: row.role,
    });
  } catch (err) {
    console.error('share token resolve error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});
```

**Note:** `index.ts` can't import `pool` at the top level without a circular import risk. Use a direct import:

```typescript
import { pool } from './db';
import { resolveShareToken } from './index.queries';

// In handler:
const rows = await resolveShareToken.run({ shareToken: req.params.token }, pool);
```

Full corrected index.ts:

```typescript
import express from 'express';
import cors from 'cors';
import { authRouter } from './routes/auth';
import { requireAuth, AuthRequest } from './middleware/auth';
import { filesRouter } from './routes/files';
import { uploadRouter } from './routes/upload';
import { sharingRouter } from './routes/sharing';
import { sharedWithMeRouter } from './routes/sharedWithMe';
import { syncRouter } from './routes/sync';
import { pool } from './db';
import { resolveShareToken } from './index.queries';

export const app = express();

app.use(cors());
app.use(express.json());
app.use('/auth', authRouter);

app.get('/share/:token', async (req, res) => {
  try {
    const rows = await resolveShareToken.run({ shareToken: req.params.token }, pool);
    if (rows.length === 0) return res.status(404).json({ error: 'share not found' });
    const row = rows[0];
    return res.json({
      file: { id: row.file_id, name: row.name, mime_type: row.mime_type, size_bytes: row.size_bytes },
      role: row.role,
    });
  } catch (err) {
    console.error('share token resolve error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

app.use('/files/shared-with-me', sharedWithMeRouter);
app.use('/files', sharingRouter);
app.use('/files', filesRouter);
app.use('/upload', uploadRouter);
app.use('/sync', syncRouter);

app.get('/auth/me', requireAuth, (req: AuthRequest, res) => {
  res.json({ userId: req.userId });
});

app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('unhandled error:', err);
  res.status(500).json({ error: 'internal server error' });
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`API running on port ${PORT}`));
}
```

- [ ] **Step 6: Run sync tests**

```bash
cd apps/api && DATABASE_URL=postgres://localhost:5432/pjdrive npx vitest run src/routes/sync.test.ts
```

Expected: all 3 tests PASS.

---

### Task 7: Full test suite verification

**Files:** None (verification only)

- [ ] **Step 1: Run full codegen to verify all .sql files are valid**

```bash
cd apps/api && DATABASE_URL=postgres://localhost:5432/pjdrive npx pgtyped -c pgtyped.config.json
```

Expected: no errors. All `.queries.ts` files regenerated.

- [ ] **Step 2: TypeScript check**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: zero errors in `src/` files.

- [ ] **Step 3: Run all tests**

```bash
cd apps/api && DATABASE_URL=postgres://localhost:5432/pjdrive S3_ENDPOINT=http://localhost:9002 npx vitest run
```

Expected: all 24 tests across 5 files PASS.

- [ ] **Step 4: Add codegen script note to README (optional)**

Add a note to `apps/api/package.json` scripts reminder:
```json
"codegen": "pgtyped -c pgtyped.config.json"
```

Confirm the script exists and remind that codegen must be re-run after any `.sql` file change:
```bash
DATABASE_URL=postgres://localhost:5432/pjdrive npm run codegen --prefix apps/api
```
