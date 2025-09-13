'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function log(msg) {
  console.log(`[postinstall] ${msg}`);
}
function warn(msg) {
  console.warn(`[postinstall] ${msg}`);
}

function canRequireNodePty() {
  try {
    require('node-pty');
    return true;
  } catch (_) {
    return false;
  }
}

// Skip if already OK
if (canRequireNodePty()) {
  log('node-pty native addon present. Skipping rebuild.');
  process.exit(0);
}

log('node-pty native addon missing. Attempting local rebuild...');

// Resolve node-pty install directory
let ptyDir;
try {
  const p = require.resolve('node-pty/package.json');
  ptyDir = path.dirname(p);
} catch (e) {
  warn('Could not resolve node-pty. Is it installed?');
  process.exit(0);
}

// Candidate ways to run node-gyp
const candidates = [];

// 1) npm exposes node-gyp path via env in lifecycle scripts
if (process.env.npm_config_node_gyp) {
  candidates.push({
    cmd: process.execPath,
    args: [process.env.npm_config_node_gyp, 'rebuild'],
    why: 'npm_config_node_gyp'
  });
}

// 2) node-gyp on PATH
candidates.push({ cmd: 'node-gyp', args: ['rebuild'], why: 'PATH node-gyp' });

// 3) npm’s bundled node-gyp via global npm root
try {
  const npmRoot = spawnSync('npm', ['root', '-g'], { encoding: 'utf8' });
  if (npmRoot.status === 0) {
    const root = npmRoot.stdout.trim();
    const gypJs = path.join(root, 'npm', 'node_modules', 'node-gyp', 'bin', 'node-gyp.js');
    if (fs.existsSync(gypJs)) {
      candidates.push({ cmd: process.execPath, args: [gypJs, 'rebuild'], why: 'global npm node-gyp' });
    }
  }
} catch (_) {}

function tryBuild() {
  for (const c of candidates) {
    try {
      log(`Rebuilding with ${c.why}...`);
      const r = spawnSync(c.cmd, c.args, { cwd: ptyDir, stdio: 'inherit' });
      if (r.status === 0) return true;
    } catch (_) {}
  }
  return false;
}

const built = tryBuild();
if (!built) {
  warn('node-pty rebuild did not complete. Installation will continue.');
  warn('If runtime fails, run a manual rebuild:');
  warn('  node "$(npm root -g)/npm/node_modules/node-gyp/bin/node-gyp.js" -C node_modules/node-pty rebuild');
  process.exit(0);
}

// Verify again
if (canRequireNodePty()) {
  log('node-pty rebuilt successfully.');
} else {
  warn('node-pty still not loadable after rebuild.');
}

