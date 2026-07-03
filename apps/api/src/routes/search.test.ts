import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { pool } from '../db';

let token: string;
let otherToken: string;
let userId: string;
let otherUserId: string;

beforeAll(async () => {
  await pool.query("DELETE FROM users WHERE email IN ('search-test@example.com','search-other@example.com')");
  const res = await request(app)
    .post('/auth/register')
    .send({ email: 'search-test@example.com', password: 'password123' });
  token = res.body.token;
  userId = res.body.user.id;

  const other = await request(app)
    .post('/auth/register')
    .send({ email: 'search-other@example.com', password: 'password123' });
  otherToken = other.body.token;
  otherUserId = other.body.user.id;

  // Seed files for the primary user.
  await pool.query(
    `INSERT INTO files (owner_id, name, mime_type, storage_key, checksum, created_at) VALUES
       ($1, 'Q3 Report.pdf',   'application/pdf', 's1', 'c1', '2026-01-15T00:00:00Z'),
       ($1, 'report-notes.txt','text/plain',      's2', 'c2', '2026-03-01T00:00:00Z'),
       ($1, 'vacation.png',    'image/png',        's3', 'c3', '2026-05-01T00:00:00Z'),
       ($1, 'diagram.png',     'image/png',        's4', 'c4', '2026-06-01T00:00:00Z')`,
    [userId]
  );

  // A trashed file that would otherwise match "report".
  await pool.query(
    "INSERT INTO files (owner_id, name, mime_type, storage_key, checksum, trashed_at) VALUES ($1,'trashed report.pdf','application/pdf','s5','c5', NOW())",
    [userId]
  );

  // Another user's file that matches "report" — must not leak.
  await pool.query(
    "INSERT INTO files (owner_id, name, mime_type, storage_key, checksum) VALUES ($1,'secret report.pdf','application/pdf','s6','c6')",
    [otherUserId]
  );

  // Folders for the primary user.
  await pool.query(
    "INSERT INTO folders (owner_id, name) VALUES ($1,'Reports Archive'), ($1,'Photos')",
    [userId]
  );
});

afterAll(async () => {
  await pool.query("DELETE FROM users WHERE email IN ('search-test@example.com','search-other@example.com')");
  await pool.end();
});

function auth(t: string) {
  return { Authorization: `Bearer ${t}` };
}

describe('GET /search', () => {
  it('requires auth', async () => {
    expect((await request(app).get('/search?q=report')).status).toBe(401);
  });

  it('rejects missing q', async () => {
    const res = await request(app).get('/search').set(auth(token));
    expect(res.status).toBe(400);
  });

  it('FTS word match finds "Q3 Report.pdf" for query "report"', async () => {
    const res = await request(app).get('/search?q=report').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.files.some((f: { name: string }) => f.name === 'Q3 Report.pdf')).toBe(true);
  });

  it('ILIKE partial match finds "report-notes.txt" for query "rep"', async () => {
    const res = await request(app).get('/search?q=rep').set(auth(token));
    expect(res.body.files.some((f: { name: string }) => f.name === 'report-notes.txt')).toBe(true);
  });

  it('matches folder names', async () => {
    const res = await request(app).get('/search?q=reports').set(auth(token));
    expect(res.body.folders.some((f: { name: string }) => f.name === 'Reports Archive')).toBe(true);
  });

  it('type=image returns only image files', async () => {
    const res = await request(app).get('/search?q=png&type=image').set(auth(token));
    const names = res.body.files.map((f: { name: string }) => f.name);
    expect(names).toContain('vacation.png');
    expect(names).toContain('diagram.png');
    expect(res.body.files.every((f: { mime_type: string }) => f.mime_type.startsWith('image'))).toBe(true);
  });

  it('after filter excludes older files', async () => {
    const res = await request(app).get('/search?q=report&after=2026-02-01T00:00:00Z').set(auth(token));
    const names = res.body.files.map((f: { name: string }) => f.name);
    expect(names).toContain('report-notes.txt');
    expect(names).not.toContain('Q3 Report.pdf');
  });

  it('before filter excludes newer files', async () => {
    const res = await request(app).get('/search?q=report&before=2026-02-01T00:00:00Z').set(auth(token));
    const names = res.body.files.map((f: { name: string }) => f.name);
    expect(names).toContain('Q3 Report.pdf');
    expect(names).not.toContain('report-notes.txt');
  });

  it('excludes trashed files', async () => {
    const res = await request(app).get('/search?q=report').set(auth(token));
    expect(res.body.files.some((f: { name: string }) => f.name === 'trashed report.pdf')).toBe(false);
  });

  it('excludes another user files', async () => {
    const res = await request(app).get('/search?q=report').set(auth(token));
    expect(res.body.files.some((f: { name: string }) => f.name === 'secret report.pdf')).toBe(false);
  });

  it('respects limit', async () => {
    const res = await request(app).get('/search?q=png&limit=1').set(auth(token));
    expect(res.body.files.length).toBe(1);
  });
});
