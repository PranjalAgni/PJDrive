# Plan A — Folders

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a nested folder hierarchy. Files live in a folder (`folder_id NULL` = root). Users can create, rename, move, and delete folders, move files between folders, and navigate via breadcrumbs on the web.

**Spec:** `docs/superpowers/specs/2026-07-03-folders-trash-search-design.md` §3

**Architecture:** New `folders` table (single-parent tree) + `files.folder_id` column. New `/folders` API router with create/list/get/patch/delete, plus `PATCH /files/:id` for move+rename. Recursive CTEs compute breadcrumb (up) and cycle check (down). Web Dashboard becomes folder-aware with breadcrumb navigation, folder rows, New Folder button, and a Move modal.

**Tech Stack:** Express, pgtyped, PostgreSQL, React, Zustand, Axios

**Prerequisites:** All 27 API tests passing. MinIO + Postgres running.

---

## File Structure

```
apps/api/migrations/
└── 006_create_folders.sql        ← NEW: folders table + files.folder_id

apps/api/src/routes/
├── folders.sql                   ← NEW: pgtyped queries
├── folders.queries.ts            ← GENERATED
├── folders.ts                    ← NEW: /folders router
├── folders.test.ts               ← NEW
├── files.sql                     ← MODIFY: add folder_id to selects, add UpdateFile
├── files.queries.ts              ← GENERATED
└── files.ts                      ← MODIFY: add PATCH /:id (move/rename)

apps/api/src/routes/upload.sql    ← MODIFY: InsertFile takes folder_id
apps/api/src/routes/upload.ts     ← MODIFY: accept folderId
apps/api/src/schemas.ts           ← MODIFY: CreateFolderBody, UpdateFolderBody, UpdateFileBody, InitUploadBody += folderId
apps/api/src/index.ts             ← MODIFY: register /folders

packages/shared/src/types.ts      ← MODIFY: Folder interface, File.folder_id

apps/web/src/
├── api/client.ts                 ← (unchanged)
├── pages/Dashboard.tsx           ← MODIFY: folder state, breadcrumb, New Folder
├── components/FileList.tsx       ← MODIFY: render folders + files, Move action
├── components/Breadcrumb.tsx     ← NEW
├── components/NewFolderButton.tsx← NEW
└── components/MoveModal.tsx      ← NEW
```

---

### Task 1: Migration — folders table + files.folder_id

**Files:** Create `apps/api/migrations/006_create_folders.sql`

- [ ] **Step 1: Write the migration**

```sql
CREATE TABLE folders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id   UUID REFERENCES folders(id) ON DELETE CASCADE,
  name        VARCHAR(500) NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_folders_owner ON folders(owner_id);
CREATE INDEX idx_folders_parent ON folders(parent_id);

ALTER TABLE files ADD COLUMN folder_id UUID REFERENCES folders(id) ON DELETE SET NULL;
CREATE INDEX idx_files_folder ON files(folder_id);
```

- [ ] **Step 2: Run migration**

```bash
cd /Users/pranjal.agnihotri/coding/aiexperiments/pjdrive
DATABASE_URL=postgres://localhost:5432/pjdrive npx tsx apps/api/src/migrate.ts
```

Expected: migration 006 applied. Verify with `psql postgres://localhost:5432/pjdrive -c "\d folders"` and `\d files` (folder_id present).

---

### Task 2: API — folders.sql queries

**Files:** Create `apps/api/src/routes/folders.sql`

- [ ] **Step 1: Write the queries**

