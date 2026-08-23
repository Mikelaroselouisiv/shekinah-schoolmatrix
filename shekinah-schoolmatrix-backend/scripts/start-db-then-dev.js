/**
 * Alias : backend DEV sur la base locale (shekinah-db-dev).
 * Voir start-dev-backend.js (local | mirror).
 */
const { spawn } = require('child_process');
const path = require('path');

const child = spawn(process.execPath, [path.join(__dirname, 'start-dev-backend.js'), 'local'], {
  stdio: 'inherit',
});
child.on('exit', (code) => process.exit(code ?? 1));
