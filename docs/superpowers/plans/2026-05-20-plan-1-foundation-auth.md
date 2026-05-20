# Foundation + Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the Turborepo monorepo, set up PostgreSQL with migrations, implement JWT auth (register/login), and build the React auth pages.

**Architecture:** Turborepo monorepo with three apps (web, api, sync) and a shared types package. API uses Express + TypeScript. Auth uses bcrypt for password hashing and JWT for session tokens. PostgreSQL migrations run via `node-pg-migrate`.

**Tech Stack:** Turborepo, Node.js, TypeScript, Express, PostgreSQL, node-pg-migrate, bcrypt, jsonwebtoken, React, React Router, Axios, Vitest

---

## File Structure

```
pjdrive/
├── package.json                          ← root workspace config
├── turbo.json                            ← turborepo pipeline
├── apps/
│   ├── api/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts                  ← Express app entry
│   │   │   ├── db.ts                     ← pg Pool singleton
│   │   │   ├── middleware/
│   │   │   │   └── auth.ts               ← JWT verify middleware
│   │   │   └── routes/
│   │   │       └── auth.ts               ← /auth/register, /auth/login
│   │   └── migrations/
│   │       ├── 001_create_users.sql
│   │       ├── 002_create_files.sql
│   │       ├── 003_create_uploads.sql
│   │       ├── 004_create_shared_files.sql
│   │       └── 005_create_sync_log.sql
│   ├── web/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts
│   │   ├── index.html
│   │   └── src/
│   │       ├── main.tsx
│   │       ├── App.tsx
│   │       ├── api/
│   │       │   └── client.ts             ← axios instance with JWT header
│   │       ├── store/
│   │       │   └── auth.ts               ← auth state (token, user)
│   │       └── pages/
│   │           ├── Login.tsx
│   │           └── Register.tsx
│   └── sync/
│       └── package.json                  ← placeholder only in this plan
└── packages/
    └── shared/
        ├── package.json
        └── src/
            └── types.ts                  ← User, File, UploadJob shared types
```

---

### Task 1: Scaffold Turborepo monorepo

**Files:**
- Create: `package.json`
- Create: `turbo.json`
- Create: `apps/api/package.json`
- Create: `apps/web/package.json`
- Create: `apps/sync/package.json`
- Create: `packages/shared/package.json`
- Create: `packages/shared/src/types.ts`

- [ ] **Step 1: Create root package.json**

```json
{
  "name": "pjdrive",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "test": "turbo run test"
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "dev": {
      "cache": false,
      "persistent": true
    },
    "build": {
      "outputs": ["dist/**"]
    },
    "test": {
      "outputs": []
    }
  }
}
```

- [ ] **Step 3: Create packages/shared/package.json**

```json
{
  "name": "@pjdrive/shared",
  "version": "0.0.1",
  "main": "./src/types.ts",
  "types": "./src/types.ts"
}
```

- [ ] **Step 4: Create packages/shared/src/types.ts**

```typescript
export interface User {
  id: string;
  email: string;
  created_at: string;
}

export interface File {
  id: string;
  owner_id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  storage_key: string;
  checksum: string;
  created_at: string;
  updated_at: string;
}

export interface UploadJob {
  id: string;
  file_id: string;
  upload_id: string;
  total_chunks: number;
  uploaded_chunks: string[];
  status: 'in_progress' | 'complete' | 'failed';
}

export interface ShareRecord {
  id: string;
  file_id: string;
  owner_id: string;
  shared_with: string | null;
  share_type: 'user' | 'link';
  role: 'editor' | 'viewer';
  share_token: string | null;
  expires_at: string | null;
}

export interface SyncEvent {
  id: string;
  user_id: string;
  file_id: string;
  event_type: 'created' | 'updated' | 'deleted';
  created_at: string;
}
```

- [ ] **Step 5: Create apps/api/package.json**

