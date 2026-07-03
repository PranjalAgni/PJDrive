# Plan B — Trash

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace permanent delete with soft-delete. `DELETE /files/:id` and `DELETE /folders/:id` move items to Trash (`trashed_at = NOW()`). Add a Trash view with restore, permanent delete, and empty-trash, plus a 30-day auto-purge job.

**Spec:** `docs/superpowers/specs/2026-07-03-folders-trash-search-design.md` §4

**Architecture:** `trashed_at TIMESTAMPTZ` on `files` and `folders`. All active-listing queries gain `AND trashed_at IS NULL`. Folder trash cascades the same `trashed_at` to descendants. Permanent delete (S3 object + sync-log `deleted` event) moves to `DELETE /trash/...`. A `purgeTrash()` function runs on a 6-hour interval and is also runnable standalone.

**Tech Stack:** Express, pgtyped, PostgreSQL, S3/MinIO, React

**Prerequisites:** Plan A (Folders) complete and committed. Full API suite green.

---

## File Structure

```
apps/api/migrations/
├── 007_add_trashed_at_files.sql     ← NEW
└── 008_add_trashed_at_folders.sql   ← NEW

apps/api/src/routes/
├── trash.sql / .queries.ts / .ts / .test.ts   ← NEW
├── files.sql / .ts                  ← MODIFY: delete → soft-delete; listings exclude trashed
├── folders.sql / .ts                ← MODIFY: soft-delete cascade; listings exclude trashed
└── sharedWithMe.sql                 ← MODIFY: exclude trashed files

apps/api/src/
├── purge.ts                         ← NEW: purgeTrash() + standalone entry
├── index.ts                         ← MODIFY: register /trash, start purge interval
└── storage.ts                       ← (unchanged; reuse DeleteObjectCommand pattern)

apps/web/src/
├── pages/Trash.tsx                  ← NEW
├── pages/Dashboard.tsx              ← MODIFY: "Move to Trash" wording, Trash link
├── App.tsx                          ← MODIFY: /trash route
└── components/FileList.tsx          ← MODIFY: delete label
```

---

### Task 1: Migrations — trashed_at columns

- [ ] **Step 1:** Create `apps/api/migrations/007_add_trashed_at_files.sql`

```sql
ALTER TABLE files ADD COLUMN trashed_at TIMESTAMPTZ;
CREATE INDEX idx_files_owner_trashed ON files(owner_id, trashed_at);
```

- [ ] **Step 2:** Create `apps/api/migrations/008_add_trashed_at_folders.sql`

```sql
ALTER TABLE folders ADD COLUMN trashed_at TIMESTAMPTZ;
CREATE INDEX idx_folders_owner_trashed ON folders(owner_id, trashed_at);
```

- [ ] **Step 3:** Run migrations.

```bash
cd /Users/pranjal.agnihotri/coding/aiexperiments/pjdrive
DATABASE_URL=postgres://localhost:5432/pjdrive npx tsx apps/api/src/migrate.ts
```

Verify both columns exist via psql.

---

### Task 2: Exclude trashed rows from every active listing

**Files:** `apps/api/src/routes/files.sql`, `folders.sql`, `sharedWithMe.sql`, plus `stats.sql` (count should exclude trashed).

