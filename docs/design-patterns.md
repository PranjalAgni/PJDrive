# Design Patterns in PJDrive

This document walks through the design patterns used in this codebase. Each pattern includes a brief explanation of what it is, why it was chosen here, and the exact code where you can see it.

---

## 1. Middleware Chain (Chain of Responsibility)

**What it is:** A request passes through a series of handlers in sequence. Each handler either processes the request, rejects it, or passes it forward. No handler needs to know about the others.

**Where it appears:**

```
POST /files/:id/share
  → requireAuth          — check JWT, attach userId
  → sharingRouter handler — check ownership, insert share
```

The `requireAuth` middleware in `apps/api/src/middleware/auth.ts` runs first. If the token is missing or invalid it returns 401 and the chain stops. If it passes, it attaches `req.userId` and calls `next()`. The route handler then runs with a guaranteed `req.userId`.

```typescript
// apps/api/src/middleware/auth.ts
export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'unauthorized' });

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string; email: string };
    req.userId = payload.userId;
    req.userEmail = payload.email;
    next();           // pass to next handler
  } catch {
    return res.status(401).json({ error: 'invalid token' });
  }
}
```

**Why:** Each concern (auth, authorization, business logic) stays in its own layer. Adding rate limiting or logging is one more `app.use()` — nothing else changes.

---

## 2. Middleware Factory (Higher-Order Function)

**What it is:** A function that takes configuration and returns a middleware function. The returned function has the configuration baked in via closure.

**Where it appears:** `requireFileAccess` in `apps/api/src/middleware/fileAccess.ts`

```typescript
// apps/api/src/middleware/fileAccess.ts
export function requireFileAccess(minRole: Role) {       // factory
  return async (req: AuthRequest, res: Response, next: NextFunction) => {   // middleware
    // minRole is captured from the outer call
    if (meetsMinRole(actualRole, minRole)) {
      req.fileRole = actualRole;
      return next();
    }
    return res.status(403).json({ error: 'insufficient permissions' });
  };
}
```

Usage at route definition:

```typescript
router.get('/:id', requireAuth, requireFileAccess('viewer'), handler);
router.put('/:id', requireAuth, requireFileAccess('editor'), handler);
```

**Why:** The same middleware logic works for any minimum role. Without this pattern you'd write separate `requireViewer`, `requireEditor`, `requireOwner` functions that are 95% identical.

---

## 3. Facade Pattern

**What it is:** A simple interface that hides a complex subsystem. Callers work with the facade and never know (or care) about the subsystem details.

**Where it appears:** `apps/api/src/storage.ts`

The AWS S3 SDK has a verbose command-based API. The facade wraps it in four plain functions:

```typescript
// apps/api/src/storage.ts

// What callers see:
export async function initiateMultipart(key: string): Promise<string>
export async function presignChunkUpload(key, uploadId, partNumber): Promise<string>
export async function completeMultipart(key, uploadId, parts): Promise<void>
export async function presignDownload(key, expiresIn?): Promise<string>

// What's hidden:
// new S3Client({ endpoint, credentials, forcePathStyle, region })
// new CreateMultipartUploadCommand({ Bucket, Key })
// getSignedUrl(s3, cmd, { expiresIn })
// etc.
```

A route handler does:

```typescript
const s3UploadId = await initiateMultipart(storageKey);
const url = await presignChunkUpload(storageKey, s3UploadId, i);
```

Not this:

```typescript
const cmd = new CreateMultipartUploadCommand({ Bucket: BUCKET, Key: storageKey });
const res = await s3.send(cmd);
const uploadId = res.UploadId!;
```

**Why:** If S3 is replaced with GCS or Azure Blob tomorrow, only `storage.ts` changes. Every route stays the same.

---

## 4. Observer Pattern (Server-Sent Events)

**What it is:** A subject maintains a list of observers and notifies them when state changes. Observers subscribe and unsubscribe dynamically.

**Where it appears:** `apps/api/src/routes/sync.ts`

