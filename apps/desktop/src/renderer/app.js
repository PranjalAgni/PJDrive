// ── Screen routing ──────────────────────────────────────────────────────────

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(`screen-${name}`).classList.remove('hidden');
  if (window.api?.window?.resize) {
    window.api.window.resize(name === 'login' ? 'login' : 'dashboard');
  }
}

// ── Login screen ────────────────────────────────────────────────────────────

const loginForm  = document.getElementById('login-form');
const loginBtn   = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  loginBtn.disabled = true;
  loginBtn.textContent = 'Logging in...';
  loginError.classList.add('hidden');
  loginError.textContent = '';

  const result = await window.api.auth.login(email, password);

  if (result.ok) {
    await initDashboard();
    showScreen('dashboard');
  } else {
    loginError.textContent = result.error;
    loginError.classList.remove('hidden');
    loginBtn.disabled = false;
    loginBtn.textContent = 'Login';
  }
});

// ── Dashboard screen ─────────────────────────────────────────────────────────

async function initDashboard() {
  const { path: folderPath } = await window.api.sync.getFolder();
  document.getElementById('folder-path').textContent = folderPath;
  await refreshStatus();
}

async function refreshStatus() {
  const status = await window.api.sync.getStatus();
  const dot  = document.getElementById('status-dot');
  const text = document.getElementById('status-text');

  dot.className = 'dot';
  if (status.connected && status.mode === 'sse') {
    dot.classList.add('dot-green');
    text.textContent = `Connected  ${status.email}`;
  } else if (status.connected && status.mode === 'poll') {
    dot.classList.add('dot-amber');
    text.textContent = `Polling  ${status.email}`;
  } else {
    dot.classList.add('dot-off');
    text.textContent = 'Disconnected';
  }
}

// Poll status every 5 seconds when on dashboard
setInterval(() => {
  if (!document.getElementById('screen-dashboard').classList.contains('hidden')) {
    refreshStatus();
  }
}, 5000);

// Logout button
document.getElementById('logout-btn').addEventListener('click', async () => {
  await window.api.auth.logout();
  showScreen('login');
});

// Open folder button
document.getElementById('open-folder-btn').addEventListener('click', () => {
  window.api.folder.open();
});

// ── Activity list ────────────────────────────────────────────────────────────

const MAX_ACTIVITY = 10;
const activityTimestamps = new Map();

function relativeTime(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 10)   return 'just now';
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function addActivityItem(event) {
  const list  = document.getElementById('activity-list');
  const empty = list.querySelector('.activity-empty');
  if (empty) empty.remove();

  const arrow = event.type === 'upload' ? '↑' : '↓';

  const arrowSpan = document.createElement('span');
  arrowSpan.className = 'activity-arrow';
  arrowSpan.textContent = arrow;

  const nameSpan = document.createElement('span');
  nameSpan.className = 'activity-name';
  nameSpan.title = event.fileName;
  nameSpan.textContent = event.fileName;

  const timeSpan = document.createElement('span');
  timeSpan.className = 'activity-time';
  timeSpan.textContent = relativeTime(event.timestamp);

  const li = document.createElement('li');
  li.className = 'activity-item';
  li.appendChild(arrowSpan);
  li.appendChild(nameSpan);
  li.appendChild(timeSpan);

  activityTimestamps.set(li, event.timestamp);
  list.prepend(li);

  while (list.children.length > MAX_ACTIVITY) {
    const removed = list.lastChild;
    activityTimestamps.delete(removed);
    list.removeChild(removed);
  }
}

// Refresh relative timestamps every 30 seconds
setInterval(() => {
  activityTimestamps.forEach((isoString, li) => {
    const timeSpan = li.querySelector('.activity-time');
    if (timeSpan) timeSpan.textContent = relativeTime(isoString);
  });
}, 30000);

// Listen for activity events pushed from main process
window.api.onActivity(addActivityItem);

// ── App startup ──────────────────────────────────────────────────────────────

async function init() {
  const { loggedIn } = await window.api.auth.check();
  if (loggedIn) {
    await initDashboard();
    showScreen('dashboard');
  } else {
    showScreen('login');
  }
}

init();
