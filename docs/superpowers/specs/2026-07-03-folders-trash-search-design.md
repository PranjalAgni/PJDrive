# PJDrive — Folders, Trash & Search Design Spec (PRD)

**Date:** 2026-07-03
**Author:** brainstormed with Claude
**Status:** Approved for planning

---

## 1. Motivation

PJDrive is a working Google Drive clone: chunked upload, sharing, real-time sync, typed SQL. But it is missing the three features that most define the day-to-day Drive experience:

1. **Folders** — files are stored flat. There is no way to organise anything.
2. **Trash** — deletes are permanent and irreversible. A misclick loses data.
3. **Search** — with more than a handful of files, there is no way to find one.

Research across Google Drive's desktop + web feature set (three parallel research passes) consistently ranked these as HIGH value / achievable difficulty, and as the natural "organise your Drive" story. Higher-value differentiators (streaming virtual filesystem, real-time OT collaboration) were rejected as VERY HIGH difficulty and a poor fit for a learning project.

These three are sequenced deliberately: **Folders is foundational** (it changes the files data model), **Trash builds on it** (soft-delete replaces hard-delete), and **Search leans on both** (filter within a folder, exclude trashed files).

---

## 2. Scope

Three independently shippable features, built in order. Each is a separate implementation plan.

| # | Feature | Ships |
|---|---|---|
| 1 | **Folders** | Nested folder hierarchy, create/rename/move/delete folders, files live in a folder, breadcrumb navigation |
| 2 | **Trash** | Soft-delete files & folders, Trash view, restore, permanent delete, 30-day auto-purge |
| 3 | **Search** | Postgres full-text + prefix search by file/folder name, with type & date filters, scoped to the current user |

### Out of scope (this spec)

- File version history (separate future spec)
- Thumbnails / preview
- Full-text search of file *contents* / OCR (we search names + metadata only)
- Shared Drives / team ownership
- Starred/favorites (trivial follow-up, not bundled here)
- Folder-level sharing (sharing stays file-level; folders are owner-only for now)
- Sync-client + desktop-app awareness of folders (see §8)

---

## 3. Feature 1 — Folders

### 3.1 Data model

A folder is a lightweight row in a new `folders` table. Files gain a nullable `folder_id`. `folder_id = NULL` means "root of My Drive".

```
folders
  id           UUID PK
  owner_id     UUID NOT NULL → users(id) ON DELETE CASCADE
  parent_id    UUID NULL     → folders(id) ON DELETE CASCADE   -- NULL = root
  name         VARCHAR(500) NOT NULL
  created_at   TIMESTAMPTZ
  updated_at   TIMESTAMPTZ

files
  + folder_id  UUID NULL     → folders(id) ON DELETE SET NULL  -- NULL = root
```

**Why single-parent:** Google's multi-parent model in My Drive is legacy complexity. One parent per folder/file keeps the tree a real tree — simpler queries, no cycle ambiguity. This is a deliberate simplification.

**Cycle prevention:** A folder cannot be moved into itself or any of its own descendants. Enforced in the move handler via a recursive descendant check (see §3.3).

