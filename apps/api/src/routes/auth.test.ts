import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { pool } from '../db';

const AUTH_TEST_EMAILS = [
  'test-reg@example.com',
  'test-dup@example.com',
  'test-login@example.com',
  'test-mw@example.com',
];

beforeAll(async () => {
  await pool.query('DELETE FROM users WHERE email = ANY($1)', [AUTH_TEST_EMAILS]);
});

afterAll(async () => {
  await pool.query('DELETE FROM users WHERE email = ANY($1)', [AUTH_TEST_EMAILS]);
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

describe('requireAuth middleware', () => {
  it('returns 401 when no Authorization header', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 for invalid token', async () => {
    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', 'Bearer invalidtoken');
    expect(res.status).toBe(401);
  });

  it('attaches userId for valid token', async () => {
    const reg = await request(app)
      .post('/auth/register')
      .send({ email: 'test-mw@example.com', password: 'password123' });
    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${reg.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBeDefined();
  });
});
