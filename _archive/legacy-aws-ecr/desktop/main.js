/**
 * Shekinah SchoolMatrix — application desktop (repart de zéro).
 *
 * 1) Premier lancement : choix du dossier des données → copie des fichiers + création dossiers/.env → fenêtre "À faire" (pas de démarrage des conteneurs).
 * 2) Lancements suivants : si les conteneurs existent → les démarrer et afficher le frontend ; sinon → fenêtre "À faire" (instructions + bouton Mettre à jour).
 *
 * On ne tente jamais de lancer les conteneurs tant qu’ils n’existent pas.
 */
const { app, BrowserWindow, nativeImage, dialog, Menu, shell, ipcMain } = require('electron');
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

const DEFAULT_FRONTEND_URL = 'http://localhost:3001';
const CHECK_INTERVAL_MS = 2000;
const MAX_WAIT_MS = 120000;
const APP_LOGO = path.join(__dirname, 'App logo.png');

const CONTAINER_NAMES_DEV = ['shekinah-db-dev', 'schoolmatrix-api', 'schoolmatrix-web'];
const CONTAINER_NAMES_PROD = ['schoolmatrix-db-prod-local', 'schoolmatrix-api', 'schoolmatrix-web'];

const DEV_MODE_FLAG = process.argv.includes('--dev') || process.argv.includes('-d');
const SETUP_ONLY_FLAG = process.argv.includes('--setup');

const SUBDIRS = ['storage', 'storage/uploads', 'storage/profiles', 'storage/backups', 'postgres_data'];
const SCRIPTS_TO_COPY = [
  'prepare-prod-local.js', 'start-prod-local.js', 'start-prod-local-build.js',
  'update-prod-local-ecr.js', 'login-ecr.js', 'check-prod-local-update.js', 'ecr-version-utils.js',
  'env.template', 'env.prod.local.template',
];
const COMPOSE_FILES = ['docker-compose.prod-local.yml', 'docker-compose.prod-local-ecr.yml'];

// --- Config ---

function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function loadConfig() {
  try {
    const cfg = JSON.parse(fs.readFileSync(getConfigPath(), 'utf8'));
    return {
      dataDir: cfg.dataDir || cfg.projectRoot || null,
      devMode: cfg.devMode,
      frontendUrl: cfg.frontendUrl || DEFAULT_FRONTEND_URL,
      installationComplete: cfg.installationComplete === true,
    };
  } catch {
    return { dataDir: null, devMode: undefined, frontendUrl: DEFAULT_FRONTEND_URL, installationComplete: false };
  }
}

function saveConfig(config) {
  const dir = path.dirname(getConfigPath());
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const out = {
    dataDir: config.dataDir ?? null,
    projectRoot: config.dataDir ?? null,
    devMode: config.devMode,
    frontendUrl: config.frontendUrl || DEFAULT_FRONTEND_URL,
    installationComplete: config.installationComplete === true,
  };
  fs.writeFileSync(getConfigPath(), JSON.stringify(out, null, 2));
}

function isInstallationComplete() {
  const cfg = loadConfig();
  if (!cfg.installationComplete || !cfg.dataDir) return false;
  return fs.existsSync(cfg.dataDir) && hasProductionSetup(cfg.dataDir);
}

function setDataDir(dir) {
  const cfg = loadConfig();
  cfg.dataDir = dir;
  cfg.projectRoot = dir;
  saveConfig(cfg);
}

// --- Ressources ---

function getBundledResourcesDir() {
  if (app.isPackaged && process.resourcesPath) return process.resourcesPath;
  return path.join(__dirname, '..');
}

function hasProductionSetup(folder) {
  if (!folder) return false;
  return fs.existsSync(path.join(folder, 'scripts', 'prepare-prod-local.js'))
    && fs.existsSync(path.join(folder, 'docker-compose.prod-local-ecr.yml'));
}

function hasDockerCompose(folder) {
  if (!folder) return false;
  return fs.existsSync(path.join(folder, 'docker-compose.yml'))
    || fs.existsSync(path.join(folder, 'docker-compose.prod-local-ecr.yml'));
}

