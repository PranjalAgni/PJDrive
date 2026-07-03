import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { pool } from '../db';
import { purgeTrash } from '../purge';

let token: string;
let otherToken: string;
let userId: string;

beforeAll(async () => {
  await pool.query("DELETE FROM users WHERE email IN ('trash-test@example.com','trash-other@example.com')");
  const res = await request(app)
    .post('/auth/register')
    .send({ email: 'trash-test@example.com', password: 'password123' });
  token = res.body.token;
  userId = res.body.user.id;

  const other = await request(app)
    .post('/auth/register')
    .send({ email: 'trash-other@example.com', password: 'password123' });
  otherToken = other.body.token;
});

afterAll(async () => {
  await pool.query("DELETE FROM users WHERE email IN ('trash-test@example.com','trash-other@example.com')");
  await pool.end();
});

function auth(t: string) {
  return { Authorization: `Bearer ${t}` };
}

async function makeFile(name: string, folderId: string | null = null): Promise<string> {
  const key = `k-${name}-${Math.round(performance.now() * 1000)}`;
  const { rows } = await pool.query(
    "INSERT INTO files (owner_id, name, storage_key, checksum, folder_id) VALUES ($1,$2,$3,$4,$5) RETURNING id",
    [userId, name, key, 'chk', folderId]
  );
  return rows[0].id;
}

describe('Trash — files', () => {
  it('soft-delete removes a file from GET /files and lists it in GET /trash', async () => {
    const fileId = await makeFile('todelete.txt');

    const del = await request(app).delete(`/files/${fileId}`).set(auth(token));
    expect(del.status).toBe(204);

    const list = await request(app).get('/files').set(auth(token));
    expect(list.body.some((f: { id: string }) => f.id === fileId)).toBe(false);

    const trash = await request(app).get('/trash').set(auth(token));
    expect(trash.status).toBe(200);
    expect(trash.body.files.some((f: { id: string }) => f.id === fileId)).toBe(true);
  });

  it('restore brings a file back into GET /files', async () => {
    const fileId = await makeFile('restoreme.txt');
    await request(app).delete(`/files/${fileId}`).set(auth(token));

    const restore = await request(app).post(`/trash/files/${fileId}/restore`).set(auth(token));
    expect(restore.status).toBe(200);

    const list = await request(app).get('/files').set(auth(token));
    expect(list.body.some((f: { id: string }) => f.id === fileId)).toBe(true);

    const trash = await request(app).get('/trash').set(auth(token));
    expect(trash.body.files.some((f: { id: string }) => f.id === fileId)).toBe(false);
  });

  it('permanent delete removes a file from trash', async () => {
    const fileId = await makeFile('permadelete.txt');
    await request(app).delete(`/files/${fileId}`).set(auth(token));

    const del = await request(app).delete(`/trash/files/${fileId}`).set(auth(token));
    expect(del.status).toBe(204);

    const trash = await request(app).get('/trash').set(auth(token));
    expect(trash.body.files.some((f: { id: string }) => f.id === fileId)).toBe(false);

    const dbCheck = await pool.query('SELECT id FROM files WHERE id=$1', [fileId]);
    expect(dbCheck.rows.length).toBe(0);
  });

  it('cannot restore another user file → 404', async () => {
    const fileId = await makeFile('mine.txt');
    await request(app).delete(`/files/${fileId}`).set(auth(token));
    const res = await request(app).post(`/trash/files/${fileId}/restore`).set(auth(otherToken));
    expect(res.status).toBe(404);
  });

  it('cannot permanently delete another user file → 404', async () => {
    const fileId = await makeFile('mine2.txt');
    await request(app).delete(`/files/${fileId}`).set(auth(token));
    const res = await request(app).delete(`/trash/files/${fileId}`).set(auth(otherToken));
    expect(res.status).toBe(404);
  });
});

