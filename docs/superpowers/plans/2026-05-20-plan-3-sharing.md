# File Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement file sharing — share with specific users by email (editor/viewer role), generate public share links, permission-check middleware, and a "Shared with me" view.

**Architecture:** All share records live in the `shared_files` table. Every file request checks: owner → user share → link share → 403. Share tokens are random UUIDs used as public link identifiers. The `requireFileAccess` middleware is reused by upload/download routes in Plan 2.

**Tech Stack:** Node.js, Express, PostgreSQL, React, React Router

**Prerequisites:** Plans 1 and 2 complete.

---

## File Structure

```
apps/api/src/
├── middleware/
│   └── fileAccess.ts              ← requireFileAccess(minRole) middleware
├── routes/
│   ├── sharing.ts                 ← POST /files/:id/share, POST /files/:id/share/link, GET /share/:token, DELETE /files/:id/share/:shareId
│   ├── sharing.test.ts
│   └── sharedWithMe.ts            ← GET /files/shared-with-me
apps/web/src/
├── pages/
│   └── SharedWithMe.tsx           ← list of files shared with current user
├── components/
│   └── ShareModal.tsx             ← share dialog (email input + role select + copy link)
```

---

### Task 1: Permission middleware

**Files:**
- Create: `apps/api/src/middleware/fileAccess.ts`

- [ ] **Step 1: Create apps/api/src/middleware/fileAccess.ts**

```typescript
import { Response, NextFunction } from 'express';
import { pool } from '../db';
import { AuthRequest } from './auth';

export type Role = 'owner' | 'editor' | 'viewer';

const roleRank: Record<Role, number> = { owner: 3, editor: 2, viewer: 1 };

function meetsMinRole(actual: Role, required: Role): boolean {
  return roleRank[actual] >= roleRank[required];
}

export function requireFileAccess(minRole: Role) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const fileId = req.params.id || req.params.fileId;
    const shareToken = req.query.token as string | undefined;

    // 1. Check ownership
    const ownerRes = await pool.query('SELECT id FROM files WHERE id=$1 AND owner_id=$2', [fileId, req.userId]);
    if (ownerRes.rows.length > 0) {
      req.fileRole = 'owner';
      return next();
    }

    // 2. Check user share
    if (req.userId) {
      const shareRes = await pool.query(
        "SELECT role FROM shared_files WHERE file_id=$1 AND shared_with=$2 AND share_type='user' AND (expires_at IS NULL OR expires_at > NOW())",
        [fileId, req.userId]
      );
      if (shareRes.rows.length > 0) {
        const role = shareRes.rows[0].role as Role;
        if (meetsMinRole(role, minRole)) {
          req.fileRole = role;
          return next();
        }
        return res.status(403).json({ error: 'insufficient permissions' });
      }
    }

    // 3. Check share token (public link)
    if (shareToken) {
      const tokenRes = await pool.query(
        "SELECT role FROM shared_files WHERE file_id=$1 AND share_token=$2 AND share_type='link' AND (expires_at IS NULL OR expires_at > NOW())",
        [fileId, shareToken]
      );
      if (tokenRes.rows.length > 0) {
        const role = tokenRes.rows[0].role as Role;
        if (meetsMinRole(role, minRole)) {
          req.fileRole = role;
          return next();
        }
        return res.status(403).json({ error: 'insufficient permissions' });
      }
    }

    return res.status(403).json({ error: 'access denied' });
  };
}
```

Extend `AuthRequest` in `apps/api/src/middleware/auth.ts` to add `fileRole`:

```typescript
export interface AuthRequest extends Request {
  userId?: string;
  userEmail?: string;
  fileRole?: 'owner' | 'editor' | 'viewer';
}
```

---

### Task 2: Sharing API routes