**Depth:** No hard depth cap for the clone. (Google caps at 100; we note it but don't enforce — YAGNI.)

### 3.2 API

All routes require auth; all operate only on the caller's own folders/files.

```
POST   /folders                 { name, parentId? }      → 201 { folder }
GET    /folders/:id             (:id or "root")          → 200 { folder, breadcrumb[], subfolders[], files[] }
GET    /folders                 ?parentId=<id|null>       → 200 { subfolders[] }   (flat list, for move picker)
PATCH  /folders/:id             { name?, parentId? }      → 200 { folder }         (rename and/or move)
DELETE /folders/:id                                       → 204                    (soft-delete once Trash ships; hard-delete until then — see §3.5)
PATCH  /files/:id               { folderId?, name? }      → 200 { file }           (move file between folders / rename)
```

`GET /folders/:id` with `id === 'root'` returns the root listing (`folder: null`, `breadcrumb: []`, plus root-level subfolders and files where `folder_id IS NULL`).

**Breadcrumb** is computed with a recursive CTE walking `parent_id` up to root, returned root-first: `[{id, name}, …]`.

### 3.3 Move & cycle check

`PATCH /folders/:id { parentId }`:
1. Reject if `parentId === :id` (can't be its own parent).
2. Reject if `parentId` is a descendant of `:id` — recursive CTE from `:id` downward; if the target is in that set, 400 `"cannot move a folder into its own subtree"`.
3. Otherwise update `parent_id`.

### 3.4 Web UI

`Dashboard` becomes folder-aware:
- **Breadcrumb bar** at top: `My Drive / Reports / Q3` — each segment clickable.
- **Folder rows** render above file rows in the same list, with a folder icon; clicking a folder navigates into it (updates `?folder=<id>` query param / route state).
- **New Folder** button next to Upload.
- Each folder row: **Rename**, **Move**, **Delete** actions. Each file row gains a **Move** action.
- **Move** opens a modal with a folder picker (reuse the flat `GET /folders` list).
- Upload targets the current folder (`folderId` passed to `/upload/init`).

### 3.5 Interaction with Trash

Folders ships **before** Trash. Until Trash exists, `DELETE /folders/:id` hard-deletes (cascade removes subfolders; files' `folder_id` set to NULL, i.e. moved to root — files are *not* deleted with the folder). When Trash ships (Feature 2), folder delete becomes a soft-delete and cascades the trashed state to contained files/subfolders (§4.3).

---

## 4. Feature 2 — Trash

### 4.1 Data model

Soft-delete via nullable timestamps on both tables. A row is "trashed" iff `trashed_at IS NOT NULL`.

```
files
  + trashed_at   TIMESTAMPTZ NULL

folders
  + trashed_at   TIMESTAMPTZ NULL
```

Index: `CREATE INDEX idx_files_owner_trashed ON files(owner_id, trashed_at);` (and same for folders) so active-file listings stay fast.

**Every existing "list my files/folders" query gains `AND trashed_at IS NULL`.** This is the riskiest part of the change — see §7 testing.

### 4.2 API

```
DELETE /files/:id              → soft-delete (set trashed_at = NOW())        204
DELETE /folders/:id            → soft-delete + cascade to contents           204
GET    /trash                  → { files[], folders[] } where trashed_at NOT NULL
POST   /trash/:type/:id/restore→ clear trashed_at (type ∈ files|folders)      200
DELETE /trash/:type/:id        → permanent delete (row + S3 object)          204
DELETE /trash                  → empty trash (permanent-delete all trashed)  204
```

`DELETE /files/:id` changes meaning: it now **trashes** rather than destroys. Permanent deletion moves to `DELETE /trash/files/:id`, which is where the S3 `DeleteObjectCommand` + sync-log `deleted` event now live.

### 4.3 Cascade semantics

Trashing a folder trashes everything inside it (recursive), stamping the **same** `trashed_at` on all descendants. On restore, only rows whose `trashed_at` equals the folder's trashed_at are restored together (so items trashed independently earlier stay trashed). Implemented by:
- Trash: recursive CTE collects folder + all descendant folder ids; `UPDATE … SET trashed_at = :now` on those folders and on files whose `folder_id` is in that set **and** currently `trashed_at IS NULL`.
- Restore a folder: restore the folder and all descendants sharing its `trashed_at` value.

**Restore edge case:** if a folder's parent is itself trashed, restoring the child restores it to **root** (`folder_id`/`parent_id` set to NULL) to avoid resurrecting into a trashed container. Surface this in the UI copy ("restored to My Drive").

### 4.4 Auto-purge (30 days)

A purge routine deletes rows where `trashed_at < NOW() - INTERVAL '30 days'`, and removes their S3 objects.

**Mechanism:** a `purgeTrash()` function in `apps/api/src/purge.ts`, runnable two ways:
- `setInterval` on API startup (every 6 hours) — good enough for the learning project.
- Standalone `npx tsx apps/api/src/purge.ts` for manual/cron runs.

Purge is transactional per batch: collect storage keys → delete S3 objects → delete rows. (S3 first is safer against orphaned DB rows; a failed S3 delete logs and continues, matching the existing delete handler's tolerance.)

### 4.5 Web UI

- **Trash** link in the header (next to "Shared with me").
- **Trash page**: lists trashed files + folders with **Restore** and **Delete forever** per row, plus an **Empty Trash** button.
- Delete buttons on the Dashboard now say **"Move to Trash"** (or keep "Delete" but no longer `confirm()`-destroy — it's recoverable).
- Empty-trash and permanent-delete keep the `confirm()` guard (these *are* irreversible).

---

## 5. Feature 3 — Search

### 5.1 Approach

Postgres-native search — no Elasticsearch. Two complementary matchers over **names only** (files + folders), scoped to the caller and excluding trashed rows:

1. **Full-text** via `to_tsvector`/`plainto_tsquery` for word matches ("report" matches "Q3 Report.pdf").
2. **Prefix / substring** via `ILIKE '%q%'` for partial typing ("rep" matches "report").

A `GIN` index on `to_tsvector('simple', name)` keeps FTS fast; `ILIKE` is a fallback for short/partial queries.

**Why `simple` config:** filenames aren't prose; we don't want English stemming turning "reporting" and "reports" into surprises. `simple` lowercases and tokenises without stemming.

### 5.2 API

```
GET /search?q=<text>&type=<mime-prefix>&after=<iso>&before=<iso>&limit=50
→ 200 {
    files:   [{ id, name, mime_type, size_bytes, folder_id, created_at }],
    folders: [{ id, name, parent_id, created_at }]
  }
```

- `q` (required, min 1 char): matched against name via FTS `OR` ILIKE.
- `type` (optional): mime-type prefix filter, e.g. `image` matches `image/png`. Files only.
- `after` / `before` (optional ISO dates): filter on `created_at`.
- Always: `owner_id = :userId AND trashed_at IS NULL`.
- Results ordered by FTS rank then `created_at DESC`, capped at `limit` (default 50, max 100).

Validated with a new `SearchQuery` Zod schema in `schemas.ts`.

### 5.3 Web UI

- **Search box** in the Dashboard header, debounced ~300ms.
- Typing shows a results panel replacing the folder listing: matched folders (clickable → navigate) and files (with the usual actions). Each result shows its location (folder name / "My Drive").
- Clearing the box returns to the current folder view.
- Optional filter chips (type: image/pdf/doc; date range) — include the `type` filter chip; date filters are wired in the API but the UI can defer them (note in plan).

---

## 6. Cross-cutting: pgtyped & conventions

Every new query follows the existing pattern:
- SQL lives in a `.sql` file with `/* @name X */` annotations and `:param` placeholders.
- `npx pgtyped -c pgtyped.config.json` regenerates the `.queries.ts` file (committed alongside).
- Route handlers import the generated `.run()` functions and use guard clauses + try/catch → `500 internal server error`, matching every existing route.
- New tables get a numbered migration (`006_…`, `007_…`, `008_…`).
- Shared types (`Folder`, updated `File`, search result shapes) added to `packages/shared/src/types.ts`.

---

## 7. Testing strategy

Each feature ships with vitest route tests in the established style (register a throwaway user in `beforeAll`, clean up in `afterAll`, use `supertest` against `app`).

Critical test coverage:
- **Folders:** create nested, move, **reject cycle** (move folder into its own descendant → 400), breadcrumb order, delete moves files to root, isolation (can't touch another user's folder → 404).
- **Trash:** delete trashes (file still in DB, absent from `/files`), restore, permanent delete removes row + (mock) S3 call, cascade trash of a folder trashes its files, restore-to-root when parent trashed, **regression: `/files` and `/folders` never return trashed rows.**
- **Search:** name FTS match, ILIKE partial match, type filter, date filter, excludes trashed, excludes other users' files, respects limit.

Full suite must stay green after each feature (currently 27 tests).

---

## 8. Sync client & desktop app (explicit deferral)

The `apps/sync` watcher and Electron desktop app currently assume a **flat** sync folder. Folders introduce a hierarchy the sync client doesn't model. To keep each plan shippable:

- The sync client continues to sync into **root** (`folder_id = NULL`). Files uploaded via web into subfolders simply won't download to the flat sync folder — documented as a known limitation.
- Trash: the sync client's remote→local delete already keys off sync-log `deleted` events, which now fire only on **permanent** delete. Trashing a file will **not** remove it from the sync folder until purge. Acceptable for now; noted as a limitation.
- Mapping the folder tree onto the local filesystem is a **future spec** (it's the natural "real sync" follow-up and a good distributed-systems exercise).

This deferral is intentional and called out so implementers don't try to solve it mid-plan.

---

## 9. Rollout order

1. **Plan A — Folders** (migration 006 + files.folder_id, folders route, web nav). No breaking change to existing file listing except added `folder_id` column.
2. **Plan B — Trash** (migrations 007/008 trashed_at, soft-delete rewrite of DELETE handlers, trash route + purge, web Trash page). Depends on A (folder cascade).
3. **Plan C — Search** (migration 009 GIN index, search route, web search box). Depends on B (must exclude trashed).

Each plan ends with the full test suite green and a working web demo.
