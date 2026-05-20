import EventSource from 'eventsource';
import { startWatcher } from './watcher';
import { downloadFile, deleteLocalFile } from './downloader';
import { getLastSyncAt, setLastSyncAt } from './state';
import axios from 'axios';

const API_URL = process.env.API_URL || 'http://localhost:3000';
const TOKEN = process.env.SYNC_TOKEN || '';
const POLL_INTERVAL_MS = 30000;

let pollInterval: ReturnType<typeof setInterval> | null = null;

const api = axios.create({
  baseURL: API_URL,
  headers: { Authorization: `Bearer ${TOKEN}` },
});

async function processSyncEvent(event: { file_id: string; event_type: string }) {
  try {
    if (event.event_type === 'created' || event.event_type === 'updated') {
      await downloadFile(event.file_id);
    } else if (event.event_type === 'deleted') {
      await deleteLocalFile(event.file_id);
    }
    setLastSyncAt(new Date().toISOString());
  } catch (err) {
    console.error('[sync] failed to process event:', err);
  }
}

function connectSSE() {
  const url = `${API_URL}/sync/events`;
  const es = new EventSource(url, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });

  es.onopen = () => {
    console.log('[sse] connected');
    // Stop polling fallback — SSE is active
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  };

  es.onmessage = async (e) => {
    try {
      const event = JSON.parse(e.data);
      await processSyncEvent(event);
    } catch (err) {
      console.error('[sse] failed to process event:', err);
    }
  };

  es.onerror = () => {
    console.warn('[sse] connection lost — starting polling fallback');
    es.close();
    // Start polling while disconnected
    if (!pollInterval) {
      pollInterval = setInterval(poll, POLL_INTERVAL_MS);
    }
    setTimeout(connectSSE, 5000);
  };

  return es;
}

async function poll() {
  const since = getLastSyncAt();
  try {
    const { data } = await api.get(`/sync/changes?since=${since}`);
    for (const event of data) {
      await processSyncEvent(event);
    }
  } catch (err) {
    console.error('[poll] failed:', err);
  }
}

async function main() {
  if (!TOKEN) {
    console.error('[sync] SYNC_TOKEN env var required. Get it by logging in via the web app and copying the JWT.');
    process.exit(1);
  }

  console.log('[sync] starting PJDrive sync client');

  await poll();     // catch up on missed changes
  startWatcher();   // Local → Remote
  connectSSE();     // Remote → Local (polling starts automatically if SSE fails)
}

main().catch((err) => { console.error(err); process.exit(1); });
