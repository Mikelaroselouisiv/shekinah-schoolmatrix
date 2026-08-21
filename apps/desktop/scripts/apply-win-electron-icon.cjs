/**
 * Windows DEV: la barre des tâches affiche l'icône de electron.exe, pas BrowserWindow.
 * On grave build/icon.ico dans node_modules/electron/dist/electron.exe via rcedit.
 */
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

if (process.platform !== 'win32') {
  process.exit(0);
}

const root = path.resolve(__dirname, '..');
const iconIco = path.join(root, 'build', 'icon.ico');
const electronExe = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
const rcedit = path.join(root, 'node_modules', 'rcedit', 'bin', 'rcedit-x64.exe');

function fail(msg) {
  console.warn(`[apply-win-electron-icon] ${msg}`);
  process.exit(0); // ne bloque pas npm install / dev
}

if (!fs.existsSync(iconIco)) fail(`icône manquante: ${iconIco}`);
if (!fs.existsSync(electronExe)) fail(`electron.exe introuvable: ${electronExe}`);
if (!fs.existsSync(rcedit)) fail(`rcedit introuvable: ${rcedit}`);

const stamp = path.join(root, 'node_modules', 'electron', 'dist', '.shekinah-icon-stamp');
const iconStat = fs.statSync(iconIco);
const exeStat = fs.statSync(electronExe);
const expected = `${iconStat.mtimeMs}:${iconStat.size}:${exeStat.size}`;
if (fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8').trim() === expected) {
  process.exit(0);
}

const result = spawnSync(rcedit, [electronExe, '--set-icon', iconIco], {
  encoding: 'utf8',
  windowsHide: true,
});

if (result.status !== 0) {
  fail(
    `rcedit a échoué (ferme Electron puis relance). ${result.stderr || result.stdout || ''}`.trim(),
  );
}

fs.writeFileSync(stamp, expected, 'utf8');
console.log('[apply-win-electron-icon] Icône Shekinah appliquée à electron.exe (barre des tâches DEV)');