**Files:**
- Create: `apps/api/src/routes/sharing.ts`
- Create: `apps/api/src/routes/sharing.test.ts`
- Create: `apps/api/src/routes/sharedWithMe.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/api/src/routes/sharing.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { pool } from '../db';

let ownerToken: string;
let recipientToken: string;
let fileId: string;
let ownerId: string;
let recipientId: string;

beforeAll(async () => {
  await pool.query("DELETE FROM users WHERE email IN ('share-owner@example.com','share-recip@example.com')");

  const ownerRes = await request(app).post('/auth/register').send({ email: 'share-owner@example.com', password: 'pass123' });
  ownerToken = ownerRes.body.token;
  ownerId = ownerRes.body.user.id;

  const recipRes = await request(app).post('/auth/register').send({ email: 'share-recip@example.com', password: 'pass123' });
  recipientToken = recipRes.body.token;
  recipientId = recipRes.body.user.id;

  const fileRes = await pool.query(
    "INSERT INTO files (owner_id,name,mime_type,size_bytes,storage_key,checksum) VALUES ($1,'shared.txt','text/plain',100,'key/shared','abc') RETURNING id",
    [ownerId]
  );
  fileId = fileRes.rows[0].id;
});

afterAll(async () => {
  await pool.query("DELETE FROM users WHERE email IN ('share-owner@example.com','share-recip@example.com')");
  await pool.end();
});

describe('POST /files/:id/share (user share)', () => {
  it('shares file with another user by email', async () => {
    const res = await request(app)
      .post(`/files/${fileId}/share`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'share-recip@example.com', role: 'viewer' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.role).toBe('viewer');
  });

  it('returns 404 if recipient email not found', async () => {
    const res = await request(app)
      .post(`/files/${fileId}/share`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'nobody@example.com', role: 'viewer' });

    expect(res.status).toBe(404);
  });

  it('returns 403 if non-owner tries to share', async () => {
    const res = await request(app)
      .post(`/files/${fileId}/share`)
      .set('Authorization', `Bearer ${recipientToken}`)
      .send({ email: 'share-recip@example.com', role: 'viewer' });

    expect(res.status).toBe(403);
  });
});

describe('POST /files/:id/share/link', () => {
  it('generates a public share token', async () => {
    const res = await request(app)
      .post(`/files/${fileId}/share/link`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'viewer' });

    expect(res.status).toBe(201);
    expect(res.body.shareToken).toBeDefined();
    expect(res.body.shareUrl).toContain('/share/');
  });
});

describe('GET /share/:token', () => {
  it('resolves a valid share token to file metadata', async () => {
    const linkRes = await request(app)
      .post(`/files/${fileId}/share/link`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'viewer' });

    const token = linkRes.body.shareToken;
    const res = await request(app).get(`/share/${token}`);
    expect(res.status).toBe(200);
    expect(res.body.file.id).toBe(fileId);
  });

  it('returns 404 for invalid token', async () => {
    const res = await request(app).get('/share/invalid-token-xyz');
    expect(res.status).toBe(404);
  });
});

describe('GET /files/shared-with-me', () => {
  it('returns files shared with current user', async () => {
    const res = await request(app)
      .get('/files/shared-with-me')
      .set('Authorization', `Bearer ${recipientToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((f: any) => f.id === fileId)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
DATABASE_URL=postgres://localhost:5432/pjdrive cd apps/api && npx vitest run src/routes/sharing.test.ts
```

Expected: FAIL — 404s.

- [ ] **Step 3: Create apps/api/src/routes/sharing.ts**

```typescript
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';

export const sharingRouter = Router();

// Share with specific user by email
sharingRouter.post('/:id/share', requireAuth, async (req: AuthRequest, res) => {
  const { email, role } = req.body as { email: string; role: 'editor' | 'viewer' };

  // Only owner can share
  const fileRes = await pool.query('SELECT id FROM files WHERE id=$1 AND owner_id=$2', [req.params.id, req.userId]);
  if (fileRes.rows.length === 0) return res.status(403).json({ error: 'access denied' });

  // Lookup recipient
  const userRes = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
  if (userRes.rows.length === 0) return res.status(404).json({ error: 'user not found' });

  const recipientId = userRes.rows[0].id;

  const { rows } = await pool.query(
    "INSERT INTO shared_files (file_id, owner_id, shared_with, share_type, role) VALUES ($1,$2,$3,'user',$4) ON CONFLICT DO NOTHING RETURNING *",
    [req.params.id, req.userId, recipientId, role]
  );

  return res.status(201).json(rows[0]);
});

// Generate public share link
sharingRouter.post('/:id/share/link', requireAuth, async (req: AuthRequest, res) => {
  const { role } = req.body as { role: 'editor' | 'viewer' };

  const fileRes = await pool.query('SELECT id FROM files WHERE id=$1 AND owner_id=$2', [req.params.id, req.userId]);
  if (fileRes.rows.length === 0) return res.status(403).json({ error: 'access denied' });

  const shareToken = uuidv4();

  const { rows } = await pool.query(
    "INSERT INTO shared_files (file_id, owner_id, share_type, role, share_token) VALUES ($1,$2,'link',$3,$4) RETURNING *",
    [req.params.id, req.userId, role, shareToken]
  );

  const shareUrl = `${process.env.APP_URL || 'http://localhost:5173'}/share/${shareToken}`;
  return res.status(201).json({ ...rows[0], shareUrl });
});

// Resolve public share token
sharingRouter.get('/resolve/:token', async (req, res) => {
  const { rows } = await pool.query(
    "SELECT sf.*, f.name, f.mime_type, f.size_bytes FROM shared_files sf JOIN files f ON f.id=sf.file_id WHERE sf.share_token=$1 AND sf.share_type='link' AND (sf.expires_at IS NULL OR sf.expires_at > NOW())",
    [req.params.token]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'share not found' });

  const row = rows[0];
  return res.json({ file: { id: row.file_id, name: row.name, mime_type: row.mime_type, size_bytes: row.size_bytes }, role: row.role });
});

