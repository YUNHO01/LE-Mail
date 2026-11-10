const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const archiver = require('archiver');
const JavaScriptObfuscator = require('javascript-obfuscator');

// 1. 루트 경로 및 설정
const rootDir = path.resolve(__dirname, '..');
const binDir = path.join(rootDir, 'bin');
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

const version = packageJson.version || '1.0.0';
const isObfuscate = process.argv.includes('--obfuscate');

// 날짜 포맷 (YYYYMMDD)
const now = new Date();
const year = now.getFullYear();
const month = String(now.getMonth() + 1).padStart(2, '0');
const day = String(now.getDate()).padStart(2, '0');
const dateStr = `${year}${month}${day}`;

const modeSuffix = isObfuscate ? '_obfuscated' : '';
const archiveName = `lemail_v${version}_${dateStr}${modeSuffix}.zip`;
const stagingDir = path.join(binDir, `lemail_v${version}_${dateStr}${modeSuffix}`);
const zipFilePath = path.join(binDir, archiveName);

console.log('======================================================================');
console.log(`📦 [LEMail 패키징 배포] 버전: v${version} | 빌드일자: ${dateStr} | 모드: ${isObfuscate ? '난독화(javascript-obfuscator)' : '표준 컴파일'}`);
console.log('======================================================================');