```sql
/* @name InsertFolder */
INSERT INTO folders (owner_id, parent_id, name)
VALUES (:ownerId, :parentId, :name)
RETURNING id, owner_id, parent_id, name, created_at, updated_at;

/* @name GetFolderByIdAndOwner */
SELECT id, owner_id, parent_id, name, created_at, updated_at
FROM folders
WHERE id = :folderId AND owner_id = :ownerId;

/* @name ListSubfolders */
SELECT id, owner_id, parent_id, name, created_at, updated_at
FROM folders
WHERE owner_id = :ownerId
  AND parent_id IS NOT DISTINCT FROM :parentId
ORDER BY name ASC;

/* @name ListAllFoldersByOwner */
SELECT id, parent_id, name
FROM folders
WHERE owner_id = :ownerId
ORDER BY name ASC;

/* @name ListFilesInFolder */
SELECT id, name, mime_type, size_bytes, checksum, folder_id, created_at, updated_at
FROM files
WHERE owner_id = :ownerId
  AND folder_id IS NOT DISTINCT FROM :folderId
ORDER BY created_at DESC;

/* @name GetBreadcrumb */
WITH RECURSIVE crumb AS (
  SELECT id, parent_id, name, 0 AS depth
  FROM folders
  WHERE id = :folderId AND owner_id = :ownerId
  UNION ALL
  SELECT f.id, f.parent_id, f.name, c.depth + 1
  FROM folders f
  JOIN crumb c ON f.id = c.parent_id
)
SELECT id, name, depth FROM crumb ORDER BY depth DESC;

/* @name GetDescendantFolderIds */
WITH RECURSIVE subtree AS (
  SELECT id FROM folders WHERE id = :folderId AND owner_id = :ownerId
  UNION ALL
  SELECT f.id FROM folders f JOIN subtree s ON f.parent_id = s.id
)
SELECT id FROM subtree;

/* @name UpdateFolder */
UPDATE folders
SET name = COALESCE(:name, name),
    parent_id = CASE WHEN :setParent::boolean THEN :parentId ELSE parent_id END,
    updated_at = NOW()
WHERE id = :folderId AND owner_id = :ownerId
RETURNING id, owner_id, parent_id, name, created_at, updated_at;

/* @name DeleteFolderCascade */
DELETE FROM folders WHERE id = :folderId AND owner_id = :ownerId;
```

> Note: `IS NOT DISTINCT FROM` lets a single query match both `parent_id = <uuid>` and `parent_id IS NULL` when the param is null — cleaner than branching. Verify pgtyped infers the param as nullable; if it forces non-null, split into two named queries (`…RootLevel` vs `…InParent`).

- [ ] **Step 2: Regenerate types**

```bash
cd /Users/pranjal.agnihotri/coding/aiexperiments/pjdrive/apps/api
DATABASE_URL=postgres://localhost:5432/pjdrive npx pgtyped -c pgtyped.config.json
```

Expected: `folders.queries.ts` generated. If `IS NOT DISTINCT FROM` params come back non-nullable and break the null case, fall back to split queries and rerun.

---

### Task 3: API — schemas + shared types

**Files:** Modify `apps/api/src/schemas.ts`, `packages/shared/src/types.ts`

- [ ] **Step 1: Add Zod schemas to schemas.ts**

Add a Folders section:

```typescript
// ─── Folders ─────────────────────────────────────────────────────────────────

export const CreateFolderBody = z.object({
  name: z.string().min(1, { message: 'name required' }).max(500),
  parentId: z.string().uuid({ message: 'parentId must be a valid UUID' }).nullable().optional(),
});

export const UpdateFolderBody = z.object({
  name: z.string().min(1).max(500).optional(),
  parentId: z.string().uuid().nullable().optional(),
}).refine((b) => b.name !== undefined || b.parentId !== undefined, {
  message: 'name or parentId required',
});

export const UpdateFileBody = z.object({
  name: z.string().min(1).max(500).optional(),
  folderId: z.string().uuid().nullable().optional(),
}).refine((b) => b.name !== undefined || b.folderId !== undefined, {
  message: 'name or folderId required',
});

export type CreateFolderBodyType = z.infer<typeof CreateFolderBody>;
export type UpdateFolderBodyType = z.infer<typeof UpdateFolderBody>;
export type UpdateFileBodyType = z.infer<typeof UpdateFileBody>;
```

