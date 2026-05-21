# Desktop App — Plan 4: Polish + Window Sizing

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix window sizing (Login=380px, Dashboard=500px), add relative timestamps that update, add the app to the Turborepo workspace, and wire the Turbo dev script.

**Architecture:** Window height is toggled dynamically in main process when transitioning from Login to Dashboard. Timestamps refresh every 30s in the renderer via `setInterval`. The desktop app is added to `turbo.json` so `turbo dev` starts it alongside api and web.

**Tech Stack:** Electron BrowserWindow.setSize, IPC, Turborepo

**Prerequisites:** Plan 3 complete — full sync working.

---

### Task 1: Dynamic window sizing on screen transition

The Login screen needs 380px height, the Dashboard needs 500px. The renderer tells main when the screen changes via a new IPC channel.

**Files:**
- Modify: `apps/desktop/src/main/ipc.ts`
- Modify: `apps/desktop/src/preload/preload.ts`
- Modify: `apps/desktop/src/renderer/app.js`

- [ ] **Step 1: Add window:resize IPC handler to ipc.ts**

Add to `registerIpcHandlers()` in `apps/desktop/src/main/ipc.ts`:

```typescript
ipcMain.handle('window:resize', async (_event, screen: 'login' | 'dashboard') => {
  if (!mainWindow) return;
  const height = screen === 'login' ? 380 : 500;
  mainWindow.setSize(400, height, true); // true = animate on macOS
});
```

- [ ] **Step 2: Expose window.api.window.resize in preload.ts**

In `apps/desktop/src/preload/preload.ts`, add a `window` namespace to the exposed API:

```typescript
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
    resize: (screen: 'login' | 'dashboard') => ipcRenderer.invoke('window:resize', screen),
  },
  onActivity: (callback: (event: { type: string; fileName: string; timestamp: string }) => void) => {
    ipcRenderer.on('activity', (_event, data) => callback(data));
  },
});
```

- [ ] **Step 3: Call window.api.window.resize in app.js**

Update `showScreen` in `apps/desktop/src/renderer/app.js` to resize the window:

```javascript
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(`screen-${name}`).classList.remove('hidden');
  if (window.api?.window?.resize) {
    window.api.window.resize(name === 'login' ? 'login' : 'dashboard');
  }
}
```

- [ ] **Step 4: Build and verify window sizing**

```bash
cd apps/desktop && npx tsc && npx electron .
```

Expected:
- Login screen: window is 400×380px
- After login: window animates to 400×500px
- After logout: window animates back to 400×380px

---

### Task 2: Refresh relative timestamps

Currently `relativeTime()` is called once when an item is added. Items showing "just now" never update to "5m ago". Fix with a periodic refresh.

**Files:**
- Modify: `apps/desktop/src/renderer/app.js`

- [ ] **Step 1: Store timestamps and refresh them periodically**

Add to `app.js` — replace the `addActivityItem` function and add a timestamp refresh loop:

```javascript
// Store raw timestamps alongside DOM items
const activityTimestamps = new Map(); // li element → ISO string

function addActivityItem(event) {
  const list = document.getElementById('activity-list');
  const empty = list.querySelector('.activity-empty');
  if (empty) empty.remove();

  const arrow = event.type === 'upload' ? '↑' : '↓';
  const li = document.createElement('li');
  li.className = 'activity-item';

  const timeSpan = document.createElement('span');
  timeSpan.className = 'activity-time';
  timeSpan.textContent = relativeTime(event.timestamp);

  li.innerHTML = `
    <span class="activity-arrow">${arrow}</span>
    <span class="activity-name" title="${event.fileName}">${event.fileName}</span>
  `;
  li.appendChild(timeSpan);

  activityTimestamps.set(li, event.timestamp);
  list.prepend(li);

  while (list.children.length > MAX_ACTIVITY) {
    const removed = list.lastChild;
    activityTimestamps.delete(removed);
    list.removeChild(removed);
  }
}

// Refresh all timestamps every 30 seconds
setInterval(() => {
  activityTimestamps.forEach((isoString, li) => {
    const timeSpan = li.querySelector('.activity-time');
    if (timeSpan) timeSpan.textContent = relativeTime(isoString);
  });
}, 30000);
```

- [ ] **Step 2: Verify timestamps update**

Run the app, perform a sync action, wait 1 minute. Expected: "just now" changes to "1m ago" without page reload.

---

### Task 3: Add desktop to Turbo workspace

**Files:**
- Modify: `turbo.json`
- Modify: root `package.json` (verify workspaces already includes `apps/*`)

- [ ] **Step 1: Verify root package.json workspaces**

Check that `apps/*` is already in workspaces:

```bash
cat package.json | grep workspaces -A 3
```

Expected output includes `"apps/*"`. If not, add `"apps/desktop"` to the workspaces array.

- [ ] **Step 2: Verify turbo.json includes dev task**

```bash
cat turbo.json
```

Expected: `dev` task exists with `"persistent": true`. No changes needed — `apps/desktop` with a `dev` script is automatically picked up.

- [ ] **Step 3: Test turbo dev with desktop**

```bash
# From repo root — starts api + web + desktop together
DATABASE_URL=postgres://localhost:5432/pjdrive S3_ENDPOINT=http://localhost:9002 npx turbo run dev --filter=@pjdrive/api --filter=@pjdrive/web --filter=@pjdrive/desktop
```

Expected: all three start. API on port 3000, web on port 5173, Electron window opens.

---

### Task 4: Final end-to-end checklist

- [ ] **Step 1: Full flow test**

1. Start API + MinIO
2. Run `npx electron .` from `apps/desktop`
3. Login screen appears at 400×380px
4. Login with valid credentials — window expands to 400×500px, Dashboard appears
5. Status dot is green (SSE connected)
6. Drop a file into `sync-folder/` — activity list shows `↑ filename  just now`
7. Upload a file via web app — activity list shows `↓ filename  just now`
8. Click [Open] — Finder/Explorer opens to sync-folder
9. Click Logout — window shrinks to 380px, Login screen appears
10. Quit and reopen — Dashboard appears automatically (auto-login from safeStorage)

- [ ] **Step 2: Verify safeStorage is actually encrypted**

```bash
# Find the stored token file
ls ~/Library/Application\ Support/Electron/
```

Expected: `pjdrive-jwt.enc` exists and is binary/encrypted (not readable text). `pjdrive-email.txt` exists and contains the email address in plain text (only token is encrypted).

- [ ] **Step 3: Add desktop to .gitignore**

Add to `.gitignore`:
```
apps/desktop/dist/
```

Verify:
```bash
cat .gitignore | grep desktop
```

Expected: `apps/desktop/dist/` present.