The `clients` map is the subscriber registry. `broadcastSyncEvent` is the notify function. Each SSE connection registers itself on connect and removes itself on disconnect.

```typescript
// apps/api/src/routes/sync.ts

// Registry: userId → set of SSE response streams
const clients = new Map<string, Set<Response>>();

// Subscribe — called when a client opens the SSE connection
syncRouter.get('/events', requireAuth, (req: AuthRequest, res) => {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId)!.add(res);       // register

  req.on('close', () => {
    clients.get(userId)?.delete(res);  // unregister on disconnect
  });
});

// Notify — called whenever a file changes
export function broadcastSyncEvent(userId: string, event: { fileId: string; eventType: string }) {
  const userClients = clients.get(userId);
  if (!userClients) return;
  userClients.forEach((res) => {
    try { res.write(`data: ${JSON.stringify(event)}\n\n`); }
    catch { dead.push(res); }
  });
}
```

Then in the upload route, after saving to the database:

```typescript
// apps/api/src/routes/upload.ts
await insertSyncLogCreated.run({ userId: req.userId!, fileId: upload.file_id }, pool);
broadcastSyncEvent(req.userId!, { fileId: upload.file_id, eventType: 'created' });
```

**Why:** The upload route doesn't need to know who's connected. It just fires an event. The SSE handler doesn't need to know what triggers events. They're fully decoupled.

---

## 5. Strategy Pattern

**What it is:** Define a family of interchangeable behaviors, encapsulate each one, and make them swappable at runtime. The caller decides which strategy to use without changing the code that runs it.

**Where it appears:** The sync client's connection strategy in `apps/sync/src/index.ts`

Two strategies for receiving remote changes:
- **SSE** (primary) — real-time push
- **Polling** (fallback) — periodic pull

```typescript
// apps/sync/src/index.ts

let pollInterval: ReturnType<typeof setInterval> | null = null;

function connectSSE() {
  const es = new EventSource(url, { headers: { Authorization: `Bearer ${TOKEN}` } });

  es.onopen = () => {
    // Switch to SSE strategy — stop polling
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  };

  es.onerror = () => {
    es.close();
    // Switch to poll strategy — SSE unavailable
    if (!pollInterval) {
      pollInterval = setInterval(poll, POLL_INTERVAL_MS);
    }
    setTimeout(connectSSE, 5000);  // try SSE again later
  };
}
```

The `processSyncEvent` function is the same regardless of which strategy delivered the event:

```typescript
async function processSyncEvent(event: { file_id: string; event_type: string }) {
  if (event.event_type === 'created' || event.event_type === 'updated') {
    await downloadFile(event.file_id);
  } else if (event.event_type === 'deleted') {
    await deleteLocalFile(event.file_id);
  }
}
```

**Why:** The processing logic doesn't care how events arrive. Switching strategies (e.g. replacing polling with WebSockets) only touches the transport code.

---

## 6. Repository Pattern (via pgtyped)

**What it is:** Separate data access logic from business logic. The repository is the only place that knows SQL; everything else works with plain objects.

**Where it appears:** Every route file alongside its `.sql` file.

```
apps/api/src/routes/
  auth.ts          ← business logic
  auth.sql         ← SQL repository
  auth.queries.ts  ← generated typed functions (don't edit)
```

`auth.sql` — the repository:

```sql
/* @name GetUserByEmail */
SELECT id, email, password_hash
FROM users
WHERE email = :email;
```

`auth.ts` — business logic, no SQL:

```typescript
// apps/api/src/routes/auth.ts
const rows = await getUserByEmail.run({ email: normalizedEmail }, pool);
if (rows.length === 0) return res.status(401).json({ error: 'invalid credentials' });
const user = rows[0];
const valid = await bcrypt.compare(password, user.password_hash);
```

The route handler doesn't know what database is behind `getUserByEmail`. It just gets typed rows back.

**Why:** If the query changes (new index, different join) the route handler doesn't change. If business logic changes (e.g. add rate limiting) the SQL doesn't change.

---

## 7. Debounce Pattern