Also add `folderId` to `InitUploadBody`:

```typescript
  folderId: z.string().uuid().nullable().optional(),
```

- [ ] **Step 2: Update shared types**

In `packages/shared/src/types.ts` add:

```typescript
export interface Folder {
  id: string;
  owner_id: string;
  parent_id: string | null;
  name: string;
  created_at: string;
  updated_at: string;
}
```

And add `folder_id: string | null;` to the `File` interface.

---

### Task 4: API — folders router (TDD)

**Files:** Create `apps/api/src/routes/folders.ts`, `apps/api/src/routes/folders.test.ts`; modify `apps/api/src/index.ts`

- [ ] **Step 1: Write failing tests** — `apps/api/src/routes/folders.test.ts`

Cover: create root folder, create nested, `GET /folders/:id` returns breadcrumb + subfolders + files, rename, move, **reject cycle** (move parent into its own child → 400), delete moves contained files to root (folder_id NULL) and removes subfolders, another user's folder → 404. Use the auth/register + cleanup pattern from `stats.test.ts`. Register two users to test isolation.

Key cases:

```typescript
it('rejects moving a folder into its own descendant', async () => {
  // create A, then B inside A
  // PATCH /folders/A { parentId: B }  → 400
});

it('GET /folders/root returns root-level folders and files', async () => {
  const res = await request(app).get('/folders/root').set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(res.body.folder).toBeNull();
  expect(Array.isArray(res.body.subfolders)).toBe(true);
});
```

- [ ] **Step 2: Run tests — expect FAIL** (route not registered → 404).

```bash
cd apps/api && DATABASE_URL=postgres://localhost:5432/pjdrive npx vitest run src/routes/folders.test.ts
```

- [ ] **Step 3: Implement `folders.ts`**