describe('Trash — folders', () => {
  it('trashing a folder hides its files from listings and shows them in trash', async () => {
    const folder = await request(app).post('/folders').set(auth(token)).send({ name: 'TrashDir' });
    const folderId = folder.body.folder.id;
    const fileId = await makeFile('infolder.txt', folderId);

    const del = await request(app).delete(`/folders/${folderId}`).set(auth(token));
    expect(del.status).toBe(204);

    // Folder gone from root listing
    const root = await request(app).get('/folders/root').set(auth(token));
    expect(root.body.subfolders.some((f: { id: string }) => f.id === folderId)).toBe(false);

    // File gone from GET /files
    const files = await request(app).get('/files').set(auth(token));
    expect(files.body.some((f: { id: string }) => f.id === fileId)).toBe(false);

    // Both show up in trash
    const trash = await request(app).get('/trash').set(auth(token));
    expect(trash.body.folders.some((f: { id: string }) => f.id === folderId)).toBe(true);
    expect(trash.body.files.some((f: { id: string }) => f.id === fileId)).toBe(true);
  });

  it('restoring a folder brings back the folder and its files', async () => {
    const folder = await request(app).post('/folders').set(auth(token)).send({ name: 'RestoreDir' });
    const folderId = folder.body.folder.id;
    const fileId = await makeFile('restorable.txt', folderId);

    await request(app).delete(`/folders/${folderId}`).set(auth(token));
    const restore = await request(app).post(`/trash/folders/${folderId}/restore`).set(auth(token));
    expect(restore.status).toBe(200);

    const root = await request(app).get('/folders/root').set(auth(token));
    expect(root.body.subfolders.some((f: { id: string }) => f.id === folderId)).toBe(true);

    const contents = await request(app).get(`/folders/${folderId}`).set(auth(token));
    expect(contents.body.files.some((f: { id: string }) => f.id === fileId)).toBe(true);
  });

  it('restoring a subfolder whose parent is still trashed moves it to root', async () => {
    const parent = await request(app).post('/folders').set(auth(token)).send({ name: 'ParentDir' });
    const parentId = parent.body.folder.id;
    const child = await request(app).post('/folders').set(auth(token)).send({ name: 'ChildDir', parentId });
    const childId = child.body.folder.id;

    // Trash the parent → cascades to child (shared timestamp)
    await request(app).delete(`/folders/${parentId}`).set(auth(token));

    // Restore only the child; its parent is still trashed → child should detach to root
    const restore = await request(app).post(`/trash/folders/${childId}/restore`).set(auth(token));
    expect(restore.status).toBe(200);

    const dbCheck = await pool.query('SELECT parent_id, trashed_at FROM folders WHERE id=$1', [childId]);
    expect(dbCheck.rows[0].trashed_at).toBeNull();
    expect(dbCheck.rows[0].parent_id).toBeNull();
  });
});

describe('Trash — empty', () => {
  it('empty trash clears all trashed items', async () => {
    const fileId = await makeFile('emptyme.txt');
    await request(app).delete(`/files/${fileId}`).set(auth(token));

    const empty = await request(app).delete('/trash').set(auth(token));
    expect(empty.status).toBe(204);

    const trash = await request(app).get('/trash').set(auth(token));
    expect(trash.body.files.length).toBe(0);
    expect(trash.body.folders.length).toBe(0);
  });
});

describe('Trash — purge', () => {
  it('purgeTrash removes items trashed over 30 days ago', async () => {
    const { rows } = await pool.query(
      "INSERT INTO files (owner_id, name, storage_key, checksum, trashed_at) VALUES ($1,'old.txt','k-old','chk', NOW() - INTERVAL '31 days') RETURNING id",
      [userId]
    );
    const oldId = rows[0].id;

    await purgeTrash();

    const check = await pool.query('SELECT id FROM files WHERE id=$1', [oldId]);
    expect(check.rows.length).toBe(0);
  });

  it('purgeTrash keeps items trashed less than 30 days ago', async () => {
    const { rows } = await pool.query(
      "INSERT INTO files (owner_id, name, storage_key, checksum, trashed_at) VALUES ($1,'recent.txt','k-recent','chk', NOW() - INTERVAL '5 days') RETURNING id",
      [userId]
    );
    const recentId = rows[0].id;

    await purgeTrash();

    const check = await pool.query('SELECT id FROM files WHERE id=$1', [recentId]);
    expect(check.rows.length).toBe(1);
  });
});
