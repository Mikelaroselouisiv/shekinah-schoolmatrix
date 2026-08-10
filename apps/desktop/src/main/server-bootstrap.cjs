/**
 * Édition Server : bootstrap automatique au 1er lancement (machine vierge).
 * Copie server-stack → ProgramData, installe Docker si besoin, démarre Postgres + API + sync-agent.
 */
const { dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const { getAppEdition } = require('./edition.cjs');

function getBundledStackDir() {
  if (process.resourcesPath) {
    const fromResources = path.join(process.resourcesPath, 'server-stack');
    if (fs.existsSync(fromResources)) return fromResources;
  }
  const fromDev = path.join(__dirname, '../../server-stack');
  if (fs.existsSync(fromDev)) return fromDev;
  return null;
}

function getInstalledStackDir() {
  const programData = process.env.ProgramData || 'C:\\ProgramData';
  return path.join(programData, 'Shekinah SchoolMatrix', 'server-stack');
}

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirRecursive(from, to);
    else fs.copyFileSync(from, to);
  }
}

function ensureStackInstalled() {
  const bundled = getBundledStackDir();
  const installed = getInstalledStackDir();
  if (!bundled) {
    throw new Error('Fichiers server-stack introuvables dans l’installateur.');
  }
  // Toujours resynchroniser images + scripts (mise à jour Server) ; préserver secrets/état.
  fs.mkdirSync(installed, { recursive: true });
  for (const entry of fs.readdirSync(bundled, { withFileTypes: true })) {
    if (entry.name === '.env.server' || entry.name === '.bootstrap-done') continue;
    const from = path.join(bundled, entry.name);
    const to = path.join(installed, entry.name);
    if (entry.isDirectory()) copyDirRecursive(from, to);
    else fs.copyFileSync(from, to);
  }
  return installed;
}

function runBootstrap(stackDir) {
  return new Promise((resolve, reject) => {
    const script = path.join(stackDir, 'bootstrap.ps1');
    if (!fs.existsSync(script)) {
      reject(new Error(`Script bootstrap introuvable: ${script}`));
      return;
    }
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-StackDir', stackDir],
      { windowsHide: false },
    );
    let combined = '';
    child.stdout.on('data', (chunk) => {
      combined += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      combined += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else {
        const tail = combined.trim().split(/\r?\n/).slice(-12).join('\n');
        reject(new Error(tail || `bootstrap exit ${code}`));
      }
    });
  });
}

function probeApi(pathname, timeoutMs) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:3000${pathname}`, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function isApiUp(timeoutMs = 3000) {
  if (await probeApi('/setup/status', timeoutMs)) return true;
  return probeApi('/', timeoutMs);
}

async function waitForApi(maxMs = 180000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (await isApiUp(4000)) return true;
    await new Promise((r) => setTimeout(r, 3000));
  }
  return false;
}

function markBootstrapDone(stackDir) {
  const doneFile = path.join(stackDir, '.bootstrap-done');
  if (!fs.existsSync(doneFile)) {
    fs.writeFileSync(doneFile, new Date().toISOString(), 'utf8');
  }
}

/**
 * @returns {Promise<{ ran: boolean, ok: boolean, message?: string }>}
 */
async function ensureServerStack() {
  if (getAppEdition() !== 'server') return { ran: false, ok: true };
  if (process.env.VITE_DEV_SERVER_URL) return { ran: false, ok: true };
  if (process.argv.includes('--dev') || process.argv.includes('-d')) {
    const up = await isApiUp();
    return {
      ran: false,
      ok: up,
      message: up
        ? undefined
        : 'API locale absente (http://127.0.0.1:3000). Démarrez le backend / stack server.',
    };
  }

  let stackDir;
  try {
    stackDir = ensureStackInstalled();
  } catch (err) {
    return {
      ran: false,
      ok: false,
      message: err?.message || String(err),
    };
  }

  const doneFile = path.join(stackDir, '.bootstrap-done');
  const envFile = path.join(stackDir, '.env.server');
  const apiAlreadyUp = await isApiUp();
  const firstRun = !fs.existsSync(doneFile) && !fs.existsSync(envFile) && !apiAlreadyUp;

  if (firstRun) {
    await dialog.showMessageBox({
      type: 'info',
      title: 'Configuration machine Server',
      message:
        'Premier lancement : démarrage du serveur local (Docker).\n\n' +
        'Une fenêtre PowerShell peut s’afficher.\n' +
        'Postgres + API + sync-agent vont démarrer — cela peut prendre plusieurs minutes.',
      buttons: ['Continuer'],
    });
  }

  try {
    await runBootstrap(stackDir);
    const apiUp = await waitForApi(180000);
    if (!apiUp) {
      return {
        ran: true,
        ok: false,
        message:
          'La stack Docker a démarré mais l’API ne répond pas encore sur http://127.0.0.1:3000. Réessayez dans quelques minutes ou redémarrez le PC.',
      };
    }
    markBootstrapDone(stackDir);
    return { ran: firstRun, ok: true };
  } catch (err) {
    if (await isApiUp(5000)) {
      markBootstrapDone(stackDir);
      return { ran: false, ok: true };
    }
    dialog.showErrorBox('SchoolMatrix Server — stack locale', err?.message || String(err));
    return {
      ran: true,
      ok: false,
      message: err?.message || String(err),
    };
  }
}

module.exports = { ensureServerStack, getInstalledStackDir };