function copyResourcesToDataDir(dataDir) {
  const srcRoot = getBundledResourcesDir();
  const srcScripts = path.join(srcRoot, 'scripts');
  const destScripts = path.join(dataDir, 'scripts');
  if (!fs.existsSync(destScripts)) fs.mkdirSync(destScripts, { recursive: true });
  for (const name of SCRIPTS_TO_COPY) {
    const src = path.join(srcScripts, name);
    const dest = path.join(destScripts, name);
    if (fs.existsSync(src) && !fs.existsSync(dest)) fs.copyFileSync(src, dest);
  }
  for (const name of COMPOSE_FILES) {
    const src = path.join(srcRoot, name);
    const dest = path.join(dataDir, name);
    if (fs.existsSync(src) && !fs.existsSync(dest)) fs.copyFileSync(src, dest);
  }
}

function runPrepareInProcess(dataDir) {
  const normalized = dataDir.split(path.sep).join('/');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  for (const sub of SUBDIRS) {
    const full = path.join(dataDir, sub);
    if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
  }
  const scriptsDir = path.join(dataDir, 'scripts');
  const envPath = path.join(dataDir, '.env');
  if (!fs.existsSync(envPath)) {
    let content = '';
    const tpl = path.join(scriptsDir, 'env.template');
    if (fs.existsSync(tpl)) content = fs.readFileSync(tpl, 'utf8');
    else content = 'SCHOOLMATRIX_DATA=\n';
    if (content.includes('SCHOOLMATRIX_DATA=')) {
      content = content.replace(/^SCHOOLMATRIX_DATA=.*/m, `SCHOOLMATRIX_DATA=${normalized}`);
    } else {
      content = `SCHOOLMATRIX_DATA=${normalized}\n` + content;
    }
    fs.writeFileSync(envPath, content, 'utf8');
  }
  const envProdPath = path.join(dataDir, '.env.prod');
  if (!fs.existsSync(envProdPath)) {
    const tplProd = path.join(scriptsDir, 'env.prod.local.template');
    const tpl = path.join(scriptsDir, 'env.template');
    let content = fs.existsSync(tplProd)
      ? fs.readFileSync(tplProd, 'utf8')
      : (fs.existsSync(tpl) ? fs.readFileSync(tpl, 'utf8') : 'DB_HOST=db\nDB_PORT=5432\nDB_USER=schoolmatrix\nDB_PASS=schoolmatrix\nDB_NAME=schoolmatrix\nJWT_SECRET=\n');
    fs.writeFileSync(envProdPath, content, 'utf8');
  }
}

