import { safeStorage, app } from 'electron';
import fs from 'fs';
import path from 'path';

const TOKEN_FILENAME = 'pjdrive-jwt.enc';
const EMAIL_FILENAME = 'pjdrive-email.txt';

function getUserDataDir(): string {
  return app.getPath('userData');
}

export function storeCredentials(token: string, email: string): void {
  const dir = getUserDataDir();
  const encrypted = safeStorage.encryptString(token);
  fs.writeFileSync(path.join(dir, TOKEN_FILENAME), encrypted);
  fs.writeFileSync(path.join(dir, EMAIL_FILENAME), email, 'utf8');
}

export function getStoredToken(): string | null {
  try {
    const dir = getUserDataDir();
    const encPath = path.join(dir, TOKEN_FILENAME);
    if (!fs.existsSync(encPath)) return null;
    const buf = fs.readFileSync(encPath);
    return safeStorage.decryptString(buf);
  } catch {
    return null;
  }
}

export function getStoredEmail(): string | null {
  try {
    const dir = getUserDataDir();
    const emailPath = path.join(dir, EMAIL_FILENAME);
    if (!fs.existsSync(emailPath)) return null;
    return fs.readFileSync(emailPath, 'utf8');
  } catch {
    return null;
  }
}

export function clearCredentials(): void {
  try {
    const dir = getUserDataDir();
    const tokenPath = path.join(dir, TOKEN_FILENAME);
    const emailPath = path.join(dir, EMAIL_FILENAME);
    if (fs.existsSync(tokenPath)) fs.unlinkSync(tokenPath);
    if (fs.existsSync(emailPath)) fs.unlinkSync(emailPath);
  } catch {
    // ignore cleanup errors
  }
}