// Revoke share
sharingRouter.delete('/:id/share/:shareId', requireAuth, async (req: AuthRequest, res) => {
  const { rowCount } = await pool.query(
    'DELETE FROM shared_files WHERE id=$1 AND file_id=$2 AND owner_id=$3',
    [req.params.shareId, req.params.id, req.userId]
  );
  if (rowCount === 0) return res.status(404).json({ error: 'share not found' });
  return res.status(204).send();
});
```

- [ ] **Step 4: Create apps/api/src/routes/sharedWithMe.ts**

```typescript
import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';

export const sharedWithMeRouter = Router();

sharedWithMeRouter.get('/', requireAuth, async (req: AuthRequest, res) => {
  const { rows } = await pool.query(
    `SELECT f.id, f.name, f.mime_type, f.size_bytes, f.created_at, sf.role, u.email AS owner_email
     FROM shared_files sf
     JOIN files f ON f.id = sf.file_id
     JOIN users u ON u.id = sf.owner_id
     WHERE sf.shared_with = $1 AND sf.share_type = 'user'
     ORDER BY f.created_at DESC`,
    [req.userId]
  );
  return res.json(rows);
});
```

- [ ] **Step 5: Register routes in apps/api/src/index.ts**

```typescript
import { sharingRouter } from './routes/sharing';
import { sharedWithMeRouter } from './routes/sharedWithMe';

// Add a dedicated route for resolving public share tokens
app.get('/share/:token', async (req, res) => {
  const { rows } = await (await import('./db')).pool.query(
    "SELECT sf.*, f.name, f.mime_type, f.size_bytes FROM shared_files sf JOIN files f ON f.id=sf.file_id WHERE sf.share_token=$1 AND sf.share_type='link' AND (sf.expires_at IS NULL OR sf.expires_at > NOW())",
    [req.params.token]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'share not found' });
  const row = rows[0];
  return res.json({ file: { id: row.file_id, name: row.name, mime_type: row.mime_type, size_bytes: row.size_bytes }, role: row.role });
});

app.use('/files', sharingRouter);         // must be before filesRouter
app.use('/files/shared-with-me', sharedWithMeRouter);
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
DATABASE_URL=postgres://localhost:5432/pjdrive cd apps/api && npx vitest run src/routes/sharing.test.ts
```

Expected: all 6 tests PASS.

---

### Task 3: Frontend — ShareModal + SharedWithMe page

**Files:**
- Create: `apps/web/src/components/ShareModal.tsx`
- Create: `apps/web/src/pages/SharedWithMe.tsx`
- Modify: `apps/web/src/components/FileList.tsx`
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Create apps/web/src/components/ShareModal.tsx**

```tsx
import { useState } from 'react';
import { apiClient } from '../api/client';

interface Props {
  fileId: string;
  fileName: string;
  onClose: () => void;
}

