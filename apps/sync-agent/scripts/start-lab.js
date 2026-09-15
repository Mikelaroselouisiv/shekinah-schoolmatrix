/**
 * Agent sync LOCAL (:3000) ↔ miroir cloud LOCAL (:3001).
 * Refuse explicitement la VM GCP : le seed DEV ne doit jamais partir en ligne.
 */
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const DEFAULT_REMOTE = 'http://127.0.0.1:3001';
const remote = (process.env.REMOTE_API_URL || DEFAULT_REMOTE).trim();
const local = (process.env.LOCAL_API_URL || 'http://127.0.0.1:3000').trim();

if (/34\.95\.43\.132|googleapis|shekinah-schoolmatrix\.|run\.app/i.test(remote)) {
  console.error('[sync-lab] Refus : REMOTE_API_URL pointe vers le cloud GCP.');
  console.error('[sync-lab] Pour le lab : http://127.0.0.1:3001 uniquement.');
  process.exit(1);
}

const env = {
  ...process.env,
  LOCAL_API_URL: local,
  REMOTE_API_URL: remote,
  SYNC_API_KEY: process.env.SYNC_API_KEY || 'parallele-dev-sync-lab',
  SYNC_NODE_ID: process.env.SYNC_NODE_ID || 'local-mother',
  SYNC_KICK_PORT: process.env.SYNC_KICK_PORT || '3911',
};

console.log(`[sync-lab] ${local}  ↔  ${remote}`);
const here = path.dirname(fileURLToPath(import.meta.url));
const child = spawn(process.execPath, [path.join(here, '..', 'src', 'index.js')], {
  stdio: 'inherit',
  env,
});
child.on('exit', (code) => process.exit(code ?? 1));
