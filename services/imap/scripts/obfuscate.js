const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const distDir = path.resolve(__dirname, '../dist');

if (!fs.existsSync(distDir)) {
  console.error(`❌ dist 디렉토리가 존재하지 않습니다: ${distDir}`);
  process.exit(1);
}

// dist 내의 모든 파일을 재귀 탐색
function getAllFiles(dir) {
  let results = [];
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

async function obfuscateDist() {
  console.log('🚀 [javascript-obfuscator] services/imap dist 폴더 텍스트 난독화 시작...');

  const allFiles = getAllFiles(distDir);

  // 1. 소스맵(.map) 및 타입 정의(.d.ts, .d.ts.map) 제거
  let removedCount = 0;
  for (const file of allFiles) {
    if (file.endsWith('.js.map') || file.endsWith('.d.ts') || file.endsWith('.d.ts.map')) {
      fs.unlinkSync(file);
      removedCount++;
    }
  }
  if (removedCount > 0) {
    console.log(`🧹 불필요한 메타데이터 및 소스맵 ${removedCount}개 파일 정리 완료.`);
  }

  // 2. 남은 .js 파일 수집
  const remainingFiles = getAllFiles(distDir);
  const jsFiles = remainingFiles.filter((file) => file.endsWith('.js'));

  console.log(`📦 총 ${jsFiles.length}개의 JavaScript 파일을 난독화 처리합니다.`);

  let obfuscatedCount = 0;
  for (const jsFile of jsFiles) {
    try {
      const sourceCode = fs.readFileSync(jsFile, 'utf8');
      const obfuscationResult = JavaScriptObfuscator.obfuscate(sourceCode, obfuscatorOptions);
      fs.writeFileSync(jsFile, obfuscationResult.getObfuscatedCode(), 'utf8');
      obfuscatedCount++;
    } catch (err) {
      console.error(`❌ 난독화 실패 [${path.relative(distDir, jsFile)}]:`, err);
      process.exit(1);
    }
  }

  console.log(`✅ [services/imap] ${obfuscatedCount}개 파일 난독화 완료!\n`);
}

obfuscateDist().catch((err) => {
  console.error('❌ 난독화 처리 중 에러 발생:', err);
  process.exit(1);
});
