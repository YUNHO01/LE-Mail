#!/usr/bin/env node
/**
 * Cross-platform (Windows / Linux) helper to build, test, and run services/imap.v2 (Rust).
 * Usage: node services/imap.v2/scripts/run-cargo.js <build|test|dev|start> [extra cargo args...]
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const serviceDir = path.resolve(__dirname, '..');
const mode = process.argv[2] || 'build';
const extraArgs = process.argv.slice(3);

function buildEnv() {
  const env = { ...process.env };
  const pathKey = Object.keys(env).find((k) => k.toLowerCase() === 'path') || 'PATH';
  const currentPath = env[pathKey] || '';
  const prepend = [];

  // ~/.cargo/bin
  const cargoBin = path.join(os.homedir(), '.cargo', 'bin');
  if (fs.existsSync(cargoBin)) {
    prepend.push(cargoBin);
  }

  // Windows: WinLibs MinGW-w64 (for x86_64-pc-windows-gnu toolchain)
  if (process.platform === 'win32' && env.LOCALAPPDATA) {
    const wingetPkgs = path.join(env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Packages');
    if (fs.existsSync(wingetPkgs)) {
      try {
        const dirs = fs.readdirSync(wingetPkgs).filter((d) => d.startsWith('BrechtSanders.WinLibs'));
        for (const d of dirs) {
          const mingwBin = path.join(wingetPkgs, d, 'mingw64', 'bin');
          if (fs.existsSync(mingwBin)) {
            prepend.push(mingwBin);
            break;
          }
        }
      } catch {
        // ignore
      }
    }
  }

  if (prepend.length > 0) {
    env[pathKey] = [...prepend, currentPath].filter(Boolean).join(path.delimiter);
  }
  return env;
}

function getBinaryPath() {
  const binName = process.platform === 'win32' ? 'lemail-imap.exe' : 'lemail-imap';
  return path.join(serviceDir, 'target', 'release', binName);
}

const env = buildEnv();

if (mode === 'start') {
  const binPath = getBinaryPath();
  if (!fs.existsSync(binPath)) {
    console.error(`[imap.v2] Release binary not found: ${binPath}`);
    console.error('[imap.v2] Run "yarn imap:v2:build" first.');
    process.exit(1);
  }
  const res = spawnSync(binPath, extraArgs, { cwd: serviceDir, env, stdio: 'inherit' });
  process.exit(res.status ?? 1);
}

let cargoArgs;
switch (mode) {
  case 'build':
    cargoArgs = ['build', '--release', ...extraArgs];
    break;
  case 'test':
    cargoArgs = ['test', ...extraArgs];
    break;
  case 'dev':
    cargoArgs = ['run', ...extraArgs];
    break;
  default:
    console.error(`[imap.v2] Unknown mode: ${mode}. Use build|test|dev|start.`);
    process.exit(1);
}

const cargoCmd = process.platform === 'win32' ? 'cargo.exe' : 'cargo';
const res = spawnSync(cargoCmd, cargoArgs, { cwd: serviceDir, env, stdio: 'inherit' });
if (res.error) {
  console.error(`[imap.v2] Failed to execute ${cargoCmd}: ${res.error.message}`);
  process.exit(1);
}
process.exit(res.status ?? 0);
