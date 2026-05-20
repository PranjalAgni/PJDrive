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

  const ownerRes = await request(app).post('/auth/register').send({ email: 'share-owner@example.com', password: 'pass123456' });
  ownerToken = ownerRes.body.token;
  ownerId = ownerRes.body.user.id;

  const recipRes = await request(app).post('/auth/register').send({ email: 'share-recip@example.com', password: 'pass123456' });
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