- [ ] **Step 1:** Add `AND trashed_at IS NULL` (or `f.trashed_at IS NULL` when aliased) to:
  - `files.sql`: `ListFilesByOwner`, `GetFileByIdAndOwner`, `GetFileByIdWithAccess`, `GetFileStorageKeyWithAccess`, `GetFileStorageKey`.
  - `folders.sql`: `GetFolderByIdAndOwner`, `ListSubfolders`, `ListAllFoldersByOwner`, `ListFilesInFolder`, `GetBreadcrumb` (base case), `GetDescendantFolderIds` (so trashed subtrees aren't re-walked on active ops).
  - `sharedWithMe.sql`: `GetSharedWithMe` → add `AND f.trashed_at IS NULL`.
  - `stats.sql`: `GetUserStats` → add `AND trashed_at IS NULL`.

> Do NOT add the filter to the trash-listing or permanent-delete queries (Task 3) or to storage-key lookups used by permanent delete.

- [ ] **Step 2:** Regenerate types.

```bash
cd apps/api && DATABASE_URL=postgres://localhost:5432/pjdrive npx pgtyped -c pgtyped.config.json
```

- [ ] **Step 3:** Run full suite — expect green (no behavior change yet, nothing is trashed).

---

### Task 3: trash.sql queries

**Files:** Create `apps/api/src/routes/trash.sql`

- [ ] **Step 1:** Write the queries.

```sql
/* @name SoftDeleteFile */
UPDATE files SET trashed_at = NOW()
WHERE id = :fileId AND owner_id = :ownerId AND trashed_at IS NULL
RETURNING id;

/* @name TrashFolderSubtreeFolders */
WITH RECURSIVE subtree AS (
  SELECT id FROM folders WHERE id = :folderId AND owner_id = :ownerId
  UNION ALL
  SELECT f.id FROM folders f JOIN subtree s ON f.parent_id = s.id
)
UPDATE folders SET trashed_at = :trashedAt
WHERE id IN (SELECT id FROM subtree) AND trashed_at IS NULL;

/* @name TrashFolderSubtreeFiles */
WITH RECURSIVE subtree AS (
  SELECT id FROM folders WHERE id = :folderId AND owner_id = :ownerId
  UNION ALL
  SELECT f.id FROM folders f JOIN subtree s ON f.parent_id = s.id
)
UPDATE files SET trashed_at = :trashedAt
WHERE folder_id IN (SELECT id FROM subtree) AND trashed_at IS NULL;

/* @name ListTrashedFiles */
SELECT id, name, mime_type, size_bytes, folder_id, trashed_at, created_at
FROM files
WHERE owner_id = :ownerId AND trashed_at IS NOT NULL
ORDER BY trashed_at DESC;

/* @name ListTrashedFolders */
SELECT id, parent_id, name, trashed_at, created_at
FROM folders
WHERE owner_id = :ownerId AND trashed_at IS NOT NULL
ORDER BY trashed_at DESC;

/* @name RestoreFile */
UPDATE files SET trashed_at = NULL
WHERE id = :fileId AND owner_id = :ownerId
RETURNING id, folder_id;

/* @name RestoreFolderGroup */
/* restores the folder plus descendants sharing its trashed_at */
UPDATE folders SET trashed_at = NULL
WHERE owner_id = :ownerId
  AND trashed_at = (SELECT trashed_at FROM folders WHERE id = :folderId AND owner_id = :ownerId)
  AND id IN (
    WITH RECURSIVE subtree AS (
      SELECT id FROM folders WHERE id = :folderId AND owner_id = :ownerId
      UNION ALL
      SELECT f.id FROM folders f JOIN subtree s ON f.parent_id = s.id
    )
    SELECT id FROM subtree
  );

/* @name RestoreFolderGroupFiles */
UPDATE files SET trashed_at = NULL
WHERE owner_id = :ownerId
  AND folder_id IN (
    WITH RECURSIVE subtree AS (
      SELECT id FROM folders WHERE id = :folderId AND owner_id = :ownerId
      UNION ALL
      SELECT f.id FROM folders f JOIN subtree s ON f.parent_id = s.id
    )
    SELECT id FROM subtree
  )
  AND trashed_at = (SELECT trashed_at FROM folders WHERE id = :folderId AND owner_id = :ownerId);

/* @name DetachRestoredFolderIfParentTrashed */
/* if the restored folder's parent is (still) trashed, move it to root */
UPDATE folders SET parent_id = NULL
WHERE id = :folderId AND owner_id = :ownerId
  AND parent_id IN (SELECT id FROM folders WHERE trashed_at IS NOT NULL);

/* @name GetTrashedFileStorageKey */
SELECT storage_key FROM files
WHERE id = :fileId AND owner_id = :ownerId AND trashed_at IS NOT NULL;

/* @name HardDeleteFile */
DELETE FROM files WHERE id = :fileId AND owner_id = :ownerId AND trashed_at IS NOT NULL;

/* @name HardDeleteFolder */
DELETE FROM folders WHERE id = :folderId AND owner_id = :ownerId AND trashed_at IS NOT NULL;

/* @name InsertSyncLogDeleted */
INSERT INTO sync_log (user_id, file_id, event_type) VALUES (:userId, :fileId, 'deleted');

/* @name ListAllTrashedFileKeys */
/* for empty-trash and purge: storage keys to remove from S3 */
SELECT id, storage_key FROM files
WHERE owner_id = :ownerId AND trashed_at IS NOT NULL;

/* @name EmptyTrashFiles */
DELETE FROM files WHERE owner_id = :ownerId AND trashed_at IS NOT NULL;

/* @name EmptyTrashFolders */
DELETE FROM folders WHERE owner_id = :ownerId AND trashed_at IS NOT NULL;

/* @name SelectPurgeableFileKeys */
SELECT id, storage_key FROM files
WHERE trashed_at IS NOT NULL AND trashed_at < NOW() - INTERVAL '30 days';

/* @name PurgeFiles */
DELETE FROM files WHERE trashed_at IS NOT NULL AND trashed_at < NOW() - INTERVAL '30 days';

/* @name PurgeFolders */
DELETE FROM folders WHERE trashed_at IS NOT NULL AND trashed_at < NOW() - INTERVAL '30 days';
```

> `RestoreFile` returns `folder_id`; the handler checks whether that folder is trashed and, if so, nulls the file's folder_id (restore-to-root). See Task 5.

- [ ] **Step 2:** Regenerate types. Verify `.queries.ts` created.

---

### Task 4: Rewrite file & folder delete as soft-delete

**Files:** `apps/api/src/routes/files.ts`, `folders.ts`

- [ ] **Step 1:** In `files.ts`, replace the `DELETE /:id` body. It no longer touches S3 or writes a sync-log `deleted` event — it just soft-deletes.

```typescript
import { softDeleteFile } from './trash.queries';

filesRouter.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await softDeleteFile.run({ fileId: req.params.id, ownerId: req.userId! }, pool);
    if (rows.length === 0) return res.status(404).json({ error: 'file not found' });
    return res.status(204).send();
  } catch (err) {
    console.error('files trash error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});
```

> Remove now-unused imports (`DeleteObjectCommand`, `getFileStorageKeyForDelete`, `insertSyncLogDeleted`) from `files.ts` if nothing else uses them — they move to `trash.ts`.

- [ ] **Step 2:** In `folders.ts`, replace `DELETE /:id` to soft-delete + cascade. Ownership-check first, then trash subtree folders and files with a single shared timestamp inside a transaction.

```typescript
import { trashFolderSubtreeFolders, trashFolderSubtreeFiles } from './trash.queries';

foldersRouter.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const own = await getFolderByIdAndOwner.run({ folderId: req.params.id, ownerId: req.userId! }, pool);
    if (own.length === 0) return res.status(404).json({ error: 'folder not found' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const now = (await client.query('SELECT NOW() AS now')).rows[0].now;
      await trashFolderSubtreeFolders.run({ folderId: req.params.id, ownerId: req.userId!, trashedAt: now }, client);
      await trashFolderSubtreeFiles.run({ folderId: req.params.id, ownerId: req.userId!, trashedAt: now }, client);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    return res.status(204).send();
  } catch (err) {
    console.error('folder trash error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});
```

> Remove the old `deleteFolderCascade` usage (query can stay unused or be dropped).

---

### Task 5: trash.ts router (TDD)

**Files:** Create `apps/api/src/routes/trash.ts`, `trash.test.ts`; modify `index.ts`

- [ ] **Step 1: Write failing tests** covering:
  - Delete a file → gone from `GET /files`, present in `GET /trash`.
  - Restore → back in `GET /files`.
  - Permanent delete → gone from `GET /trash`, S3 delete attempted (mock or assert 204).
  - Trash a folder → its files disappear from listings and appear in `/trash`.
  - Restore a folder whose parent is trashed → folder restored to root (`parent_id` null).
  - Empty trash → `/trash` empty.
  - **Regression:** trashed files never appear in `GET /files` or folder listings.
  - Isolation: can't restore/delete another user's trashed item → 404.

Run — expect FAIL.

- [ ] **Step 2: Implement `trash.ts`**

```typescript
import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { s3, BUCKET } from '../storage';
import { broadcastSyncEvent } from './sync';
import {
  listTrashedFiles, listTrashedFolders,
  restoreFile, restoreFolderGroup, restoreFolderGroupFiles, detachRestoredFolderIfParentTrashed,
  getTrashedFileStorageKey, hardDeleteFile, hardDeleteFolder, insertSyncLogDeleted,
  listAllTrashedFileKeys, emptyTrashFiles, emptyTrashFolders,
} from './trash.queries';

export const trashRouter = Router();

// GET /trash
trashRouter.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const files = await listTrashedFiles.run({ ownerId: req.userId! }, pool);
    const folders = await listTrashedFolders.run({ ownerId: req.userId! }, pool);
    return res.json({ files, folders });
  } catch (err) {
    console.error('trash list error:', err); return res.status(500).json({ error: 'internal server error' });
  }
});

// POST /trash/:type/:id/restore
trashRouter.post('/:type/:id/restore', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.params.type === 'files') {
      const rows = await restoreFile.run({ fileId: req.params.id, ownerId: req.userId! }, pool);
      if (rows.length === 0) return res.status(404).json({ error: 'not found' });
      // if the file's folder is trashed, move it to root
      // (simplest: null it out when the folder is not in active set — handle via a small check)
      return res.json({ restored: rows[0].id });
    }
    if (req.params.type === 'folders') {
      await restoreFolderGroup.run({ folderId: req.params.id, ownerId: req.userId! }, pool);
      await restoreFolderGroupFiles.run({ folderId: req.params.id, ownerId: req.userId! }, pool);
      await detachRestoredFolderIfParentTrashed.run({ folderId: req.params.id, ownerId: req.userId! }, pool);
      return res.json({ restored: req.params.id });
    }
    return res.status(400).json({ error: 'invalid type' });
  } catch (err) {
    console.error('trash restore error:', err); return res.status(500).json({ error: 'internal server error' });
  }
});

// DELETE /trash/:type/:id  (permanent)
trashRouter.delete('/:type/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.params.type === 'files') {
      const keys = await getTrashedFileStorageKey.run({ fileId: req.params.id, ownerId: req.userId! }, pool);
      if (keys.length === 0) return res.status(404).json({ error: 'not found' });
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await insertSyncLogDeleted.run({ userId: req.userId!, fileId: req.params.id }, client);
        await hardDeleteFile.run({ fileId: req.params.id, ownerId: req.userId! }, client);
        await client.query('COMMIT');
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
      broadcastSyncEvent(req.userId!, { fileId: req.params.id, eventType: 'deleted' });
      try { await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: keys[0].storage_key })); }
      catch (s3Err) { console.error('trash permanent-delete S3 error (DB committed):', s3Err); }
      return res.status(204).send();
    }
    if (req.params.type === 'folders') {
      await hardDeleteFolder.run({ folderId: req.params.id, ownerId: req.userId! }, pool);
      return res.status(204).send();
    }
    return res.status(400).json({ error: 'invalid type' });
  } catch (err) {
    console.error('trash delete error:', err); return res.status(500).json({ error: 'internal server error' });
  }
});

// DELETE /trash  (empty)
trashRouter.delete('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const keys = await listAllTrashedFileKeys.run({ ownerId: req.userId! }, pool);
    await emptyTrashFiles.run({ ownerId: req.userId! }, pool);
    await emptyTrashFolders.run({ ownerId: req.userId! }, pool);
    for (const k of keys) {
      try { await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: k.storage_key })); }
      catch (e) { console.error('empty-trash S3 error:', e); }
    }
    return res.status(204).send();
  } catch (err) {
    console.error('empty trash error:', err); return res.status(500).json({ error: 'internal server error' });
  }
});
```

> **Restore-to-root for files:** the simplest correct implementation is a dedicated query `RestoreFileToRootIfParentTrashed` that, after clearing `trashed_at`, sets `folder_id = NULL` when the parent folder is trashed. Add it to `trash.sql` and call it after `restoreFile`. Mirror the folder detach logic.

- [ ] **Step 2b:** Add to `trash.sql` and use in the files-restore branch:

```sql
/* @name DetachRestoredFileIfFolderTrashed */
UPDATE files SET folder_id = NULL
WHERE id = :fileId AND owner_id = :ownerId
  AND folder_id IN (SELECT id FROM folders WHERE trashed_at IS NOT NULL);
```

- [ ] **Step 3:** Register `app.use('/trash', trashRouter);` in `index.ts`. Mount **before** `/files` if any path overlap risk (there isn't — different prefix). Run trash tests — expect PASS. Regenerate types first if you added the detach query.

---

### Task 6: Auto-purge job

**Files:** Create `apps/api/src/purge.ts`; modify `index.ts`

- [ ] **Step 1: Implement `purge.ts`**

```typescript
import { pool } from './db';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { s3, BUCKET } from './storage';
import { selectPurgeableFileKeys, purgeFiles, purgeFolders } from './routes/trash.queries';

export async function purgeTrash(): Promise<{ files: number; folders: number }> {
  const keys = await selectPurgeableFileKeys.run(undefined, pool);
  // delete S3 objects first (tolerate individual failures)
  for (const k of keys) {
    try { await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: k.storage_key })); }
    catch (e) { console.error('purge S3 error:', e); }
  }
  await purgeFiles.run(undefined, pool);
  await purgeFolders.run(undefined, pool);
  return { files: keys.length, folders: -1 };
}

if (require.main === module) {
  purgeTrash()
    .then((r) => { console.log('purged', r); return pool.end(); })
    .catch((e) => { console.error(e); process.exit(1); });
}
```

> `selectPurgeableFileKeys`/`purgeFiles`/`purgeFolders` take no params — pass `undefined` as pgtyped params. Confirm the generated signature accepts that; if pgtyped generates `{}`, pass `{}`.

- [ ] **Step 2: Start interval in `index.ts`** (only when run as server):

```typescript
import { purgeTrash } from './purge';
// inside the require.main === module block, after app.listen:
setInterval(() => { purgeTrash().catch((e) => console.error('purge interval error:', e)); }, 6 * 60 * 60 * 1000);
```

- [ ] **Step 3: Test purge** — add a case in `trash.test.ts` that inserts a file with `trashed_at = NOW() - INTERVAL '31 days'`, calls `purgeTrash()`, and asserts the row is gone. (S3 delete will fail against a non-existent key — that's tolerated and logged.)

---

### Task 7: Web — Trash page

**Files:** Create `apps/web/src/pages/Trash.tsx`; modify `App.tsx`, `Dashboard.tsx`, `FileList.tsx`

- [ ] **Step 1:** Add `/trash` route in `App.tsx` and a **Trash** link in the Dashboard header (next to "Shared with me").

- [ ] **Step 2:** `Trash.tsx` — `GET /trash`, render trashed folders + files with **Restore** (`POST /trash/:type/:id/restore`) and **Delete forever** (`DELETE /trash/:type/:id`, keep `confirm()`), plus **Empty Trash** button (`DELETE /trash`, `confirm()`). Refresh list after each action.

- [ ] **Step 3:** In `FileList.tsx`, change the file/folder delete button label to **"Move to Trash"** and drop the destructive `confirm()` (it's recoverable now). Deleting still calls `DELETE /files/:id` / `DELETE /folders/:id`.

- [ ] **Step 4: Manual verification**
  - Delete a file → gone from Dashboard, appears in Trash.
  - Restore → back on Dashboard.
  - Trash a folder with files → all vanish from Dashboard, appear in Trash; restore brings them back.
  - Delete forever → gone from Trash; re-check it's not in `GET /files`.
  - Empty Trash → Trash empty.

---

### Task 8: Full suite + commit

- [ ] **Step 1:** Run full API suite — all green (existing + Plan A + trash tests).

```bash
cd apps/api && DATABASE_URL=postgres://localhost:5432/pjdrive S3_ENDPOINT=http://localhost:9002 npx vitest run
```

- [ ] **Step 2:** Commit SQL + generated queries + web together.

```bash
git add apps/api apps/web
git commit -m "feat: add Trash (soft-delete, restore, permanent delete, 30-day purge)"
```