// 디렉터리 재귀 복사 헬퍼 함수
function copyDirSync(src, dest, ignoreList = []) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (ignoreList.includes(entry.name)) {
      continue;
    }

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath, ignoreList);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// 파일 목록 재귀 탐색 함수
function getAllFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllFiles(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

// 안전 난독화 옵션
const obfuscatorOptions = {
  compact: true,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  debugProtection: false,
  disableConsoleOutput: false,
  identifierNamesGenerator: 'mangled',
  log: false,
  numbersToExpressions: false,
  renameGlobals: false,
  renameProperties: false,
  rotateStringArray: true,
  selfDefending: false,
  simplify: true,
  splitStrings: false,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.8,
  transformObjectKeys: false,
  unicodeEscapeSequence: false,
  target: 'node',
};

async function runPackaging() {
  // 3. 빌드 실행 확인/진행
  console.log('\n[1/5] 🛠️ 빌드 산출물 확인 및 생성...');

  console.log('  -> 공유 타입 패키지 빌드 (yarn --cwd packages/shared-types build)...');
  execSync('yarn --cwd packages/shared-types build', { stdio: 'inherit', cwd: rootDir });

  if (isObfuscate) {
    console.log('  -> apps/api 난독화 컴파일 (yarn --cwd apps/api build:obfuscate)...');
    execSync('yarn --cwd apps/api build:obfuscate', { stdio: 'inherit', cwd: rootDir });

    console.log('  -> services/imap 난독화 컴파일 (yarn --cwd services/imap build:obfuscate)...');
    execSync('yarn --cwd services/imap build:obfuscate', { stdio: 'inherit', cwd: rootDir });
  } else {
    console.log('  -> apps/api 표준 컴파일 (yarn --cwd apps/api build)...');
    execSync('yarn --cwd apps/api build', { stdio: 'inherit', cwd: rootDir });

    console.log('  -> services/imap 표준 컴파일 (yarn --cwd services/imap build)...');
    execSync('yarn --cwd services/imap build', { stdio: 'inherit', cwd: rootDir });
  }

  console.log('  -> apps/web 프로덕션 빌드 (yarn --cwd apps/web build)...');
  execSync('yarn --cwd apps/web build', { stdio: 'inherit', cwd: rootDir });

  // 4. bin 디렉터리 준비
  console.log('\n[2/5] 📁 bin 스테이징 디렉터리 초기화...');
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  if (fs.existsSync(stagingDir)) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
  fs.mkdirSync(stagingDir, { recursive: true });

  // 5. 고객사 전달 배포 패키지 파일 복사
  console.log('\n[3/5] 🚚 배포 패키지 구성요소 복사 중...');

  // (1) 루트 설정 파일 (운영 전용 경량화 package.json)
  console.log('  -> 루트 운영 전용 package.json, yarn.lock 복사');
  const prodRootPkg = {
    name: packageJson.name || 'lemail-monorepo',
    version: version,
    private: true,
    workspaces: [
      'apps/*',
      'packages/*',
      'services/*'
    ],
    scripts: {
      "start": "yarn start:all",
      "start:all": "concurrently \"yarn start:api\" \"yarn start:web\" \"yarn start:imap\" \"yarn start:haraka\"",
      "start:api": "yarn --cwd apps/api start:prod",
      "start:web": "yarn --cwd apps/web start",
      "start:imap": "yarn --cwd services/imap start",
      "start:haraka": "yarn --cwd services/haraka start"
    },
    devDependencies: {
      "concurrently": "^10.0.5"
    },
    packageManager: "yarn@1.22.22"
  };
  fs.writeFileSync(path.join(stagingDir, 'package.json'), JSON.stringify(prodRootPkg, null, 2), 'utf8');

  if (fs.existsSync(path.join(rootDir, 'yarn.lock'))) {
    fs.copyFileSync(path.join(rootDir, 'yarn.lock'), path.join(stagingDir, 'yarn.lock'));
  }

  // (2) packages/shared-types 복사
  console.log('  -> packages/shared-types 복사');
  copyDirSync(
    path.join(rootDir, 'packages', 'shared-types'),
    path.join(stagingDir, 'packages', 'shared-types'),
    ['node_modules', '.turbo', 'src']
  );

  // (3) apps/api (dist, swagger.json, .env.example, 운영 전용 package.json)
  console.log(`  -> apps/api ${isObfuscate ? '난독화' : '표준'} 산출물 및 운영 전용 package.json 복사`);
  const apiDest = path.join(stagingDir, 'apps', 'api');
  fs.mkdirSync(apiDest, { recursive: true });

  copyDirSync(path.join(rootDir, 'apps', 'api', 'dist'), path.join(apiDest, 'dist'));

  const originalApiPkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'apps', 'api', 'package.json'), 'utf8'));
  const prodApiPkg = {
    name: originalApiPkg.name,
    version: originalApiPkg.version,
    private: true,
    scripts: {
      "start": "node dist/index.js",
      "start:prod": "node dist/index.js"
    },
    dependencies: originalApiPkg.dependencies
  };
  fs.writeFileSync(path.join(apiDest, 'package.json'), JSON.stringify(prodApiPkg, null, 2), 'utf8');

  if (fs.existsSync(path.join(rootDir, 'apps', 'api', 'swagger.json'))) {
    fs.copyFileSync(path.join(rootDir, 'apps', 'api', 'swagger.json'), path.join(apiDest, 'swagger.json'));
  }
  if (fs.existsSync(path.join(rootDir, 'apps', 'api', '.env.example'))) {
    fs.copyFileSync(path.join(rootDir, 'apps', 'api', '.env.example'), path.join(apiDest, '.env.example'));
  }

  // (4) apps/web (.next, public, scripts, next.config.mjs, 운영 전용 package.json)
  console.log('  -> apps/web 프론트엔드 산출물 및 운영 전용 package.json 복사');
  const webDest = path.join(stagingDir, 'apps', 'web');
  fs.mkdirSync(webDest, { recursive: true });

  copyDirSync(path.join(rootDir, 'apps', 'web', '.next'), path.join(webDest, '.next'), ['cache']);
  copyDirSync(path.join(rootDir, 'apps', 'web', 'public'), path.join(webDest, 'public'));
  copyDirSync(path.join(rootDir, 'apps', 'web', 'scripts'), path.join(webDest, 'scripts'));

  const originalWebPkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'apps', 'web', 'package.json'), 'utf8'));
  const prodWebPkg = {
    name: originalWebPkg.name,
    version: originalWebPkg.version,
    private: true,
    scripts: {
      "start": "node scripts/start.js"
    },
    dependencies: originalWebPkg.dependencies
  };
  fs.writeFileSync(path.join(webDest, 'package.json'), JSON.stringify(prodWebPkg, null, 2), 'utf8');
  if (fs.existsSync(path.join(rootDir, 'apps', 'web', 'next.config.mjs'))) {
    fs.copyFileSync(path.join(rootDir, 'apps', 'web', 'next.config.mjs'), path.join(webDest, 'next.config.mjs'));
  }
  if (fs.existsSync(path.join(rootDir, 'apps', 'web', '.env.example'))) {
    fs.copyFileSync(path.join(rootDir, 'apps', 'web', '.env.example'), path.join(webDest, '.env.example'));
  }

  // (5) services/imap 복사
  console.log(`  -> services/imap ${isObfuscate ? '난독화' : '표준'} 산출물 및 운영 전용 package.json 복사`);
  const imapDest = path.join(stagingDir, 'services', 'imap');
  fs.mkdirSync(imapDest, { recursive: true });

  copyDirSync(path.join(rootDir, 'services', 'imap', 'dist'), path.join(imapDest, 'dist'));

  const originalImapPkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'services', 'imap', 'package.json'), 'utf8'));
  const prodImapPkg = {
    name: originalImapPkg.name,
    version: originalImapPkg.version,
    private: true,
    main: "dist/index.js",
    scripts: {
      "start": "node dist/index.js"
    },
    dependencies: originalImapPkg.dependencies
  };
  fs.writeFileSync(path.join(imapDest, 'package.json'), JSON.stringify(prodImapPkg, null, 2), 'utf8');
  if (fs.existsSync(path.join(rootDir, 'services', 'imap', '.env.example'))) {
    fs.copyFileSync(path.join(rootDir, 'services', 'imap', '.env.example'), path.join(imapDest, '.env.example'));
  }

  // (6) services/haraka 복사 및 난독화 처리
  console.log(`  -> services/haraka ${isObfuscate ? '난독화 복사' : '표준 복사'}`);
  const harakaDest = path.join(stagingDir, 'services', 'haraka');
  fs.mkdirSync(harakaDest, { recursive: true });

  copyDirSync(
    path.join(rootDir, 'services', 'haraka'),
    harakaDest,
    ['node_modules', '.turbo', 'docs', 'README']
  );

  if (isObfuscate) {
    console.log('    -> services/haraka 스크립트 파일 난독화 적용 중...');
    const harakaFiles = getAllFiles(harakaDest).filter((f) => f.endsWith('.js'));
    for (const jsFile of harakaFiles) {
      try {
        const srcCode = fs.readFileSync(jsFile, 'utf8');
        const obfuscated = JavaScriptObfuscator.obfuscate(srcCode, obfuscatorOptions);
        fs.writeFileSync(jsFile, obfuscated.getObfuscatedCode(), 'utf8');
      } catch (err) {
        console.error(`❌ haraka 파일 난독화 실패 [${path.relative(harakaDest, jsFile)}]:`, err);
        process.exit(1);
      }
    }
  }

  // (7) 루트 배포 파일 복사
  if (fs.existsSync(path.join(rootDir, '.env.example'))) {
    fs.copyFileSync(path.join(rootDir, '.env.example'), path.join(stagingDir, '.env.example'));
  }
  if (fs.existsSync(path.join(rootDir, 'license_dev.lic'))) {
    fs.copyFileSync(path.join(rootDir, 'license_dev.lic'), path.join(stagingDir, 'license_dev.lic'));
  }
  if (fs.existsSync(path.join(rootDir, 'swagger.json'))) {
    fs.copyFileSync(path.join(rootDir, 'swagger.json'), path.join(stagingDir, 'swagger.json'));
  }

  // (8) docs 가이드 복사 (존재하는 경우)
  const docsSrc = path.join(rootDir, 'docs');
  if (fs.existsSync(docsSrc)) {
    console.log('  -> docs 가이드 복사...');
    copyDirSync(docsSrc, path.join(stagingDir, 'docs'));
  }

  // 6. ZIP 압축 생성
  console.log(`\n[4/5] 🗜️ ZIP 파일 생성 중: ${archiveName}...`);
  if (fs.existsSync(zipFilePath)) {
    fs.unlinkSync(zipFilePath);
  }

  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipFilePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      const sizeMB = (archive.pointer() / (1024 * 1024)).toFixed(2);
      console.log(`  -> 압축 완료! 총 파일 크기: ${sizeMB} MB (${archive.pointer()} bytes)`);
      resolve();
    });

    archive.on('error', (err) => reject(err));

    archive.pipe(output);
    archive.directory(stagingDir, `lemail_v${version}`);
    archive.finalize();
  });

  console.log('\n[5/5] ✅ 패키징 배포 산출물 생성 완료!');
  console.log(`📂 복사 디렉터리: ${stagingDir}`);
  console.log(`🎁 압축 배포 파일: ${zipFilePath}`);
  console.log('======================================================================\n');
}

runPackaging().catch((err) => {
  console.error('❌ 패키징 배포 중 오류 발생:', err);
  process.exit(1);
});
