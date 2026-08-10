import http from 'http';
import { createApiClient, replicateDirection } from './replicate.js';

const LOCAL_API_URL = process.env.LOCAL_API_URL || 'http://127.0.0.1:3000';
const REMOTE_API_URL = process.env.REMOTE_API_URL || 'http://34.118.138.96';
const SYNC_API_KEY = process.env.SYNC_API_KEY || '';
const SYNC_INTERVAL_MS = Number(process.env.SYNC_INTERVAL_MS || 5_000);
const NODE_ID = process.env.SYNC_NODE_ID || 'local-mother';
const KICK_PORT = Number(process.env.SYNC_KICK_PORT || 3911);

if (!SYNC_API_KEY) {
  console.error('[sync-agent] SYNC_API_KEY requis');
  process.exit(1);
}

const local = createApiClient(LOCAL_API_URL, SYNC_API_KEY);
const remote = createApiClient(REMOTE_API_URL, SYNC_API_KEY);

/** Curseurs en mémoire (restart = catch-up depuis epoch). Composite { t, id }. */
const pullCursors = Object.create(null);
const pushCursors = Object.create(null);

let running = false;
let rerun = false;

async function tick(reason = 'interval') {
  if (running) {
    rerun = true;
    return;
  }
  running = true;
  try {
    do {
      rerun = false;
      const started = Date.now();
      try {
        const pullSummary = await replicateDirection({
          from: remote,
          to: local,
          cursors: pullCursors,
          sourceNodeId: 'gcp',
          label: 'pull-gcp→local',
        });
        console.log('[sync-agent]', JSON.stringify(pullSummary));

        const pushSummary = await replicateDirection({
          from: local,
          to: remote,
          cursors: pushCursors,
          sourceNodeId: NODE_ID,
          label: 'push-local→gcp',
        });
        console.log('[sync-agent]', JSON.stringify(pushSummary));
      } catch (err) {
        const message = err?.response?.data
          ? JSON.stringify(err.response.data)
          : err?.message || String(err);
        console.error('[sync-agent] erreur', message);
      } finally {
        console.log(
          `[sync-agent] tick ${Date.now() - started}ms reason=${reason}`,
        );
        reason = 'rerun';
      }
    } while (rerun);
  } finally {
    running = false;
  }
}

const kickServer = http.createServer((req, res) => {
  if (req.method === 'POST' && (req.url === '/kick' || req.url === '/')) {
    res.writeHead(204);
    res.end();
    void tick('kick');
    return;
  }
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, running }));
    return;
  }
  res.writeHead(404);
  res.end();
});

kickServer.listen(KICK_PORT, '0.0.0.0', () => {
  console.log(`[sync-agent] kick HTTP :${KICK_PORT}/kick`);
});

console.log(
  `[sync-agent] démarrage — local=${LOCAL_API_URL} remote=${REMOTE_API_URL} interval=${SYNC_INTERVAL_MS}ms LWW+kick`,
);
void tick('startup');
setInterval(() => void tick('interval'), SYNC_INTERVAL_MS);