```typescript
import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { parseBody, CreateFolderBody, UpdateFolderBody } from '../schemas';
import {
  insertFolder,
  getFolderByIdAndOwner,
  listSubfolders,
  listAllFoldersByOwner,
  listFilesInFolder,
  getBreadcrumb,
  getDescendantFolderIds,
  updateFolder,
  deleteFolderCascade,
} from './folders.queries';

export const foldersRouter = Router();

// POST /folders
foldersRouter.post('/', requireAuth, async (req: AuthRequest, res) => {
  const parsed = parseBody(CreateFolderBody, req.body, res);
  if (!parsed.ok) return;
  try {
    const rows = await insertFolder.run(
      { ownerId: req.userId!, parentId: parsed.data.parentId ?? null, name: parsed.data.name },
      pool
    );
    return res.status(201).json({ folder: rows[0] });
  } catch (err) {
    console.error('folder create error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

// GET /folders  (flat list for move picker)
foldersRouter.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await listAllFoldersByOwner.run({ ownerId: req.userId! }, pool);
    return res.json({ subfolders: rows });
  } catch (err) {
    console.error('folder list error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

// GET /folders/:id  (":id" may be "root")
foldersRouter.get('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const isRoot = req.params.id === 'root';
    const folderId = isRoot ? null : req.params.id;

    let folder = null;
    let breadcrumb: Array<{ id: string; name: string }> = [];
    if (!isRoot) {
      const f = await getFolderByIdAndOwner.run({ folderId: folderId!, ownerId: req.userId! }, pool);
      if (f.length === 0) return res.status(404).json({ error: 'folder not found' });
      folder = f[0];
      const crumb = await getBreadcrumb.run({ folderId: folderId!, ownerId: req.userId! }, pool);
      breadcrumb = crumb.map((c) => ({ id: c.id, name: c.name }));
    }

    const subfolders = await listSubfolders.run({ ownerId: req.userId!, parentId: folderId }, pool);
    const files = await listFilesInFolder.run({ ownerId: req.userId!, folderId }, pool);
    return res.json({ folder, breadcrumb, subfolders, files });
  } catch (err) {
    console.error('folder get error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

// PATCH /folders/:id  (rename and/or move)
foldersRouter.patch('/:id', requireAuth, async (req: AuthRequest, res) => {
  const parsed = parseBody(UpdateFolderBody, req.body, res);
  if (!parsed.ok) return;
  try {
    const own = await getFolderByIdAndOwner.run({ folderId: req.params.id, ownerId: req.userId! }, pool);
    if (own.length === 0) return res.status(404).json({ error: 'folder not found' });

    const setParent = parsed.data.parentId !== undefined;
    if (setParent && parsed.data.parentId) {
      if (parsed.data.parentId === req.params.id) {
        return res.status(400).json({ error: 'cannot move a folder into itself' });
      }
      const descendants = await getDescendantFolderIds.run(
        { folderId: req.params.id, ownerId: req.userId! }, pool
      );
      if (descendants.some((d) => d.id === parsed.data.parentId)) {
        return res.status(400).json({ error: 'cannot move a folder into its own subtree' });
      }
      // ensure target parent belongs to user
      const target = await getFolderByIdAndOwner.run(
        { folderId: parsed.data.parentId, ownerId: req.userId! }, pool
      );
      if (target.length === 0) return res.status(404).json({ error: 'target folder not found' });
    }

    const rows = await updateFolder.run(
      {
        folderId: req.params.id,
        ownerId: req.userId!,
        name: parsed.data.name ?? null,
        setParent,
        parentId: parsed.data.parentId ?? null,
      },
      pool
    );
    return res.json({ folder: rows[0] });
  } catch (err) {
    console.error('folder update error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

// DELETE /folders/:id  (hard-delete until Trash ships; files cascade to root via ON DELETE SET NULL)
foldersRouter.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const own = await getFolderByIdAndOwner.run({ folderId: req.params.id, ownerId: req.userId! }, pool);
    if (own.length === 0) return res.status(404).json({ error: 'folder not found' });
    await deleteFolderCascade.run({ folderId: req.params.id, ownerId: req.userId! }, pool);
    return res.status(204).send();
  } catch (err) {
    console.error('folder delete error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});
```

- [ ] **Step 4: Register router in `index.ts`**

Add import and `app.use('/folders', foldersRouter);` alongside the other route registrations.

- [ ] **Step 5: Run folder tests — expect PASS.**

---

### Task 5: API — file move/rename + folder-aware upload (TDD)

**Files:** Modify `apps/api/src/routes/files.sql`, `files.ts`, `upload.sql`, `upload.ts`

- [ ] **Step 1: Add queries to `files.sql`**

Add `folder_id` to `ListFilesByOwner` and `GetFileByIdAndOwner` selects, and add:

```sql
/* @name UpdateFile */
UPDATE files
SET name = COALESCE(:name, name),
    folder_id = CASE WHEN :setFolder::boolean THEN :folderId ELSE folder_id END,
    updated_at = NOW()
WHERE id = :fileId AND owner_id = :ownerId
RETURNING id, owner_id, name, mime_type, size_bytes, checksum, folder_id, created_at, updated_at;
```

- [ ] **Step 2: `InsertFile` in `upload.sql` takes folder_id**

```sql
/* @name InsertFile */
INSERT INTO files (owner_id, name, mime_type, size_bytes, storage_key, checksum, folder_id)
VALUES (:ownerId, :name, :mimeType, :sizeBytes, :storageKey, :checksum, :folderId)
RETURNING id;
```

- [ ] **Step 3: Regenerate types**

```bash
cd apps/api && DATABASE_URL=postgres://localhost:5432/pjdrive npx pgtyped -c pgtyped.config.json
```

- [ ] **Step 4: Write failing test** in `files.test.ts` for `PATCH /files/:id` (rename, move to folder, move to root with `folderId:null`, other user → 404). Run — expect FAIL.

