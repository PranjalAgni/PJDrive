import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../db';
import { JWT_SECRET, BCRYPT_ROUNDS } from '../config';
import { insertUser, getUserByEmail } from './auth.queries';

export const authRouter = Router();

authRouter.post('/register', async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  if (password.length < 8) return res.status(400).json({ error: 'password must be at least 8 characters' });

  const normalizedEmail = email.trim().toLowerCase();
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  try {
    const rows = await insertUser.run({ email: normalizedEmail, passwordHash: hash }, pool);
    const user = rows[0];
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    return res.status(201).json({ token, user: { id: user.id, email: user.email } });
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'email already registered' });
    console.error('register error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const rows = await getUserByEmail.run({ email: normalizedEmail }, pool);
    if (rows.length === 0) return res.status(401).json({ error: 'invalid credentials' });

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'invalid credentials' });

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    return res.status(200).json({ token, user: { id: user.id, email: user.email } });
  } catch (err: any) {
    console.error('login error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});
