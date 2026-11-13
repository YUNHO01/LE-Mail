const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const mobileDir = path.resolve(__dirname, '..');
const rootDir = path.resolve(mobileDir, '..', '..');

// 1. 루트 및 apps/mobile 디렉토리의 .env 파일들을 우선순위에 따라 로드
try {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(rootDir, false);
  loadEnvConfig(mobileDir, false);
} catch {
  const candidateDirs = [rootDir, mobileDir];
  for (const dir of candidateDirs) {
    const envFiles = [
      `.env.${process.env.NODE_ENV || 'production'}.local`,
      '.env.local',
      `.env.${process.env.NODE_ENV || 'production'}`,
      '.env',
    ];
    for (const file of envFiles) {
      const filePath = path.join(dir, file);
      if (fs.existsSync(filePath)) {
        try {
          require('dotenv').config({ path: filePath });
        } catch {
          const content = fs.readFileSync(filePath, 'utf8');
          for (const line of content.split('\n')) {
            const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
            if (match && !process.env[match[1]]) {
              process.env[match[1]] = (match[2] || '').trim().replace(/^['"]|['"]$/g, '');
            }
          }
        }
      }
    }
  }
}

// 2. CLI 인자(-p, --port)가 전달된 경우 최우선 적용
const extraArgs = [];
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === '-p' || arg === '--port') {
    if (process.argv[i + 1]) {
      process.env.PORT = process.argv[i + 1];
      i++;
    }
    continue;
  }
  extraArgs.push(arg);
}

const port = process.env.PORT || '9300';
console.log(`\x1b[36m📱 [LEMail Mobile] 포트 ${port}번으로 Next.js 프로덕션 서버를 구동합니다.\x1b[0m`);

const args = ['next', 'start', '-H', '0.0.0.0', '-p', String(port), ...extraArgs];
const isWindows = process.platform === 'win32';

const child = spawn('yarn', args, {
  cwd: mobileDir,
  stdio: 'inherit',
  shell: isWindows,
  env: { ...process.env, PORT: String(port) },
});

const forwardSignal = (sig) => {
  if (child && !child.killed) {
    child.kill(sig);
  }
};

process.on('SIGINT', () => forwardSignal('SIGINT'));
process.on('SIGTERM', () => forwardSignal('SIGTERM'));

child.on('exit', (code) => {
  process.exit(code || 0);
});