**What it is:** Delay execution until a burst of events settles. Each new event resets the timer. The action only runs once after the last event.

**Where it appears:** `apps/sync/src/watcher.ts`

```typescript
// apps/sync/src/watcher.ts
const DEBOUNCE_MS = 500;
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleUpload(filePath: string) {
  const existing = debounceTimers.get(filePath);
  if (existing) clearTimeout(existing);   // cancel previous timer

  const timer = setTimeout(async () => {
    debounceTimers.delete(filePath);
    // only runs 500ms after the last change event for this file
    const checksum = computeChecksum(filePath);
    const cached = getChecksum(filePath);
    if (checksum === cached) return;  // content didn't actually change

    await uploadFile(filePath, fileName);
  }, DEBOUNCE_MS);

  debounceTimers.set(filePath, timer);
}

watcher.on('change', (filePath) => scheduleUpload(filePath));
```

**Why:** Saving a file triggers dozens of filesystem events in quick succession. Without debouncing, each keystroke in a text editor would queue an upload. With 500ms debounce, only the final saved state is uploaded.

---

## 8. Idempotency Key Pattern

**What it is:** Give each operation a unique ID. If the operation is retried, the server can detect the duplicate and return the existing result instead of performing the operation twice.

**Where it appears:** The chunked upload flow in `apps/api/src/routes/upload.ts`

The `uploads` table stores the in-progress state of every multipart upload:

```sql
-- apps/api/migrations/003_create_uploads.sql
CREATE TABLE uploads (
  id              UUID PRIMARY KEY,
  file_id         UUID,
  upload_id       VARCHAR(500),   -- S3 multipart upload ID
  total_chunks    INT,
  uploaded_chunks JSONB DEFAULT '[]',
  status          VARCHAR(20) DEFAULT 'in_progress'
);
```

On the client, before uploading chunks, the status is checked:

```typescript
// apps/web/src/lib/upload.ts
const statusRes = await apiClient.get(`/upload/status/${uploadId}`);
const alreadyUploadedParts = (statusRes.data.uploadedChunks || [])
  .filter((e: string) => e.includes(':'))
  .map((e: string) => {
    const [num, ...eTagParts] = e.split(':');
    return { partNumber: parseInt(num, 10), eTag: eTagParts.join(':') };
  });

// Seed parts with already-completed chunks
const parts = [...alreadyUploadedParts];

// Skip chunks that are already uploaded
if (alreadyUploadedNumbers.includes(partNumber)) return null;
```

**Why:** A 50GB upload interrupted at 90% should resume from 90%, not restart. The upload ID is the idempotency key — the server tracks exactly which chunks succeeded.

---

## 9. Singleton Pattern

**What it is:** A class or module that is instantiated exactly once and shared across the entire application.

**Where it appears:** `apps/api/src/db.ts` and `apps/api/src/storage.ts`

```typescript
// apps/api/src/db.ts
import { Pool } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
```

```typescript
// apps/api/src/storage.ts
export const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
  credentials: { ... },
  forcePathStyle: true,
});
```

Every route imports and reuses the same `pool` and `s3` instances:

```typescript
import { pool } from '../db';
import { s3 } from '../storage';
```

**Why:** Database and S3 connections are expensive to create. A connection pool manages a fixed number of live connections and hands them out to requests. Creating a new pool per request would exhaust connections within seconds under any real load.

---

## 10. Guard Clause Pattern

**What it is:** Exit a function early when a precondition fails, instead of nesting the happy path inside `if` blocks.

**Where it appears:** Throughout every route handler.

Without guard clauses (nested):

```typescript
// hard to follow, deeply nested
async function handler(req, res) {
  if (email && password) {
    if (password.length >= 8) {
      const rows = await getUser(email);
      if (rows.length > 0) {
        const valid = await bcrypt.compare(password, rows[0].hash);
        if (valid) {
          return res.json({ token: sign(rows[0]) });
        } else {
          return res.status(401).json({ error: 'invalid credentials' });
        }
      } else {
        return res.status(401).json({ error: 'invalid credentials' });
      }
    } else {
      return res.status(400).json({ error: 'password too short' });
    }
  } else {
    return res.status(400).json({ error: 'required fields missing' });
  }
}
```

