# Desktop App — Plan 1: Scaffold

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the `apps/desktop` Electron package with a working dev runner that opens a blank window.

**Architecture:** Turborepo workspace at `apps/desktop`. Main process written in TypeScript, run via `tsx` in dev. Renderer is a static `index.html` loaded via `loadFile`. `concurrently` runs both in dev. No bundler for the renderer — Electron loads the HTML file directly.

**Tech Stack:** Electron 34+, TypeScript, tsx, concurrently

**Prerequisites:** None. This is the first plan.

---

## File Structure

```
apps/desktop/
├── package.json
├── tsconfig.json
└── src/
    ├── main/
    │   └── index.ts          ← BrowserWindow creation, app lifecycle
    ├── preload/
    │   └── preload.ts        ← empty contextBridge scaffold
    └── renderer/
        ├── index.html        ← blank page with "PJDrive loading..."
        ├── styles.css        ← CSS variables only
        └── app.js            ← empty for now
```

---

### Task 1: Create apps/desktop package

**Files:**
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/tsconfig.json`

- [ ] **Step 1: Create apps/desktop/package.json**

```json
{
  "name": "@pjdrive/desktop",
  "version": "0.0.1",
  "main": "dist/main/index.js",
  "scripts": {
    "dev": "concurrently \"npm run dev:main\" \"npm run dev:electron\"",
    "dev:main": "tsc --watch --preserveWatchOutput",
    "dev:electron": "sleep 3 && electron .",
    "build": "tsc",
    "start": "electron ."
  },
  "dependencies": {
    "@pjdrive/sync": "*",
    "axios": "^1.7.2",
    "eventsource": "^2.0.2"
  },
  "devDependencies": {
    "@types/eventsource": "^1.1.15",
    "concurrently": "^8.2.2",
    "electron": "^34.0.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create apps/desktop/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "paths": {
      "@pjdrive/sync/*": ["../sync/src/*"]
    }
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Install dependencies from repo root**

```bash
npm install
```

Expected: `@pjdrive/desktop` workspace resolved, `electron` installed.

---

### Task 2: Main process entry point

**Files:**
- Create: `apps/desktop/src/main/index.ts`
- Create: `apps/desktop/src/preload/preload.ts`

- [ ] **Step 1: Create apps/desktop/src/main/index.ts**

```typescript
import { app, BrowserWindow } from 'electron';
import path from 'path';

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
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 2: Create apps/desktop/src/preload/preload.ts**

```typescript
import { contextBridge } from 'electron';

// Placeholder — will be expanded in Plan 2
contextBridge.exposeInMainWorld('api', {});
```

---

### Task 3: Renderer scaffold

**Files:**
- Create: `apps/desktop/src/renderer/index.html`
- Create: `apps/desktop/src/renderer/styles.css`
- Create: `apps/desktop/src/renderer/app.js`

- [ ] **Step 1: Create apps/desktop/src/renderer/index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'" />
  <title>PJDrive</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <div id="app">
    <p>PJDrive loading...</p>
  </div>
  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create apps/desktop/src/renderer/styles.css**

```css
:root {
  --bg: #ffffff;
  --surface: #f8fafc;
  --border: #e2e8f0;
  --text: #1e293b;
  --text-muted: #64748b;
  --accent: #3b82f6;
  --accent-hover: #2563eb;
  --green: #22c55e;
  --amber: #f59e0b;
  --red: #ef4444;
  --radius: 8px;
  --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: var(--font);
  background: var(--bg);
  color: var(--text);
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

#app { width: 100%; height: 100vh; }
```

- [ ] **Step 3: Create apps/desktop/src/renderer/app.js**

```javascript
// Placeholder — will be expanded in Plans 2 and 4
console.log('PJDrive renderer loaded');
console.log('window.api available:', typeof window.api);
```

---

### Task 4: Verify the app opens

- [ ] **Step 1: Build the TypeScript**

```bash
cd apps/desktop && npx tsc
```

Expected: `dist/main/index.js` and `dist/preload/preload.js` created, zero TypeScript errors.

- [ ] **Step 2: Run the app**

```bash
cd apps/desktop && npx electron .
```

Expected: An Electron window opens (400×380px, not resizable) showing "PJDrive loading...". DevTools console shows "PJDrive renderer loaded" and "window.api available: object".

- [ ] **Step 3: Verify contextIsolation is working**

Open DevTools in the window (View → Toggle Developer Tools). In the console, type:

```javascript
window.api
// Expected: {} (empty object — preload worked)

require
// Expected: ReferenceError: require is not defined (contextIsolation working correctly)
```
