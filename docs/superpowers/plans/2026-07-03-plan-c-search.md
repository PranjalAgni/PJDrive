# Plan C — Search

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Search files and folders by name using Postgres full-text (`to_tsvector`) plus `ILIKE` partial match, scoped to the caller, excluding trashed rows, with optional mime-type and date filters. Add a debounced search box to the web Dashboard.

**Spec:** `docs/superpowers/specs/2026-07-03-folders-trash-search-design.md` §5

**Architecture:** GIN index on `to_tsvector('simple', name)` for files and folders. A `GET /search` route runs one query per table combining FTS `OR` ILIKE, filtered by owner + `trashed_at IS NULL` + optional type/date, ranked and limited. Web adds a debounced search box that swaps the folder listing for a results panel.

**Tech Stack:** Express, pgtyped, PostgreSQL FTS, React

**Prerequisites:** Plan A (Folders) and Plan B (Trash) complete and committed. `trashed_at` and `folder_id` exist. Full suite green.

---

## File Structure

```
apps/api/migrations/
└── 009_add_search_indexes.sql       ← NEW: GIN indexes

apps/api/src/routes/
├── search.sql / .queries.ts / .ts / .test.ts   ← NEW
apps/api/src/
├── schemas.ts                       ← MODIFY: SearchQuery
└── index.ts                         ← MODIFY: register /search

packages/shared/src/types.ts         ← MODIFY: SearchResult shape (optional)

apps/web/src/
├── components/SearchBox.tsx         ← NEW (debounced input)
├── components/SearchResults.tsx     ← NEW
└── pages/Dashboard.tsx              ← MODIFY: search state, swap listing for results
```

---

### Task 1: Migration — GIN search indexes

- [ ] **Step 1:** Create `apps/api/migrations/009_add_search_indexes.sql`

```sql
CREATE INDEX idx_files_name_fts   ON files   USING GIN (to_tsvector('simple', name));
CREATE INDEX idx_folders_name_fts ON folders USING GIN (to_tsvector('simple', name));
-- trigram-style prefix help for ILIKE (optional; requires pg_trgm)
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- CREATE INDEX idx_files_name_trgm ON files USING GIN (name gin_trgm_ops);
```

> `pg_trgm` speeds up `ILIKE '%q%'` but needs the extension. For the learning project the FTS GIN index plus a plain scan for ILIKE is fine at small scale — leave the trigram lines commented and note it. If you enable it, uncomment and rerun.

- [ ] **Step 2:** Run migration.

```bash
cd /Users/pranjal.agnihotri/coding/aiexperiments/pjdrive
DATABASE_URL=postgres://localhost:5432/pjdrive npx tsx apps/api/src/migrate.ts
```

---

### Task 2: search.sql queries

**Files:** Create `apps/api/src/routes/search.sql`

- [ ] **Step 1:** Write the queries. Two queries (files, folders) with the same matcher. `plainto_tsquery('simple', :q)` handles multi-word input safely; the ILIKE `OR` catches prefixes/substrings that FTS misses.

```sql
/* @name SearchFiles */
SELECT id, name, mime_type, size_bytes, folder_id, created_at,
       ts_rank(to_tsvector('simple', name), plainto_tsquery('simple', :q)) AS rank
FROM files
WHERE owner_id = :ownerId
  AND trashed_at IS NULL
  AND (
    to_tsvector('simple', name) @@ plainto_tsquery('simple', :q)
    OR name ILIKE :like
  )
  AND (:typePrefix::text IS NULL OR mime_type LIKE :typePrefix)
  AND (:afterTs::timestamptz IS NULL OR created_at >= :afterTs)
  AND (:beforeTs::timestamptz IS NULL OR created_at <= :beforeTs)
ORDER BY rank DESC, created_at DESC
LIMIT :maxResults;

/* @name SearchFolders */
SELECT id, parent_id, name, created_at,
       ts_rank(to_tsvector('simple', name), plainto_tsquery('simple', :q)) AS rank
FROM folders
WHERE owner_id = :ownerId
  AND trashed_at IS NULL
  AND (
    to_tsvector('simple', name) @@ plainto_tsquery('simple', :q)
    OR name ILIKE :like
  )
  AND (:afterTs::timestamptz IS NULL OR created_at >= :afterTs)
  AND (:beforeTs::timestamptz IS NULL OR created_at <= :beforeTs)
ORDER BY rank DESC, created_at DESC
LIMIT :maxResults;
```

> The handler builds `:like` as `%${q}%` and `:typePrefix` as `${type}%` (e.g. `image%`). Null the optional params when absent.

- [ ] **Step 2:** Regenerate types.

```bash
cd apps/api && DATABASE_URL=postgres://localhost:5432/pjdrive npx pgtyped -c pgtyped.config.json
```

> If pgtyped types the guarded params (`:typePrefix`, `:afterTs`, `:beforeTs`) as non-nullable because of the `::text`/`::timestamptz` casts, the `(:x IS NULL OR ...)` pattern still accepts null at runtime — pass `null`. Confirm the generated param type allows `null`; if it doesn't, cast in the handler or split queries.