```json
{
  "name": "@pjdrive/api",
  "version": "0.0.1",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "test": "vitest run",
    "migrate": "node -r tsx/cjs src/migrate.ts"
  },
  "dependencies": {
    "@pjdrive/shared": "*",
    "bcrypt": "^5.1.1",
    "cors": "^2.8.5",
    "express": "^4.19.2",
    "jsonwebtoken": "^9.0.2",
    "pg": "^8.11.5"
  },
  "devDependencies": {
    "@types/bcrypt": "^5.0.2",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/jsonwebtoken": "^9.0.6",
    "@types/pg": "^8.11.6",
    "tsx": "^4.11.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 6: Create apps/api/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 7: Create apps/web/package.json**

```json
{
  "name": "@pjdrive/web",
  "version": "0.0.1",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "@pjdrive/shared": "*",
    "axios": "^1.7.2",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.23.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.4.0",
    "vite": "^5.2.12",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 8: Create apps/web/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true
  },
  "include": ["src"]
}
```

- [ ] **Step 9: Create apps/web/vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3000', rewrite: (p) => p.replace(/^\/api/, '') },
    },
  },
});
```

- [ ] **Step 10: Create apps/sync/package.json**

```json
{
  "name": "@pjdrive/sync",
  "version": "0.0.1",
  "scripts": {
    "dev": "tsx watch src/index.ts"
  },
  "dependencies": {
    "@pjdrive/shared": "*"
  },
  "devDependencies": {
    "tsx": "^4.11.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 11: Install dependencies**

```bash
npm install
```

Expected: all workspaces resolved, no errors.

---

### Task 2: PostgreSQL migrations

**Files:**
- Create: `apps/api/migrations/001_create_users.sql`
- Create: `apps/api/migrations/002_create_files.sql`
- Create: `apps/api/migrations/003_create_uploads.sql`
- Create: `apps/api/migrations/004_create_shared_files.sql`
- Create: `apps/api/migrations/005_create_sync_log.sql`
- Create: `apps/api/src/migrate.ts`
- Create: `apps/api/src/db.ts`

- [ ] **Step 1: Create 001_create_users.sql**

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

- [ ] **Step 2: Create 002_create_files.sql**

```sql
CREATE TABLE files (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         VARCHAR(500) NOT NULL,
  mime_type    VARCHAR(255),
  size_bytes   BIGINT,
  storage_key  VARCHAR(1000) NOT NULL,
  checksum     VARCHAR(64),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_files_owner ON files(owner_id);
```

- [ ] **Step 3: Create 003_create_uploads.sql**

```sql
CREATE TABLE uploads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id         UUID REFERENCES files(id) ON DELETE CASCADE,
  owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  upload_id       VARCHAR(500) NOT NULL,
  total_chunks    INT NOT NULL,
  uploaded_chunks JSONB DEFAULT '[]',
  status          VARCHAR(20) DEFAULT 'in_progress'
                  CHECK (status IN ('in_progress', 'complete', 'failed')),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

- [ ] **Step 4: Create 004_create_shared_files.sql**

```sql
CREATE TABLE shared_files (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id     UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shared_with UUID REFERENCES users(id) ON DELETE CASCADE,
  share_type  VARCHAR(10) NOT NULL CHECK (share_type IN ('user', 'link')),
  role        VARCHAR(10) NOT NULL CHECK (role IN ('editor', 'viewer')),
  share_token VARCHAR(64) UNIQUE,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT user_share_check CHECK (
    (share_type = 'user' AND shared_with IS NOT NULL) OR
    (share_type = 'link' AND share_token IS NOT NULL)
  )
);

CREATE INDEX idx_shared_files_user ON shared_files(shared_with);
CREATE INDEX idx_shared_files_file ON shared_files(file_id);
CREATE UNIQUE INDEX idx_share_token ON shared_files(share_token)
  WHERE share_token IS NOT NULL;
```

- [ ] **Step 5: Create 005_create_sync_log.sql**

```sql
CREATE TABLE sync_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_id    UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('created', 'updated', 'deleted')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sync_log_user_time ON sync_log(user_id, created_at);
```

- [ ] **Step 6: Create apps/api/src/db.ts**

```typescript
import { Pool } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
```

- [ ] **Step 7: Create apps/api/src/migrate.ts**

```typescript
import fs from 'fs';
import path from 'path';
import { pool } from './db';

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      name VARCHAR(255) PRIMARY KEY,
      run_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const migrationsDir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(migrationsDir).sort();

  for (const file of files) {
    const { rows } = await pool.query('SELECT 1 FROM migrations WHERE name = $1', [file]);
    if (rows.length > 0) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await pool.query(sql);
    await pool.query('INSERT INTO migrations (name) VALUES ($1)', [file]);
    console.log(`Ran migration: ${file}`);
  }

  await pool.end();
}

migrate().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 8: Start PostgreSQL and run migrations**

```bash
# Ensure PostgreSQL is running, then:
DATABASE_URL=postgres://localhost:5432/pjdrive npx tsx apps/api/src/migrate.ts
```

Expected output:
```
Ran migration: 001_create_users.sql
Ran migration: 002_create_files.sql
Ran migration: 003_create_uploads.sql
Ran migration: 004_create_shared_files.sql
Ran migration: 005_create_sync_log.sql
```

---

### Task 3: API — Auth routes

**Files:**
- Create: `apps/api/src/index.ts`
- Create: `apps/api/src/routes/auth.ts`
- Create: `apps/api/src/middleware/auth.ts`
- Create: `apps/api/src/routes/auth.test.ts`

- [ ] **Step 1: Write failing tests for register + login**

Create `apps/api/src/routes/auth.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { pool } from '../db';

beforeAll(async () => {
  await pool.query('DELETE FROM users WHERE email LIKE $1', ['test-%@example.com']);
});

afterAll(async () => {
  await pool.query('DELETE FROM users WHERE email LIKE $1', ['test-%@example.com']);
  await pool.end();
});

describe('POST /auth/register', () => {
  it('creates a user and returns a JWT', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'test-reg@example.com', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(typeof res.body.token).toBe('string');
  });

  it('returns 409 on duplicate email', async () => {
    await request(app)
      .post('/auth/register')
      .send({ email: 'test-dup@example.com', password: 'password123' });

    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'test-dup@example.com', password: 'password123' });

    expect(res.status).toBe(409);
  });
});

