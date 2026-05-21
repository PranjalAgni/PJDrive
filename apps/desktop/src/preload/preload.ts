import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  auth: {
    check: () => ipcRenderer.invoke('auth:check'),
    login: (email: string, password: string) =>
      ipcRenderer.invoke('auth:login', { email, password }),
    logout: () => ipcRenderer.invoke('auth:logout'),
  },
  sync: {
    getStatus: () => ipcRenderer.invoke('sync:status'),
    getFolder: () => ipcRenderer.invoke('sync:folder'),
  },
  folder: {
    open: () => ipcRenderer.invoke('folder:open'),
  },
  window: {
    resize: (screen: 'login' | 'dashboard') =>
      ipcRenderer.invoke('window:resize', screen),
  },
  onActivity: (callback: (event: { type: string; fileName: string; timestamp: string }) => void) => {
    ipcRenderer.on('activity', (_event, data) => callback(data));
  },
});
