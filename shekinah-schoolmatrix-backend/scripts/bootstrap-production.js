/**
 * Script de démarrage production.
 * 1. Attend la base PostgreSQL (retry)
 * 2. Exécute les migrations TypeORM
 * 3. Lance l'application NestJS
 *
 * Usage: node scripts/bootstrap-production.js
 * Variables: DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME, etc.
 */
const path = require('path');
const envFile =
  process.env.NODE_ENV === 'production' ? '.env.prod' : '.env.dev';
require('dotenv').config({ path: path.join(__dirname, '..', envFile) });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { spawn } = require('child_process');
const MAX_RETRIES = 30;
const RETRY_DELAY_MS = 2000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      stdio: 'inherit',
      shell: true,
      cwd: path.join(__dirname, '..'),
      ...opts,
    });
    proc.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`Exit ${code}`)),
    );
    proc.on('error', reject);
  });
}

async function waitForDb() {
  const { Client } = require('pg');
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const client = new Client({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || '5432', 10),
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        connectionTimeoutMillis: 3000,
      });
      await client.connect();
      await client.end();
      console.log('Base PostgreSQL prête.');
      return;
    } catch (err) {
      console.log(
        `Attente base (${i + 1}/${MAX_RETRIES}): ${err.message}`,
      );
      await sleep(RETRY_DELAY_MS);
    }
  }
  throw new Error('Base PostgreSQL indisponible après plusieurs tentatives.');
}

async function main() {
  console.log('Bootstrap production...');
  await waitForDb();
  console.log('Exécution des migrations...');
  await run('npm', ['run', 'migration:run:prod']).catch((err) => {
    console.warn('Migrations:', err.message);
  });
  console.log('Démarrage de l\'application...');
  await run('node', ['dist/main.js']);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