describe('POST /auth/login', () => {
  it('returns a JWT for valid credentials', async () => {
    await request(app)
      .post('/auth/register')
      .send({ email: 'test-login@example.com', password: 'password123' });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'test-login@example.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  it('returns 401 for wrong password', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'test-login@example.com', password: 'wrong' });

    expect(res.status).toBe(401);
  });
});
```

Add `supertest` to devDependencies in `apps/api/package.json`:
```json
"supertest": "^7.0.0",
"@types/supertest": "^6.0.2"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && npx vitest run src/routes/auth.test.ts
```

Expected: FAIL — `Cannot find module '../index'`

- [ ] **Step 3: Create apps/api/src/index.ts**

```typescript
import express from 'express';
import cors from 'cors';
import { authRouter } from './routes/auth';

export const app = express();

app.use(cors());
app.use(express.json());
app.use('/auth', authRouter);

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`API running on port ${PORT}`));
}
```

- [ ] **Step 4: Create apps/api/src/routes/auth.ts**

```typescript
import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../db';

export const authRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-prod';

authRouter.post('/register', async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  const hash = await bcrypt.hash(password, 10);

  try {
    const { rows } = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at',
      [email, hash]
    );
    const user = rows[0];
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    return res.status(201).json({ token, user: { id: user.id, email: user.email } });
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'email already registered' });
    return res.status(500).json({ error: 'internal server error' });
  }
});

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  if (rows.length === 0) return res.status(401).json({ error: 'invalid credentials' });

  const user = rows[0];
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'invalid credentials' });

  const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
  return res.status(200).json({ token, user: { id: user.id, email: user.email } });
});
```

- [ ] **Step 5: Create apps/api/src/middleware/auth.ts**

```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-prod';