/** Retourne true si au moins un des conteneurs existe (docker inspect). */
function containersExist(dataDir) {
  const names = hasProductionSetup(dataDir) ? CONTAINER_NAMES_PROD : CONTAINER_NAMES_DEV;
  try {
    const r = spawnSync('docker', ['inspect', '--format', '{{.Name}}', ...names], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return r.status === 0 && r.stdout && r.stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/** Configuration du dossier des données (choix + copie + préparation). Retourne dataDir ou null. */
async function runDataDirSetup() {
  const { canceled, filePaths } = await dialog.showOpenDialog(null, {
    title: 'Shekinah SchoolMatrix — Dossier des données',
    message: 'Choisissez le dossier où seront créées les bases (PostgreSQL, stockage, .env, docker-compose). Vous pouvez créer un nouveau dossier.',
    properties: ['openDirectory'],
    buttonLabel: 'Sélectionner',
  });
  if (canceled || !filePaths?.length) return null;
  const dataDir = path.normalize(filePaths[0]);

  copyResourcesToDataDir(dataDir);
  runPrepareInProcess(dataDir);
  setDataDir(dataDir);
  return dataDir;
}

/** Obtient le dossier des données : déjà configuré ou setup. */
async function getOrCreateDataDir() {
  const cfg = loadConfig();
  const dataDir = cfg.dataDir || cfg.projectRoot;
  if (dataDir && fs.existsSync(dataDir) && hasProductionSetup(dataDir)) return dataDir;
  if (dataDir && hasDockerCompose(dataDir)) return dataDir;

  const devRoot = path.join(__dirname, '..');
  if (DEV_MODE_FLAG && hasDockerCompose(devRoot)) return devRoot;

  return await runDataDirSetup();
}

// --- Panneau « À faire » (conteneurs absents) ---

function getInstructionsHtml(dataDir) {
  const dir = (dataDir || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: system-ui; padding: 24px; max-width: 520px; margin: 0 auto; }
  h2 { color: #0d9488; margin-top: 0; }
  p { line-height: 1.5; color: #333; }
  .path { background: #f1f5f9; padding: 8px 12px; border-radius: 6px; word-break: break-all; font-size: 13px; }
  ol { padding-left: 20px; }
  .btn { display: inline-block; margin: 8px 8px 8px 0; padding: 10px 16px; background: #0d9488; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; text-decoration: none; }
  .btn:hover { background: #0f766e; }
  .btn.secondary { background: #64748b; }
  .btn.secondary:hover { background: #475569; }
</style></head><body>
  <h2>Shekinah SchoolMatrix</h2>
  <p>L'environnement est prêt. Les conteneurs Docker n'existent pas encore.</p>
  <p><strong>Dossier des données :</strong></p>
  <div class="path">${(dataDir || '').replace(/</g, '&lt;')}</div>
  <p>Pour créer et démarrer les conteneurs :</p>
  <ol>
    <li>Complétez le fichier <strong>.env</strong> dans ce dossier (ECR_REGISTRY, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY).</li>
    <li>Cliquez sur <strong>Mettre à jour depuis ECR</strong> ci-dessous (nécessite Node.js et AWS CLI), ou exécutez manuellement dans ce dossier :<br><code>node scripts/update-prod-local-ecr.js</code></li>
    <li>Relancez l'application.</li>
  </ol>
  <button class="btn" id="openFolder">Ouvrir le dossier des données</button>
  <button class="btn" id="runUpdate">Mettre à jour depuis ECR</button>
  <button class="btn secondary" id="quit">Quitter</button>
  <script>
    document.getElementById('openFolder').onclick = () => require('electron').ipcRenderer.send('open-folder');
    document.getElementById('runUpdate').onclick = () => require('electron').ipcRenderer.send('run-update');
    document.getElementById('quit').onclick = () => require('electron').ipcRenderer.send('quit');
  </script>
</body></html>`;
}

function createInstructionsWindow(dataDir) {
  const win = new BrowserWindow({
    width: 560,
    height: 420,
    icon: APP_LOGO,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(getInstructionsHtml(dataDir)));
  win.on('closed', () => app.quit());
  return win;
}

// --- Démarrer les conteneurs ---

function getContainerNames(dataDir) {
  return hasProductionSetup(dataDir) ? CONTAINER_NAMES_PROD : CONTAINER_NAMES_DEV;
}

function startContainers(dataDir) {
  const names = getContainerNames(dataDir);
  return new Promise((resolve, reject) => {
    const proc = spawn('docker', ['start', ...names], {
      shell: true,
      env: { ...process.env, SCHOOLMATRIX_DATA: dataDir },
    });
    proc.on('close', (code) => {
      if (code === 0) return resolve();
      reject(new Error('CONTAINERS_MISSING'));
    });
    proc.on('error', reject);
  });
}

function checkFrontendAvailable(url) {
  const u = url || DEFAULT_FRONTEND_URL;
  return new Promise((resolve) => {
    const req = http.get(u, { timeout: 3000 }, (res) => resolve(res.statusCode >= 200 && res.statusCode < 400));
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function waitForFrontend(frontendUrl, start = Date.now()) {
  return checkFrontendAvailable(frontendUrl).then((ok) => {
    if (ok) return true;
    if (Date.now() - start > MAX_WAIT_MS) throw new Error('Délai dépassé : frontend non disponible.');
    return new Promise((r) => setTimeout(r, CHECK_INTERVAL_MS)).then(() => waitForFrontend(frontendUrl, start));
  });
}

function createMainWindow(frontendUrl) {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: APP_LOGO,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  win.loadURL(frontendUrl || DEFAULT_FRONTEND_URL);
  win.on('closed', () => app.quit());
  return win;
}

function createAppMenu(dataDir) {
  const template = [
    {
      label: 'Fichier',
      submenu: [
        { label: 'Ouvrir le dossier des données', click: () => dataDir && shell.openPath(dataDir) },
        { label: 'Mettre à jour depuis ECR', click: () => app.emit('run-update') },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Shekinah SchoolMatrix',
      submenu: [
        {
          label: 'Mode développement (frontend local)',
          type: 'checkbox',
          checked: loadConfig().devMode,
          click: (menuItem) => {
            const c = loadConfig();
            c.devMode = menuItem.checked;
            saveConfig(c);
            dialog.showMessageBox(null, { type: 'info', title: 'Préférences', message: 'Redémarrez l\'application.' });
          },
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// --- Mise à jour ECR (script Node) ---

let updateLogWindow = null;

function runUpdateScript(dataDir) {
  const scriptPath = path.join(dataDir, 'scripts', 'update-prod-local-ecr.js');
  if (!fs.existsSync(scriptPath)) {
    dialog.showErrorBox('Erreur', 'Script introuvable : ' + scriptPath);
    return;
  }
  // Fenêtre de log pour que l'utilisateur voie la sortie (sinon rien ne s'affiche en .exe)
  if (updateLogWindow && !updateLogWindow.isDestroyed()) updateLogWindow.close();
  updateLogWindow = new BrowserWindow({
    width: 560,
    height: 420,
    title: 'Mise à jour depuis ECR',
    icon: APP_LOGO,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  updateLogWindow.loadFile(path.join(__dirname, 'update-log.html'));
  updateLogWindow.on('closed', () => { updateLogWindow = null; });

  const logPath = path.join(dataDir, 'update-ecr.log');
  function sendLog(text) {
    const s = text.toString().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (updateLogWindow && !updateLogWindow.isDestroyed()) {
      updateLogWindow.webContents.send('update-log', s);
    }
    try {
      fs.appendFileSync(logPath, s, 'utf8');
    } catch (_) {}
  }

  const child = spawn('node', [scriptPath], {
    cwd: dataDir,
    env: { ...process.env, SCHOOLMATRIX_DATA: dataDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => sendLog(d.toString()));
  child.stderr.on('data', (d) => sendLog(d.toString()));
  child.on('close', (code) => {
    sendLog('\n[Sortie du script : code ' + code + ']\n');
    const error = code !== 0 ? 'Code ' + code + '. Vérifiez le .env (ECR_REGISTRY, AWS), Node.js et Docker.' : null;
    if (updateLogWindow && !updateLogWindow.isDestroyed()) {
      updateLogWindow.webContents.send('update-done', { code, error });
    } else if (code !== 0) {
      dialog.showErrorBox('Erreur', error || 'La mise à jour a échoué.');
    }
  });
  child.on('error', (err) => {
    sendLog('Erreur: ' + (err.message || err) + '\n');
    if (updateLogWindow && !updateLogWindow.isDestroyed()) {
      updateLogWindow.webContents.send('update-done', { code: 1, error: err.message });
    }
    dialog.showErrorBox('Erreur', 'Impossible de lancer le script : ' + err.message);
  });
}

function closeUpdateLogWindow() {
  if (updateLogWindow && !updateLogWindow.isDestroyed()) updateLogWindow.close();
}

// --- Installer (wizard) ---

let installerWindow = null;

function createInstallerWindow() {
  installerWindow = new BrowserWindow({
    width: 700,
    height: 560,
    icon: APP_LOGO,
    resizable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  installerWindow.loadFile(path.join(__dirname, 'installer.html'));
  installerWindow.on('closed', () => {
    installerWindow = null;
    if (!loadConfig().installationComplete) app.quit();
  });
  return installerWindow;
}

function registerInstallerIPC() {
  ipcMain.handle('installer:choose-data-folder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(installerWindow, {
      title: 'Dossier des données',
      message: 'Choisissez ou créez le dossier (bases, stockage, configuration).',
      properties: ['openDirectory'],
      buttonLabel: 'Sélectionner',
    });
    if (canceled || !filePaths?.length) return null;
    return path.normalize(filePaths[0]).replace(/\\/g, '/');
  });

  ipcMain.handle('installer:check-prereqs', () => {
    const result = [];
    try {
      const r = spawnSync('node', ['--version'], { encoding: 'utf8', timeout: 3000 });
      result.push({ name: 'Node.js', ok: r.status === 0 && r.stdout, url: 'https://nodejs.org/' });
    } catch {
      result.push({ name: 'Node.js', ok: false, url: 'https://nodejs.org/' });
    }
    try {
      const r = spawnSync('docker', ['--version'], { encoding: 'utf8', timeout: 3000 });
      result.push({ name: 'Docker', ok: r.status === 0 && r.stdout, url: 'https://www.docker.com/products/docker-desktop/' });
    } catch {
      result.push({ name: 'Docker', ok: false, url: 'https://www.docker.com/products/docker-desktop/' });
    }
    try {
      const r = spawnSync('aws', ['--version'], { encoding: 'utf8', timeout: 3000 });
      result.push({ name: 'AWS CLI', ok: r.status === 0 && r.stdout, url: 'https://aws.amazon.com/cli/' });
    } catch {
      result.push({ name: 'AWS CLI', ok: false, url: 'https://aws.amazon.com/cli/' });
    }
    return result;
  });

  ipcMain.handle('installer:write-env-and-prepare', async (event, { dataFolder, env }) => {
    const root = path.resolve(dataFolder);
    if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
    for (const sub of SUBDIRS) {
      const full = path.join(root, sub);
      if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
    }
    copyResourcesToDataDir(root);

    const envLines = [
      '# Généré par l\'installateur Shekinah SchoolMatrix',
      `SCHOOLMATRIX_DATA=${env.SCHOOLMATRIX_DATA || root.split(path.sep).join('/')}`,
      `DB_USER=${env.DB_USER || 'schoolmatrix'}`,
      `DB_PASS=${env.DB_PASS || 'schoolmatrix'}`,
      `DB_NAME=${env.DB_NAME || 'schoolmatrix'}`,
      `ECR_REGISTRY=${env.ECR_REGISTRY || ''}`,
      `AWS_REGION=${env.AWS_REGION || 'us-east-2'}`,
      `IMAGE_TAG=${env.IMAGE_TAG || 'latest'}`,
      `AWS_ACCESS_KEY_ID=${env.AWS_ACCESS_KEY_ID || ''}`,
      `AWS_SECRET_ACCESS_KEY=${env.AWS_SECRET_ACCESS_KEY || ''}`,
      `AWS_S3_BUCKET=${env.AWS_S3_BUCKET || ''}`,
      `AWS_S3_PREFIX=${env.AWS_S3_PREFIX || 'schoolmatrix'}`,
    ].join('\n');
    fs.writeFileSync(path.join(root, '.env'), envLines, 'utf8');

    const envProdLines = [
      'DB_HOST=db',
      'DB_PORT=5432',
      `DB_USER=${env.DB_USER || 'schoolmatrix'}`,
      `DB_PASS=${env.DB_PASS || 'schoolmatrix'}`,
      `DB_NAME=${env.DB_NAME || 'schoolmatrix'}`,
      `JWT_SECRET=${env.JWT_SECRET || 'change-me-in-production'}`,
    ].join('\n');
    fs.writeFileSync(path.join(root, '.env.prod'), envProdLines, 'utf8');
  });

  /** Lance le téléchargement ECR et envoie la sortie en temps réel au renderer (installer:ecr-output, installer:ecr-done). */
  ipcMain.handle('installer:start-pull-ecr', async (event, dataFolder) => {
    const scriptPath = path.join(dataFolder, 'scripts', 'update-prod-local-ecr.js');
    if (!fs.existsSync(scriptPath)) {
      return { success: false, error: 'Script introuvable : ' + scriptPath };
    }
    const sender = event.sender;
    return new Promise((resolve) => {
      let stderr = '';
      const child = spawn('node', [scriptPath], {
        cwd: dataFolder,
        env: { ...process.env, SCHOOLMATRIX_DATA: dataFolder },
      });
      const sendLine = (text, isStderr) => {
        if (!sender || sender.isDestroyed()) return;
        sender.send('installer:ecr-output', { line: text, stderr: isStderr });
      };
      child.stdout.on('data', (d) => sendLine(d.toString(), false));
      child.stderr.on('data', (d) => {
        const t = d.toString();
        stderr += t;
        sendLine(t, true);
      });
      child.on('close', (code) => {
        const success = code === 0;
        const error = success ? null : (stderr.trim() || 'Code de sortie ' + code);
        if (sender && !sender.isDestroyed()) sender.send('installer:ecr-done', { success, error });
        resolve({ success, error });
      });
      child.on('error', (err) => {
        const error = err.message || String(err);
        if (sender && !sender.isDestroyed()) sender.send('installer:ecr-done', { success: false, error });
        resolve({ success: false, error });
      });
    });
  });

  ipcMain.handle('installer:finish', async (event, { dataFolder, launchNow }) => {
    setDataDir(dataFolder);
    const cfg = loadConfig();
    cfg.installationComplete = true;
    saveConfig(cfg);
    if (installerWindow && !installerWindow.isDestroyed()) {
      installerWindow.removeAllListeners('closed');
      installerWindow.close();
      installerWindow = null;
    }
    if (launchNow) runMainApp(dataFolder);
    else app.quit();
  });
}

async function runMainApp(dataDir) {
  createAppMenu(dataDir);
  ipcMain.on('open-folder', () => {
    const d = loadConfig().dataDir;
    if (d) shell.openPath(d);
  });
  // Menu "Mettre à jour" utilise app.emit ; le bouton de la fenêtre instructions utilise ipcRenderer.send
  app.on('run-update', () => {
    const d = loadConfig().dataDir;
    if (d) runUpdateScript(d);
    else dialog.showErrorBox('Erreur', 'Aucun dossier de données configuré. Lancez l\'installation d\'abord.');
  });
  ipcMain.on('run-update', () => {
    const d = loadConfig().dataDir;
    if (d) runUpdateScript(d);
    else dialog.showErrorBox('Erreur', 'Aucun dossier de données configuré.');
  });
  ipcMain.on('update-window-close', () => closeUpdateLogWindow());
  ipcMain.on('quit', () => app.quit());

  let cfg = loadConfig();
  if (DEV_MODE_FLAG) {
    cfg.devMode = true;
    saveConfig(cfg);
  }
  if (cfg.devMode === undefined || cfg.devMode === null) {
    const { response } = await dialog.showMessageBox(null, {
      type: 'question',
      title: 'Mode',
      message: 'Utilisez-vous le frontend de développement (npm run dev) ?',
      buttons: ['Mode développement', 'Mode production (Docker)'],
      defaultId: 1,
    });
    cfg.devMode = response === 0;
    saveConfig(cfg);
  }

  if (cfg.devMode) {
    const ok = await checkFrontendAvailable(cfg.frontendUrl || DEFAULT_FRONTEND_URL);
    if (!ok) {
      dialog.showErrorBox('Frontend non disponible', 'Démarrez le frontend (npm run dev) puis relancez.');
      app.quit();
      return;
    }
    createMainWindow(cfg.frontendUrl || DEFAULT_FRONTEND_URL);
    return;
  }

  if (!containersExist(dataDir)) {
    createInstructionsWindow(dataDir);
    return;
  }

  try {
    await startContainers(dataDir);
    let ok = await checkFrontendAvailable(DEFAULT_FRONTEND_URL);
    if (!ok) await waitForFrontend(DEFAULT_FRONTEND_URL);
    createMainWindow(DEFAULT_FRONTEND_URL);
  } catch (err) {
    if (err.message === 'CONTAINERS_MISSING') {
      createInstructionsWindow(dataDir);
    } else {
      dialog.showErrorBox('Erreur', err.message);
      app.quit();
    }
  }
}

// --- Point d'entrée ---

app.whenReady().then(async () => {
  if (SETUP_ONLY_FLAG) {
    const dataDir = await runDataDirSetup();
    if (dataDir) {
      dialog.showMessageBox(null, {
        type: 'info',
        title: 'Configuration terminée',
        message: 'Dossier des données : ' + dataDir + '\n\nRelancez l\'application.',
      });
    }
    app.quit();
    return;
  }

  if (!isInstallationComplete()) {
    createInstallerWindow();
    registerInstallerIPC();
    return;
  }

  const dataDir = loadConfig().dataDir;
  if (!dataDir || !fs.existsSync(dataDir)) {
    const cfg = loadConfig();
    cfg.dataDir = null;
    cfg.installationComplete = false;
    saveConfig(cfg);
    createInstallerWindow();
    registerInstallerIPC();
    return;
  }

  await runMainApp(dataDir);
});

app.on('window-all-closed', () => app.quit());
