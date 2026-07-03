import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { pool } from '../db';

let token: string;
let otherToken: string;
let userId: string;

beforeAll(async () => {
  await pool.query("DELETE FROM users WHERE email IN ('folders-test@example.com','folders-other@example.com')");
  const res = await request(app)
    .post('/auth/register')
    .send({ email: 'folders-test@example.com', password: 'password123' });
  token = res.body.token;
  userId = res.body.user.id;

  const other = await request(app)
    .post('/auth/register')
    .send({ email: 'folders-other@example.com', password: 'password123' });
  otherToken = other.body.token;
});

afterAll(async () => {
  await pool.query("DELETE FROM users WHERE email IN ('folders-test@example.com','folders-other@example.com')");
  await pool.end();
});

function auth(t: string) {
  return { Authorization: `Bearer ${t}` };
}

describe('POST /folders', () => {
  it('requires auth', async () => {
    expect((await request(app).post('/folders').send({ name: 'x' })).status).toBe(401);
  });

  it('rejects missing name', async () => {
    const res = await request(app).post('/folders').set(auth(token)).send({});
    expect(res.status).toBe(400);
  });

  it('creates a root folder', async () => {
    const res = await request(app).post('/folders').set(auth(token)).send({ name: 'Reports' });
    expect(res.status).toBe(201);
    expect(res.body.folder.name).toBe('Reports');
    expect(res.body.folder.parent_id).toBeNull();
  });

  it('creates a nested folder', async () => {
    const parent = await request(app).post('/folders').set(auth(token)).send({ name: 'Parent' });
    const child = await request(app)
      .post('/folders')
      .set(auth(token))
      .send({ name: 'Child', parentId: parent.body.folder.id });
    expect(child.status).toBe(201);
    expect(child.body.folder.parent_id).toBe(parent.body.folder.id);
  });

  it('rejects creating in another user folder', async () => {
    const mine = await request(app).post('/folders').set(auth(token)).send({ name: 'Mine' });
    const res = await request(app)
      .post('/folders')
      .set(auth(otherToken))
      .send({ name: 'Sneaky', parentId: mine.body.folder.id });
    expect(res.status).toBe(404);
  });
});

describe('GET /folders/:id', () => {
  it('root returns null folder + arrays', async () => {
    const res = await request(app).get('/folders/root').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.folder).toBeNull();
    expect(Array.isArray(res.body.subfolders)).toBe(true);
    expect(Array.isArray(res.body.files)).toBe(true);
    expect(res.body.breadcrumb).toEqual([]);
  });

  it('returns breadcrumb root-first for a nested folder', async () => {
    const a = await request(app).post('/folders').set(auth(token)).send({ name: 'A' });
    const b = await request(app).post('/folders').set(auth(token)).send({ name: 'B', parentId: a.body.folder.id });
    const c = await request(app).post('/folders').set(auth(token)).send({ name: 'C', parentId: b.body.folder.id });

    const res = await request(app).get(`/folders/${c.body.folder.id}`).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.breadcrumb.map((x: { name: string }) => x.name)).toEqual(['A', 'B', 'C']);
  });

  it('lists files that live in the folder', async () => {
    const f = await request(app).post('/folders').set(auth(token)).send({ name: 'WithFiles' });
    await pool.query(
      "INSERT INTO files (owner_id, name, storage_key, checksum, folder_id) VALUES ($1,'in.txt','k1','c1',$2)",
      [userId, f.body.folder.id]
    );
    const res = await request(app).get(`/folders/${f.body.folder.id}`).set(auth(token));
    expect(res.body.files.some((x: { name: string }) => x.name === 'in.txt')).toBe(true);
  });

  it('404 for another user folder', async () => {
    const f = await request(app).post('/folders').set(auth(token)).send({ name: 'Private' });
    const res = await request(app).get(`/folders/${f.body.folder.id}`).set(auth(otherToken));
    expect(res.status).toBe(404);
  });
});