With guard clauses (flat):

```typescript
// apps/api/src/routes/auth.ts
authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  if (password.length < 8)  return res.status(400).json({ error: 'password must be at least 8 characters' });

  const rows = await getUserByEmail.run({ email: normalizedEmail }, pool);
  if (rows.length === 0)    return res.status(401).json({ error: 'invalid credentials' });

  const valid = await bcrypt.compare(password, rows[0].password_hash);
  if (!valid)               return res.status(401).json({ error: 'invalid credentials' });

  // happy path — reached only if all guards passed
  const token = jwt.sign({ userId: rows[0].id }, JWT_SECRET, { expiresIn: '7d' });
  return res.status(200).json({ token });
});
```

**Why:** Each guard clause is one concern. Readers scan down the left margin for the early exits and only reach the happy path code once they've confirmed everything is valid.

---

## 11. Transactional Outbox Pattern (simplified)

**What it is:** When you need two things to happen atomically — a database write and a side effect — do the DB write first inside a transaction, and trigger the side effect only after the transaction commits.

**Where it appears:** `apps/api/src/routes/trash.ts` permanent-delete handler

`DELETE /files/:id` is now a soft delete (it just sets `trashed_at`). The transactional outbox lives in the Trash permanent-delete path, where the row is actually removed and the S3 object is freed:

```typescript
// apps/api/src/routes/trash.ts
const client = await pool.connect();
try {
  await client.query('BEGIN');

  // 1. Write to DB inside transaction
  await insertSyncLogDeleted.run({ userId: req.userId!, fileId: req.params.id }, client);
  await hardDeleteFile.run({ fileId: req.params.id, ownerId: req.userId! }, client);

  await client.query('COMMIT');
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  client.release();
}

// 2. Side effects AFTER commit — only if transaction succeeded
broadcastSyncEvent(req.userId!, { fileId: req.params.id, eventType: 'deleted' });

try {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: keys[0].storage_key }));
} catch (s3Err) {
  // S3 failure logged but DB is already consistent — file row is gone
  console.error('trash permanent-delete S3 error (DB committed):', s3Err);
}
```

The `sync_log` INSERT happens before the hard `DELETE` (FK constraint requires the file row to exist at commit). The SSE broadcast and S3 deletion happen after `COMMIT`, so they only fire if the database transaction succeeded.

**Why:** If the transaction rolls back (DB error), the SSE broadcast and S3 deletion never happen. The system stays consistent — no phantom "deleted" events for files that weren't actually deleted.

---

## 12. Content Addressable Storage

**What it is:** Files are identified by their content (a hash of the bytes) rather than an arbitrary name or ID. The same content always has the same hash, so uploads can be deduplicated and sync can detect actual changes.

**Where it appears:** SHA-256 checksums computed before every upload.

On the browser side (`apps/web/src/lib/chunker.ts`):

```typescript
export async function computeChecksum(file: File): Promise<string> {
  const hasher = CryptoJS.algo.SHA256.create();
  let offset = 0;
  while (offset < file.size) {
    const chunk = file.slice(offset, offset + CHUNK_SIZE);
    const buffer = await chunk.arrayBuffer();
    const wordArray = CryptoJS.lib.WordArray.create(buffer as ArrayBuffer);
    hasher.update(wordArray);
    offset += CHUNK_SIZE;
  }
  return hasher.finalize().toString();
}
```

On the sync client (`apps/sync/src/watcher.ts`):

```typescript
const checksum = computeChecksum(filePath);
const cached = getChecksum(filePath);
if (checksum === cached) return;  // content unchanged — skip upload
```

The checksum is stored alongside the file in the `files` table and in the sync client's local state file (`.sync-state.json`).

**Why:** Comparing checksums prevents uploading a file when only its metadata (timestamps, permissions) changed. It also enables resumable uploads — the server can verify the upload completed with the right bytes.
