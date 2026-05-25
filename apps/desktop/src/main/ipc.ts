import { ipcMain, BrowserWindow, shell } from 'electron';
import axios from 'axios';
import path from 'path';
import { storeCredentials, getStoredToken, getStoredEmail, clearCredentials } from './auth';
import { startSync, stopSync, getSyncStatus } from './sync';
import { getLastSyncAt } from '../../../sync/src/state';

const API_URL = process.env.API_URL || 'http://localhost:3000';

let mainWindow: BrowserWindow | null = null;

export function setMainWindow(win: BrowserWindow) {
  mainWindow = win;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function registerIpcHandlers() {
  ipcMain.handle('auth:check', async () => {
    const token = getStoredToken();
    const email = getStoredEmail();
    return { loggedIn: !!token, email: email ?? undefined };
  });

  ipcMain.handle('auth:login', async (_event, { email, password }: { email: string; password: string }) => {
    try {
      const res = await axios.post(`${API_URL}/auth/login`, { email, password });
      const { token, user } = res.data as { token: string; user: { email: string } };
      storeCredentials(token, user.email);
      if (mainWindow) await startSync(token, user.email, mainWindow);
      return { ok: true };
    } catch (err: any) {
      const message = err.response?.data?.error ?? 'Login failed — check your credentials';
      return { ok: false, error: message };
    }
  });

  ipcMain.handle('auth:logout', async () => {
    stopSync();
    clearCredentials();
  });

  ipcMain.handle('sync:status', async () => {
    return getSyncStatus();
  });

  ipcMain.handle('sync:folder', async () => {
    const syncFolder = path.join(process.cwd(), 'sync-folder');
    return { path: syncFolder };
  });

  ipcMain.handle('folder:open', async () => {
    const syncFolder = path.join(process.cwd(), 'sync-folder');
    await shell.openPath(syncFolder);
  });

  ipcMain.handle('stats:get', async () => {
    try {
      const token = getStoredToken();
      if (!token) return { fileCount: 0, totalBytes: 0, lastSyncAt: null, mode: 'off' };

      const res = await axios.get(`${API_URL}/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const { fileCount, totalBytes } = res.data as { fileCount: number; totalBytes: number };

      const syncStatus = getSyncStatus();
      const lastSyncAt = getLastSyncAt();

      return { fileCount, totalBytes, lastSyncAt, mode: syncStatus.mode };
    } catch (err) {
      console.error('stats:get error:', err);
      return { fileCount: 0, totalBytes: 0, lastSyncAt: null, mode: 'off' };
    }
  });

  ipcMain.handle('window:resize', async (_event, screen: 'login' | 'dashboard') => {
    if (!mainWindow) return;
    const height = screen === 'login' ? 380 : 580;
    mainWindow.setSize(400, height, true);
  });
}