export function ShareModal({ fileId, fileName, onClose }: Props) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'viewer' | 'editor'>('viewer');
  const [shareUrl, setShareUrl] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleShareByEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setSuccess('');
    try {
      await apiClient.post(`/files/${fileId}/share`, { email, role });
      setSuccess(`Shared with ${email} as ${role}`);
      setEmail('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Share failed');
    }
  }

  async function handleGenerateLink() {
    setError(''); setSuccess('');
    try {
      const { data } = await apiClient.post(`/files/${fileId}/share/link`, { role });
      setShareUrl(data.shareUrl);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to generate link');
    }
  }

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  };

  const modalStyle: React.CSSProperties = {
    background: '#fff', borderRadius: 8, padding: 24, width: 420, maxWidth: '90vw',
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <h3>Share "{fileName}"</h3>

        <form onSubmit={handleShareByEmail} style={{ marginBottom: 16 }}>
          <label>Share with email</label>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <input
              type="email" value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              style={{ flex: 1 }}
              required
            />
            <select value={role} onChange={(e) => setRole(e.target.value as 'viewer' | 'editor')}>
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </select>
            <button type="submit">Share</button>
          </div>
        </form>

        <div style={{ marginBottom: 16 }}>
          <label>Public link</label>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <select value={role} onChange={(e) => setRole(e.target.value as 'viewer' | 'editor')}>
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </select>
            <button type="button" onClick={handleGenerateLink}>Generate link</button>
          </div>
          {shareUrl && (
            <div style={{ marginTop: 8 }}>
              <input readOnly value={shareUrl} style={{ width: '100%' }} onClick={(e) => (e.target as HTMLInputElement).select()} />
            </div>
          )}
        </div>

        {error && <p style={{ color: 'red' }}>{error}</p>}
        {success && <p style={{ color: 'green' }}>{success}</p>}
        <button onClick={onClose} style={{ marginTop: 8 }}>Close</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update apps/web/src/components/FileList.tsx to add Share button**

Add to imports:
```tsx
import { useState } from 'react';
import { ShareModal } from './ShareModal';
```

Add state inside `FileList`:
```tsx
const [sharingFile, setSharingFile] = useState<DriveFile | null>(null);
```

Add Share button in each row's `<td>`:
```tsx
<button onClick={() => setSharingFile(f)} style={{ marginRight: 8 }}>Share</button>
```

Add modal at bottom of return:
```tsx
{sharingFile && (
  <ShareModal
    fileId={sharingFile.id}
    fileName={sharingFile.name}
    onClose={() => setSharingFile(null)}
  />
)}
```

- [ ] **Step 3: Create apps/web/src/pages/SharedWithMe.tsx**

```tsx
import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

interface SharedFile {
  id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  role: 'editor' | 'viewer';
  owner_email: string;
}

export function SharedWithMe() {
  const [files, setFiles] = useState<SharedFile[]>([]);

  useEffect(() => {
    apiClient.get('/files/shared-with-me').then((r) => setFiles(r.data));
  }, []);

  async function handleDownload(file: SharedFile) {
    const { data } = await apiClient.get(`/files/${file.id}/download-url`);
    window.open(data.url, '_blank');
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <h2>Shared with me</h2>
      {files.length === 0 ? (
        <p>No files have been shared with you yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Name</th>
              <th style={{ textAlign: 'left' }}>Owner</th>
              <th style={{ textAlign: 'left' }}>Role</th>
              <th style={{ textAlign: 'left' }}>Size</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {files.map((f) => (
              <tr key={f.id} style={{ borderTop: '1px solid #eee' }}>
                <td>{f.name}</td>
                <td>{f.owner_email}</td>
                <td>{f.role}</td>
                <td>{(f.size_bytes / 1024 / 1024).toFixed(2)} MB</td>
                <td>
                  <button onClick={() => handleDownload(f)}>Download</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Update apps/web/src/App.tsx to add SharedWithMe route**

```tsx
import { SharedWithMe } from './pages/SharedWithMe';

// Inside <Routes>, add:
<Route path="/shared" element={<ProtectedRoute><SharedWithMe /></ProtectedRoute>} />
```

Add a nav link in `Dashboard.tsx` header:
```tsx
import { Link } from 'react-router-dom';
// In the header div, add:
<Link to="/shared" style={{ marginRight: 16 }}>Shared with me</Link>
```

- [ ] **Step 5: Run dev and verify manually**

```bash
DATABASE_URL=postgres://localhost:5432/pjdrive npx turbo run dev
```

Verify:
- Click "Share" on a file → modal appears
- Enter another user's email + role → "Shared with user@..." success message
- Click "Generate link" → URL appears, can copy it
- Log in as recipient → navigate to `/shared` → shared file appears
- Recipient can download the shared file

