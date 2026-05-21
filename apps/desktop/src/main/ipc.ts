import { ipcMain, BrowserWindow, shell } from 'electron';
import axios from 'axios';
import path from 'path';
import { storeCredentials, getStoredToken, getStoredEmail, clearCredentials } from './auth';

const API_URL = process.env.API_URL || 'http://localhost:3000';

let mainWindow: BrowserWindow | null = null;

export function setMainWindow(win: BrowserWindow) {
  mainWindow = win;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function registerIpcHandlers() {
  // auth:check — called on launch to see if we already have a token
  ipcMain.handle('auth:check', async () => {
    const token = getStoredToken();
    const email = getStoredEmail();
    return { loggedIn: !!token, email: email ?? undefined };
  });

  // auth:login — POST credentials to API, store token on success
  ipcMain.handle('auth:login', async (_event, { email, password }: { email: string; password: string }) => {
    try {
      const res = await axios.post(`${API_URL}/auth/login`, { email, password });
      const { token, user } = res.data as { token: string; user: { email: string } };
      storeCredentials(token, user.email);
      return { ok: true };
    } catch (err: any) {
      const message = err.response?.data?.error ?? 'Login failed — check your credentials';
      return { ok: false, error: message };
    }
  });

  // auth:logout — clear stored credentials
  ipcMain.handle('auth:logout', async () => {
    clearCredentials();
  });

  // sync:status — stub for Plan 2; Plan 3 replaces this with real state
  ipcMain.handle('sync:status', async () => {
    const email = getStoredEmail();
    return { connected: false, mode: 'off' as const, email: email ?? '' };
  });

  // sync:folder — return absolute path to sync-folder
  ipcMain.handle('sync:folder', async () => {
    const syncFolder = path.join(process.cwd(), 'sync-folder');
    return { path: syncFolder };
  });

  // folder:open — open sync-folder in Finder/Explorer
  ipcMain.handle('folder:open', async () => {
    const syncFolder = path.join(process.cwd(), 'sync-folder');
    await shell.openPath(syncFolder);
  });

  // window:resize — change window height for login vs dashboard
  ipcMain.handle('window:resize', async (_event, screen: 'login' | 'dashboard') => {
    if (!mainWindow) return;
    const height = screen === 'login' ? 380 : 500;
    mainWindow.setSize(400, height, true);
  });
}