- [ ] **Step 5: Implement `PATCH /files/:id` in `files.ts`**

```typescript
import { parseBody, UpdateFileBody } from '../schemas';
import { updateFile } from './files.queries';

filesRouter.patch('/:id', requireAuth, async (req: AuthRequest, res) => {
  const parsed = parseBody(UpdateFileBody, req.body, res);
  if (!parsed.ok) return;
  try {
    const own = await getFileByIdAndOwner.run({ fileId: req.params.id, ownerId: req.userId! }, pool);
    if (own.length === 0) return res.status(404).json({ error: 'file not found' });
    const setFolder = parsed.data.folderId !== undefined;
    const rows = await updateFile.run(
      {
        fileId: req.params.id,
        ownerId: req.userId!,
        name: parsed.data.name ?? null,
        setFolder,
        folderId: parsed.data.folderId ?? null,
      },
      pool
    );
    return res.json({ file: rows[0] });
  } catch (err) {
    console.error('file update error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});
```

> Register `PATCH /:id` **before** any conflicting routes; note `filesRouter` is mounted after `sharingRouter` on `/files` — verify no path collision with existing sharing routes.

- [ ] **Step 6: Update `upload.ts`** to pass `folderId: parsed.data.folderId ?? null` into `insertFile.run(...)`.

- [ ] **Step 7: Run full API suite — expect all green** (27 existing + new folder/file tests).

```bash
cd apps/api && DATABASE_URL=postgres://localhost:5432/pjdrive S3_ENDPOINT=http://localhost:9002 npx vitest run
```

---

### Task 6: Web — folder navigation UI

**Files:** Modify `apps/web/src/pages/Dashboard.tsx`, `components/FileList.tsx`; create `Breadcrumb.tsx`, `NewFolderButton.tsx`, `MoveModal.tsx`

- [ ] **Step 1: Dashboard holds current folder id**

Track `currentFolderId: string | null` in `Dashboard` state (default null = root). Fetch `GET /folders/${currentFolderId ?? 'root'}` and pass `{ folder, breadcrumb, subfolders, files }` down. Bump `refreshKey` on upload/create/move/delete to refetch.

- [ ] **Step 2: `Breadcrumb.tsx`** — renders `My Drive / … / current`, each segment a button that sets `currentFolderId`. `My Drive` sets null.

- [ ] **Step 3: `NewFolderButton.tsx`** — prompts for name (`window.prompt` is fine for the learning app), `POST /folders { name, parentId: currentFolderId }`, then refresh.

- [ ] **Step 4: `FileList.tsx`** — accept `subfolders` + `files` props. Render folder rows first (📁 icon, click navigates, Rename/Move/Delete actions), then file rows (add a **Move** action). Rename → `PATCH`; Delete folder → `DELETE /folders/:id`; Move → open `MoveModal`.

- [ ] **Step 5: `MoveModal.tsx`** — fetch flat `GET /folders`, show a select of folders + "My Drive (root)". On confirm, `PATCH /files/:id { folderId }` or `PATCH /folders/:id { parentId }`, then refresh.

- [ ] **Step 6: Uploader** — pass `currentFolderId` so `/upload/init` includes `folderId`. (Thread a prop into `Uploader`; update its `initUpload` call.)

- [ ] **Step 7: Manual verification**

Start API + web (`npx tsx apps/api/src/index.ts`, `npx vite apps/web`). Log in and verify:
- Create a folder → appears in list.
- Navigate into it (breadcrumb updates).
- Upload a file inside → appears only in that folder, not at root.
- Move a file to root → disappears from folder, appears at root.
- Move a folder into itself → error surfaced.
- Delete a folder → its files reappear at root.

---

### Task 7: Commit

- [ ] **Step 1:** Verify full suite green, then commit SQL + generated `.queries.ts` together.

```bash
git add apps/api apps/web packages/shared
git commit -m "feat: add nested folders (hierarchy, move, breadcrumb nav)"
```
