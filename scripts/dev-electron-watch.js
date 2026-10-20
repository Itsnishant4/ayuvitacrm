const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const electronBin = path.join(rootDir, 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron');
const viteUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5177';
const watchTargets = [
  path.join(rootDir, 'main.js'),
  path.join(rootDir, 'preload.js'),
  path.join(rootDir, 'database'),
  path.join(rootDir, 'package.json'),
];

let child = null;
let restartTimer = null;
let shuttingDown = false;

function waitForVite(url, timeoutMs = 30000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });

      req.on('error', () => {
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`Timed out waiting for Vite at ${url}`));
          return;
        }
        setTimeout(check, 500);
      });

      req.setTimeout(1000, () => {
        req.destroy();
      });
    };

    check();
  });
}

function startElectron() {
  child = spawn(electronBin, [rootDir], {
    cwd: rootDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'development',
      ELECTRON_RELOAD_DISABLED: 'true',
    },
  });

  child.on('exit', (code, signal) => {
    child = null;
    if (!shuttingDown && signal !== 'SIGTERM') {
      console.log(`[dev-electron] Electron exited (${code ?? signal}). Waiting for file changes...`);
    }
  });
}

function restartElectron(reason) {
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    console.log(`[dev-electron] Restarting Electron after ${reason}...`);

    if (!child || child.killed) {
      startElectron();
      return;
    }

    child.once('exit', () => {
      if (!shuttingDown) startElectron();
    });
    child.kill('SIGTERM');
  }, 150);
}

function watchPath(target) {
  if (!fs.existsSync(target)) return;

  fs.watch(target, { recursive: true }, (eventType, filename) => {
    if (!filename) return;
    const changed = filename.toString();

    if (changed.includes('node_modules') || changed.includes('dist') || changed.includes('dist_electron')) {
      return;
    }

    if (!/\.(js|json|node)$/.test(changed) && !['main.js', 'preload.js', 'package.json'].includes(changed)) {
      return;
    }

    restartElectron(path.relative(rootDir, path.join(target, changed)));
  });
}

function stop() {
  shuttingDown = true;
  if (child && !child.killed) {
    child.kill('SIGTERM');
  }
  process.exit(0);
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);

(async () => {
  try {
    console.log(`[dev-electron] Waiting for Vite at ${viteUrl}...`);
    await waitForVite(viteUrl);
    console.log('[dev-electron] Starting Electron with main-process auto-restart.');
    watchTargets.forEach(watchPath);
    startElectron();
  } catch (error) {
    console.error(`[dev-electron] ${error.message}`);
    process.exit(1);
  }
})();
