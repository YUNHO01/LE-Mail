const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const rootPkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const newVersion = rootPkg.version;

console.log(`\n🔄 [post-bump] 내부 워크스페이스 의존성(@lemail/shared-types: ${newVersion}) 동기화 시작...`);

const targetPackages = [
  path.join(rootDir, 'apps', 'api', 'package.json'),
  path.join(rootDir, 'apps', 'web', 'package.json'),
  path.join(rootDir, 'services', 'imap', 'package.json'),
  path.join(rootDir, 'services', 'haraka', 'package.json'),
];

for (const pkgPath of targetPackages) {
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    let changed = false;

    if (pkg.dependencies && pkg.dependencies['@lemail/shared-types']) {
      pkg.dependencies['@lemail/shared-types'] = newVersion;
      changed = true;
    }
    if (pkg.devDependencies && pkg.devDependencies['@lemail/shared-types']) {
      pkg.devDependencies['@lemail/shared-types'] = newVersion;
      changed = true;
    }

    if (changed) {
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
      console.log(`  -> ${path.relative(rootDir, pkgPath)} 의 @lemail/shared-types 버전을 ${newVersion} 으로 갱신했습니다.`);
    }
  }
}

// yarn.lock 갱신 (yarn install)
console.log('  -> yarn.lock 의존성 트리 자동 동기화 중 (yarn install)...');
try {
  execSync('yarn install', { stdio: 'inherit', cwd: rootDir });
  console.log('✅ [post-bump] 내부 의존성 및 yarn.lock 동기화 완료!\n');
} catch (err) {
  console.error('❌ [post-bump] yarn install 실행 실패:', err);
  process.exit(1);
}