describe('PATCH /folders/:id', () => {
  it('renames a folder', async () => {
    const f = await request(app).post('/folders').set(auth(token)).send({ name: 'OldName' });
    const res = await request(app).patch(`/folders/${f.body.folder.id}`).set(auth(token)).send({ name: 'NewName' });
    expect(res.status).toBe(200);
    expect(res.body.folder.name).toBe('NewName');
  });

  it('moves a folder into another', async () => {
    const dest = await request(app).post('/folders').set(auth(token)).send({ name: 'Dest' });
    const mover = await request(app).post('/folders').set(auth(token)).send({ name: 'Mover' });
    const res = await request(app)
      .patch(`/folders/${mover.body.folder.id}`)
      .set(auth(token))
      .send({ parentId: dest.body.folder.id });
    expect(res.status).toBe(200);
    expect(res.body.folder.parent_id).toBe(dest.body.folder.id);
  });

  it('rejects moving a folder into itself', async () => {
    const f = await request(app).post('/folders').set(auth(token)).send({ name: 'Self' });
    const res = await request(app)
      .patch(`/folders/${f.body.folder.id}`)
      .set(auth(token))
      .send({ parentId: f.body.folder.id });
    expect(res.status).toBe(400);
  });

  it('rejects moving a folder into its own descendant', async () => {
    const p = await request(app).post('/folders').set(auth(token)).send({ name: 'P' });
    const c = await request(app).post('/folders').set(auth(token)).send({ name: 'Cc', parentId: p.body.folder.id });
    const res = await request(app)
      .patch(`/folders/${p.body.folder.id}`)
      .set(auth(token))
      .send({ parentId: c.body.folder.id });
    expect(res.status).toBe(400);
  });

  it('404 patching another user folder', async () => {
    const f = await request(app).post('/folders').set(auth(token)).send({ name: 'Theirs' });
    const res = await request(app).patch(`/folders/${f.body.folder.id}`).set(auth(otherToken)).send({ name: 'x' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /folders/:id', () => {
  it('deletes folder and moves contained files to root', async () => {
    const f = await request(app).post('/folders').set(auth(token)).send({ name: 'ToDelete' });
    const { rows } = await pool.query(
      "INSERT INTO files (owner_id, name, storage_key, checksum, folder_id) VALUES ($1,'orphan.txt','k2','c2',$2) RETURNING id",
      [userId, f.body.folder.id]
    );
    const orphanId = rows[0].id;

    const res = await request(app).delete(`/folders/${f.body.folder.id}`).set(auth(token));
    expect(res.status).toBe(204);

    const check = await pool.query('SELECT folder_id FROM files WHERE id=$1', [orphanId]);
    expect(check.rows[0].folder_id).toBeNull();
  });

  it('404 deleting another user folder', async () => {
    const f = await request(app).post('/folders').set(auth(token)).send({ name: 'Guarded' });
    const res = await request(app).delete(`/folders/${f.body.folder.id}`).set(auth(otherToken));
    expect(res.status).toBe(404);
  });
});

describe('PATCH /files/:id (move/rename)', () => {
  let movableFileId: string;

  beforeAll(async () => {
    const { rows } = await pool.query(
      "INSERT INTO files (owner_id, name, storage_key, checksum) VALUES ($1,'movable.txt','k3','c3') RETURNING id",
      [userId]
    );
    movableFileId = rows[0].id;
  });

  it('renames a file', async () => {
    const res = await request(app).patch(`/files/${movableFileId}`).set(auth(token)).send({ name: 'renamed.txt' });
    expect(res.status).toBe(200);
    expect(res.body.file.name).toBe('renamed.txt');
  });

  it('moves a file into a folder and back to root', async () => {
    const f = await request(app).post('/folders').set(auth(token)).send({ name: 'FileHome' });
    const into = await request(app)
      .patch(`/files/${movableFileId}`)
      .set(auth(token))
      .send({ folderId: f.body.folder.id });
    expect(into.body.file.folder_id).toBe(f.body.folder.id);

    const out = await request(app).patch(`/files/${movableFileId}`).set(auth(token)).send({ folderId: null });
    expect(out.body.file.folder_id).toBeNull();
  });

  it('404 patching another user file', async () => {
    const res = await request(app).patch(`/files/${movableFileId}`).set(auth(otherToken)).send({ name: 'x' });
    expect(res.status).toBe(404);
  });
});