---

### Task 3: SearchQuery schema

**Files:** Modify `apps/api/src/schemas.ts`

- [ ] **Step 1:** Add:

```typescript
// ─── Search ──────────────────────────────────────────────────────────────────

export const SearchQuery = z.object({
  q: z.string().min(1, { message: 'q required' }).max(200),
  type: z.string().max(100).optional(),
  after: z.iso.datetime({ message: 'after must be ISO' }).optional(),
  before: z.iso.datetime({ message: 'before must be ISO' }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type SearchQueryType = z.infer<typeof SearchQuery>;
```

> Query params arrive as strings; `z.coerce.number()` handles `limit`. Reuse the existing `parseQuery` helper.

---

### Task 4: search.ts router (TDD)

**Files:** Create `apps/api/src/routes/search.ts`, `search.test.ts`; modify `index.ts`

- [ ] **Step 1: Write failing tests** covering:
  - FTS word match ("report" finds "Q3 Report.pdf").
  - ILIKE partial ("rep" finds "report.pdf").
  - Folder name match returned in `folders[]`.
  - `type=image` returns only image files.
  - `after`/`before` date filters.
  - Excludes trashed files/folders (trash one, confirm absent).
  - Excludes another user's files.
  - Respects `limit`.
  - Missing `q` → 400.

Seed data with direct `INSERT`s in the test (files with distinct names/mime types, one trashed, one owned by a second user). Run — expect FAIL.

- [ ] **Step 2: Implement `search.ts`**

```typescript
import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { parseQuery, SearchQuery } from '../schemas';
import { searchFiles, searchFolders } from './search.queries';

export const searchRouter = Router();

searchRouter.get('/', requireAuth, async (req: AuthRequest, res) => {
  const parsed = parseQuery(SearchQuery, req.query, res);
  if (!parsed.ok) return;
  const { q, type, after, before, limit } = parsed.data;
  try {
    const params = {
      ownerId: req.userId!,
      q,
      like: `%${q}%`,
      typePrefix: type ? `${type}%` : null,
      afterTs: after ?? null,
      beforeTs: before ?? null,
      maxResults: limit,
    };
    const files = await searchFiles.run(params, pool);
    // folders query has no typePrefix param
    const folders = await searchFolders.run(
      { ownerId: req.userId!, q, like: `%${q}%`, afterTs: after ?? null, beforeTs: before ?? null, maxResults: limit },
      pool
    );
    return res.json({ files, folders });
  } catch (err) {
    console.error('search error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});
```

- [ ] **Step 3:** Register `app.use('/search', searchRouter);` in `index.ts`. Run search tests — expect PASS.

- [ ] **Step 4:** Full API suite green.

```bash
cd apps/api && DATABASE_URL=postgres://localhost:5432/pjdrive S3_ENDPOINT=http://localhost:9002 npx vitest run
```

---

### Task 5: Web — search box + results

**Files:** Create `apps/web/src/components/SearchBox.tsx`, `SearchResults.tsx`; modify `Dashboard.tsx`

- [ ] **Step 1: `SearchBox.tsx`** — controlled input, debounce ~300ms (a `useEffect` + `setTimeout` cleanup, or a small `useDebounce` hook). Calls `onSearch(query)` after the debounce; calls `onClear()` when emptied.

- [ ] **Step 2: `SearchResults.tsx`** — takes `{ files, folders }`, renders folder results (📁, click navigates via a passed `onOpenFolder(id)`) and file results (Download/Share/Move/Delete, reusing the same handlers as `FileList`). Show each result's location if `folder_id`/`parent_id` is set (fetch folder name lazily or just show "in a folder" / "My Drive" — keep simple).

- [ ] **Step 3: `Dashboard.tsx`** — add `searchQuery` state. When non-empty, call `GET /search?q=...` and render `SearchResults` in place of the folder `FileList`; when empty, render the normal folder view. Put `SearchBox` in the header.

- [ ] **Step 4:** Optional type filter chip (image / pdf / doc) that sets `&type=`. Date filters are wired server-side; UI can defer them — note this in the commit.

- [ ] **Step 5: Manual verification**
  - Type "report" → matching files/folders appear.
  - Type a partial → still matches (ILIKE).
  - Trash a matching file → no longer in results.
  - Clear box → back to current folder view.
  - Click a folder result → navigates into it.

---

### Task 6: Commit

- [ ] **Step 1:** Full suite green, commit SQL + generated queries + web.

```bash
git add apps/api apps/web packages/shared
git commit -m "feat: add search (Postgres FTS + ILIKE over file/folder names, type/date filters)"
```

---

## Notes / known limitations

- Searches **names only** — not file contents/OCR (out of scope per spec §2).
- `simple` FTS config: no stemming, so "reports" won't match a search for "reporting". ILIKE covers most partial cases.
- At small scale the ILIKE branch may scan; `pg_trgm` index (commented in migration 009) is the upgrade path.
