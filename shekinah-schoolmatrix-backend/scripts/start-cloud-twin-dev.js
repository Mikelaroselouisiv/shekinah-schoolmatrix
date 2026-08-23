/**
 * Alias : même chose que `npm run dev:backend:mirror` (API :3001).
 */
const { spawn } = require('child_process');
const path = require('path');

const child = spawn(process.execPath, [path.join(__dirname, 'start-dev-backend.js'), 'mirror'], {
  stdio: 'inherit',
});
child.on('exit', (code) => process.exit(code ?? 1));