export interface AuthRequest extends Request {
  userId?: string;
  userEmail?: string;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'unauthorized' });

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string; email: string };
    req.userId = payload.userId;
    req.userEmail = payload.email;
    next();
  } catch {
    return res.status(401).json({ error: 'invalid token' });
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
DATABASE_URL=postgres://localhost:5432/pjdrive cd apps/api && npx vitest run src/routes/auth.test.ts
```

Expected: all 4 tests PASS.

---

### Task 4: React frontend — Auth pages

**Files:**
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/api/client.ts`
- Create: `apps/web/src/store/auth.ts`
- Create: `apps/web/src/pages/Login.tsx`
- Create: `apps/web/src/pages/Register.tsx`

- [ ] **Step 1: Create apps/web/index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PJDrive</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create apps/web/src/api/client.ts**

```typescript
import axios from 'axios';

export const apiClient = axios.create({
  baseURL: '/api',
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
```

- [ ] **Step 3: Create apps/web/src/store/auth.ts**

```typescript
import { create } from 'zustand';

interface AuthState {
  token: string | null;
  userId: string | null;
  email: string | null;
  setAuth: (token: string, userId: string, email: string) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('token'),
  userId: localStorage.getItem('userId'),
  email: localStorage.getItem('email'),
  setAuth: (token, userId, email) => {
    localStorage.setItem('token', token);
    localStorage.setItem('userId', userId);
    localStorage.setItem('email', email);
    set({ token, userId, email });
  },
  clearAuth: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    localStorage.removeItem('email');
    set({ token: null, userId: null, email: null });
  },
}));
```

Add `zustand` to `apps/web/package.json` dependencies:
```json
"zustand": "^4.5.2"
```

- [ ] **Step 4: Create apps/web/src/pages/Register.tsx**

```tsx
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/auth';

export function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const { data } = await apiClient.post('/auth/register', { email, password });
      setAuth(data.token, data.user.id, data.user.email);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Registration failed');
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: '80px auto', padding: 24 }}>
      <h1>PJDrive</h1>
      <h2>Create account</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <form onSubmit={handleSubmit}>
        <div>
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ display: 'block', width: '100%', marginBottom: 12 }} />
        </div>
        <div>
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ display: 'block', width: '100%', marginBottom: 12 }} />
        </div>
        <button type="submit" style={{ width: '100%' }}>Register</button>
      </form>
      <p>Already have an account? <Link to="/login">Login</Link></p>
    </div>
  );
}
```

- [ ] **Step 5: Create apps/web/src/pages/Login.tsx**

```tsx
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/auth';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const { data } = await apiClient.post('/auth/login', { email, password });
      setAuth(data.token, data.user.id, data.user.email);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed');
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: '80px auto', padding: 24 }}>
      <h1>PJDrive</h1>
      <h2>Login</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <form onSubmit={handleSubmit}>
        <div>
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ display: 'block', width: '100%', marginBottom: 12 }} />
        </div>
        <div>
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ display: 'block', width: '100%', marginBottom: 12 }} />
        </div>
        <button type="submit" style={{ width: '100%' }}>Login</button>
      </form>
      <p>No account? <Link to="/register">Register</Link></p>
    </div>
  );
}
```

- [ ] **Step 6: Create apps/web/src/App.tsx**

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
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
        <Route path="/" element={<ProtectedRoute><div>Dashboard (coming in Plan 2)</div></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 7: Create apps/web/src/main.tsx**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 8: Run both dev servers and verify manually**

```bash
# Terminal 1
DATABASE_URL=postgres://localhost:5432/pjdrive npx turbo run dev
```

Open `http://localhost:5173`. Verify:
- `/register` renders form, submitting creates account and redirects to `/`
- `/login` renders form, submitting with correct credentials redirects to `/`
- `/login` with wrong password shows error message
- `/` redirects to `/login` when not authenticated

