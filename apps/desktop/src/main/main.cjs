/**
 * Shekinah SchoolMatrix — Electron unifié (Server | Remote).
 * UI = Vite/React (renderer). Server démarre aussi la stack Docker locale + sync-agent.
 */
const { app, BrowserWindow, ipcMain, dialog, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { getAppEdition } = require('./edition.cjs');
const { PUBLIC_API_BASE_URL, LOCAL_API_BASE_URL } = require('./update-feed.cjs');
const { ensureServerStack } = require('./server-bootstrap.cjs');
const { initUpdater } = require('./updater.cjs');
const { restoreKeyboardFocus, registerKeyboardFocusIpc } = require('./keyboard-focus.cjs');

const edition = getAppEdition();
const apiBase =
  (process.env.SCHOOLMATRIX_API_BASE || '').trim() ||
  (edition === 'server' ? LOCAL_API_BASE_URL : PUBLIC_API_BASE_URL);
const isDev = !!process.env.VITE_DEV_SERVER_URL;

// Lab DEV : la fenêtre miroir a besoin de sa propre session, sinon elle partage
// le token de la fenêtre école et les deux nœuds se confondent.
const userDataOverride = (process.env.SCHOOLMATRIX_USER_DATA || '').trim();
if (userDataOverride) {
  app.setPath(
    'userData',
    path.isAbsolute(userDataOverride)
      ? userDataOverride
      : path.join(os.tmpdir(), userDataOverride),
  );
} else if (isDev && /:3001\b/.test(apiBase)) {
  app.setPath('userData', path.join(os.tmpdir(), 'eureka-sm-dev-mirror'));
}

let mainWindow = null;

function resolveIcon() {
  const candidates = [
    path.join(process.resourcesPath || '', 'icon.ico'),
    path.join(process.resourcesPath || '', 'icon.png'),
    path.join(__dirname, '../../build/icon.ico'),
    path.join(__dirname, '../../build/icon.png'),
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) {
      const img = nativeImage.createFromPath(p);
      if (!img.isEmpty()) return img;
    }
  }
  return undefined;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    show: false,
    title: edition === 'server' ? 'SchoolMatrix Server' : 'SchoolMatrix Remote',
    icon: resolveIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Installateur (file://) → API HTTP : sans ça, Chromium peut bloquer les appels.
      webSecurity: isDev,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('focus', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.webContents.focus();
      } catch {
        /* ignore */
      }
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    if (process.env.ELECTRON_OPEN_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }
}

function setAppMenu() {
  const template = [
    {
      label: 'SchoolMatrix',
      submenu: [
        {
          label: 'Vérifier les mises à jour',
          click: () => {
            if (mainWindow) mainWindow.webContents.send('updater:menu-check');
          },
        },
        { type: 'separator' },
        { role: 'quit', label: 'Quitter' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.on('app:get-edition-sync', (event) => {
  event.returnValue = edition;
});
ipcMain.on('app:get-api-base-sync', (event) => {
  event.returnValue = apiBase;
});
registerKeyboardFocusIpc(ipcMain, BrowserWindow, dialog);

/** Fetch binaire hors renderer (pas de CORS) — logos / photos badges PDF. */
ipcMain.handle('app:fetch-media', async (_event, url) => {
  try {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url.trim())) return null;
    const res = await fetch(url.trim(), { redirect: 'follow' });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) return null;
    return {
      base64: buf.toString('base64'),
      contentType: res.headers.get('content-type') || 'application/octet-stream',
    };
  } catch {
    return null;
  }
});

async function boot() {
  app.setName(
    edition === 'server'
      ? 'Shekinah SchoolMatrix Server'
      : 'Shekinah SchoolMatrix Remote',
  );
  if (process.platform === 'win32') {
    app.setAppUserModelId(
      edition === 'server'
        ? 'com.shekinah.schoolmatrix.desktop.server'
        : 'com.shekinah.schoolmatrix.desktop.remote',
    );
  }

  createWindow();
  setAppMenu();
  initUpdater();

  if (edition === 'server' && !isDev) {
    const stack = await ensureServerStack();
    if (!stack.ok && mainWindow) {
      await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'API locale',
        message: stack.message || 'Impossible de démarrer la stack Server.',
      });
      restoreKeyboardFocus(mainWindow);
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

app.whenReady().then(boot);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
