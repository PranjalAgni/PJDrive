import { app, BrowserWindow } from 'electron';
import path from 'path';
import { registerIpcHandlers, setMainWindow } from './ipc';
import { getStoredToken, getStoredEmail } from './auth';
import { startSync, stopSync } from './sync';

function createWindow() {
  const win = new BrowserWindow({
    width: 400,
    height: 380,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, '../../src/renderer/index.html'));
  setMainWindow(win);
  return win;
}

app.whenReady().then(async () => {
  registerIpcHandlers();
  const win = createWindow();

  // Auto-start sync if stored token exists
  const token = getStoredToken();
  const email = getStoredEmail();
  if (token && email) {
    await startSync(token, email, win);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const newWin = createWindow();
      const token = getStoredToken();
      const email = getStoredEmail();
      if (token && email) {
        startSync(token, email, newWin).catch(console.error);
      }
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopSync();
    app.quit();
  }
  // On macOS: window closes but app stays alive, sync keeps running
});
