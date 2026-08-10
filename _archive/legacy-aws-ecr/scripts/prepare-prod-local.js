/**
 * Préparation automatique du dossier de données pour la production locale Windows.
 * Crée le dossier racine, les sous-dossiers (storage, postgres_data), .env et .env.prod si absents.
 * Idempotent : ne jamais écraser dossiers ou fichiers existants.
 * Peut être appelé par Electron depuis le dossier d'installation ou par start-prod-local.js.
 *
 * Utilisation :
 *   node scripts/prepare-prod-local.js
 *   node scripts/prepare-prod-local.js D:/Data/SchoolMatrix
 *   SCHOOLMATRIX_DATA=D:/Data/SchoolMatrix node scripts/prepare-prod-local.js
 *
 * Depuis le dossier d'installation (Electron) : pas de SCHOOLMATRIX_DATA → utilise le dossier contenant les scripts.
 */
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_DATA_ROOT = 'C:/SchoolMatrix';

const SUBDIRS = [
  'storage',
  'storage/uploads',
  'storage/profiles',
  'storage/backups',
  'postgres_data',
];

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key && val !== undefined) env[key] = val;
  }
  return env;
}

function isProjectRepo() {
  return fs.existsSync(path.join(PROJECT_ROOT, 'shekinah-schoolmatrix-backend'));
}

function getDataRoot() {
  const argRoot = process.argv[2];
  if (argRoot && typeof argRoot === 'string' && argRoot.trim() && !argRoot.trim().startsWith('-')) {
    return path.resolve(argRoot.trim());
  }
  if (process.env.SCHOOLMATRIX_DATA) {
    return path.resolve(process.env.SCHOOLMATRIX_DATA.trim());
  }
  const envPath = path.join(PROJECT_ROOT, '.env');
  const env = loadEnvFile(envPath);
  if (env.SCHOOLMATRIX_DATA) {
    return path.resolve(env.SCHOOLMATRIX_DATA.trim());
  }
  if (!isProjectRepo()) {
    return PROJECT_ROOT;
  }
  return path.resolve(DEFAULT_DATA_ROOT);
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`Créé : ${dirPath}`);
  }
}

function prepare() {
  const dataRootRaw = getDataRoot();
  const dataRoot = path.resolve(dataRootRaw);
  console.log(`Dossier racine des données : ${dataRoot}`);

  ensureDir(dataRoot);

  for (const sub of SUBDIRS) {
    ensureDir(path.join(dataRoot, sub));
  }

  const envProdPath = path.join(dataRoot, '.env.prod');
  if (!fs.existsSync(envProdPath)) {
    const templatePath = path.join(__dirname, 'env.template');
    const fallbackTemplate = path.join(__dirname, 'env.prod.local.template');
    const src = fs.existsSync(templatePath) ? templatePath : fallbackTemplate;
    if (!fs.existsSync(src)) {
      throw new Error(`Template introuvable : ${templatePath} ou ${fallbackTemplate}`);
    }
    let content = fs.readFileSync(src, 'utf8');
    const projectEnv = loadEnvFile(path.join(PROJECT_ROOT, '.env'));
    if (projectEnv.DB_USER) content = content.replace(/^DB_USER=.*/m, `DB_USER=${projectEnv.DB_USER}`);
    if (projectEnv.DB_PASS) content = content.replace(/^DB_PASS=.*/m, `DB_PASS=${projectEnv.DB_PASS}`);
    if (projectEnv.DB_NAME) content = content.replace(/^DB_NAME=.*/m, `DB_NAME=${projectEnv.DB_NAME}`);
    fs.writeFileSync(envProdPath, content, 'utf8');
    console.log(`Créé : ${envProdPath} (depuis le template)`);
  }

  const dataRootEnvPath = path.join(dataRoot, '.env');
  if (!fs.existsSync(dataRootEnvPath)) {
    const templatePath = path.join(__dirname, 'env.template');
    const normalizedRoot = dataRoot.split(path.sep).join('/');
    let content = fs.existsSync(templatePath)
      ? fs.readFileSync(templatePath, 'utf8')
      : `SCHOOLMATRIX_DATA=${normalizedRoot}\n`;
    if (content.indexOf('SCHOOLMATRIX_DATA=') !== -1) {
      content = content.replace(/^SCHOOLMATRIX_DATA=.*/m, `SCHOOLMATRIX_DATA=${normalizedRoot}`);
    } else {
      content = `SCHOOLMATRIX_DATA=${normalizedRoot}\n` + content;
    }
    fs.writeFileSync(dataRootEnvPath, content, 'utf8');
    console.log(`Créé : ${dataRootEnvPath} (depuis le template)`);
  }

  if (dataRoot !== PROJECT_ROOT) {
    const projectEnvPath = path.join(PROJECT_ROOT, '.env');
    if (!fs.existsSync(projectEnvPath)) {
      const examplePath = path.join(PROJECT_ROOT, '.env.example');
      if (fs.existsSync(examplePath)) {
        let content = fs.readFileSync(examplePath, 'utf8');
        const normalizedRoot = dataRoot.split(path.sep).join('/');
        content = content.replace(/^SCHOOLMATRIX_DATA=.*/m, `SCHOOLMATRIX_DATA=${normalizedRoot}`);
        fs.writeFileSync(projectEnvPath, content, 'utf8');
        console.log(`Créé : ${projectEnvPath} (depuis .env.example)`);
      }
    }
  }

  return dataRoot;
}

if (require.main === module) {
  try {
    const root = prepare();
    console.log('Préparation terminée.');
    if (process.send) process.send({ dataRoot: root });
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
}

module.exports = { prepare, getDataRoot, isProjectRepo, PROJECT_ROOT, DEFAULT_DATA_ROOT };
