/**
 * En DEV : démarre Postgres `shekinah-db-dev` puis Nest --watch.
 * Utilisation : npm run dev
 *
 * Ne touche PAS au stack Server école (schoolmatrix_*_server) ni au cloud GCP.
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const containerName = 'shekinah-db-dev';
const repoRoot = path.resolve(__dirname, '..', '..');
const composeFile = path.join(repoRoot, 'dev', 'docker-compose.postgres.yml');

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: 'inherit', shell: true, ...opts });
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`Exit ${code}`))));
    proc.on('error', reject);
  });
}

async function ensureDevPostgres() {
  console.log(`Démarrage Postgres DEV (${containerName})...`);
  try {
    await run('docker', ['start', containerName]);
    return;
  } catch {
    // conteneur absent → créer via compose DEV
  }

  if (!fs.existsSync(composeFile)) {
    console.warn(
      `Conteneur ${containerName} introuvable et compose manquant: ${composeFile}`,
    );
    console.warn('Crée-le avec: npm run dev:db (depuis la racine du repo)');
    return;
  }

  console.log('Conteneur absent — création via dev/docker-compose.postgres.yml ...');
  await run('docker', ['compose', '-f', composeFile, 'up', '-d']);
}

async function main() {
  await ensureDevPostgres().catch((err) => {
    console.warn('(Postgres DEV non démarré automatiquement)', err.message || err);
  });
  console.log('Lancement du backend Nest (start:dev)...');
  await run('npm', ['run', 'start:dev'], { cwd: path.join(__dirname, '..') });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
