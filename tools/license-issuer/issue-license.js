#!/usr/bin/env node
/**
 * LEMail 라이선스 발급 CLI 도구 (Tools / License Issuer)
 *
 * 사용법:
 * [개발용 발급 - 기본 등록유효기간 14일, 사용기한 무제한(unlimited)]
 * yarn license:issue:dev --org "(주)가장자리" --users 200 --days 14
 *
 * [운영용 발급 - 등록유효기간 7일, 사용기한 무제한(unlimited)]
 * yarn license:issue:prod --org "(주)고객사" --users 300 --days 7
 *
 * [운영용 발급 - 등록유효기간 14일, 사용기한 2027-12-31 지정]
 * yarn license:issue:prod --org "(주)고객사" --users 300 --days 14 --expires "2027-12-31"
 *
 * 옵션:
 * --env <dev|prod>                  : 발급 환경 구분 (dev: 개발, prod: 운영 / 기본값: dev)
 * --org <기관명>                    : 발급 대상 기관명/회사명 (필수)
 * --users <숫자>                    : 최대 허용 활성 사용자(사서함) 수 (기본값: 200)
 * --days <일수>                     : 생성일시 기준 등록 유효 일수 (기본값: 14일, 이 기간 내 등록 필수)
 * --expires <YYYY-MM-DD|unlimited>  : 등록 후 실제 사용 기한 (기본값: unlimited 무제한)
 * --out <파일경로>                  : 별도 추가 출력할 라이선스 파일 경로 (선택)
 * --key <개인키경로>                : RSA 개인키 파일 경로 (기본값: ./keys/license-private.pem)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function normalizeEnv(rawEnv) {
  if (!rawEnv) return 'dev';
  const v = String(rawEnv).trim().toLowerCase();
  if (['prod', 'production', '운영', 'live'].includes(v)) {
    return 'prod';
  }
  if (['dev', 'development', '개발', 'test'].includes(v)) {
    return 'dev';
  }
  return null;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const params = {
    env: 'dev',
    org: '',
    users: 200,
    days: 14,
    expires: 'unlimited',
    out: './license.lic',
    key: path.resolve(__dirname, 'keys', 'license-private.pem'),
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if ((arg === '--env' || arg === '--mode') && args[i + 1]) {
      params.env = args[++i];
    } else if (arg === '--prod') {
      params.env = 'prod';
    } else if (arg === '--dev') {
      params.env = 'dev';
    } else if (arg === '--org' && args[i + 1]) {
      params.org = args[++i];
    } else if (arg === '--users' && args[i + 1]) {
      params.users = parseInt(args[++i], 10);
    } else if (arg === '--days' && args[i + 1]) {
      params.days = parseInt(args[++i], 10);
    } else if (arg === '--expires' && args[i + 1]) {
      params.expires = args[++i];
    } else if (arg === '--out' && args[i + 1]) {
      params.out = args[++i];
    } else if (arg === '--key' && args[i + 1]) {
      params.key = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
[LEMail 라이선스 발급 CLI]
사용법:
  yarn license:issue:dev --org <기관명> [옵션]
  yarn license:issue:prod --org <기관명> [옵션]
  node tools/license-issuer/issue-license.js --env <dev|prod> --org <기관명> [옵션]

옵션:
  --env <dev|prod>                  발급 구분: dev(개발) 또는 prod(운영) (기본: dev)
  --org <기관명>                    발급 기관/회사명 (필수)
  --users <숫자>                    최대 허용 사용자(사서함) 수 (기본: 200)
  --days <일수>                     생성일시 기준 등록 유효 일수 (기본: 14일, 기간 경과 시 등록 불가)
  --expires <YYYY-MM-DD|unlimited>  등록 후 시스템 사용 기한 (생략 시 기본: unlimited 무제한)
  --out <파일경로>                  별도 추가 생성할 파일 경로 (.lic)
  --key <개인키경로>                RSA Private Key 경로
      `);
      process.exit(0);
    }
  }

  return params;
}

function run() {
  const params = parseArgs();
  const targetEnv = normalizeEnv(params.env);

  if (!targetEnv) {
    console.error(`❌ 에러: --env 값은 'dev'(개발) 또는 'prod'(운영)이어야 합니다. (입력값: ${params.env})`);
    process.exit(1);
  }

  const envUpper = targetEnv.toUpperCase();
  const envLabel = targetEnv === 'prod' ? '운영 (PROD)' : '개발 (DEV)';

  if (!params.org || params.org.trim() === '') {
    console.error('❌ 에러: --org <기관명>은 필수 파라미터입니다.');
    console.error('예: yarn license:issue:dev --org "(주)가장자리" --days 14');
    console.error('예: yarn license:issue:prod --org "(주)고객사" --days 14');
    process.exit(1);
  }

  if (isNaN(params.users) || params.users <= 0) {
    console.error('❌ 에러: --users <숫자>는 1 이상의 정수여야 합니다.');
    process.exit(1);
  }

  if (isNaN(params.days) || params.days <= 0) {
    console.error('❌ 에러: --days <일수>는 1 이상의 정수여야 합니다.');
    process.exit(1);
  }

  const nowMs = Date.now();
  const issuedAt = new Date(nowMs).toISOString();

  // 1. 등록 유효기간 (registerExpiresAt): 생성일시로부터 --days 일수만큼 유효
  const registerExpiresAt = new Date(nowMs + params.days * 24 * 60 * 60 * 1000).toISOString();

  // 2. 사용 기한 (expiresAt / isUnlimited): --expires 생략 또는 unlimited 시 무제한
  let expiresAt = null;
  let isUnlimited = true;

  if (!params.expires || params.expires.toLowerCase() === 'unlimited') {
    isUnlimited = true;
    expiresAt = null;
  } else {
    // YYYY-MM-DD 포맷 검증
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(params.expires);
    if (!dateMatch) {
      console.error('❌ 에러: --expires 값은 "YYYY-MM-DD" 형식이거나 "unlimited" 여야 합니다.');
      process.exit(1);
    }
    const targetDate = new Date(`${params.expires}T23:59:59.999+09:00`);
    if (isNaN(targetDate.getTime())) {
      console.error('❌ 에러: 유효하지 않은 날짜 형식입니다.');
      process.exit(1);
    }
    isUnlimited = false;
    expiresAt = targetDate.toISOString();
  }

  if (!fs.existsSync(params.key)) {
    console.error(`❌ 에러: RSA Private Key를 찾을 수 없습니다: ${params.key}`);
    console.error('먼저 `yarn license:generate-keys`를 실행하여 키쌍을 생성하세요.');
    process.exit(1);
  }

  const privateKeyPem = fs.readFileSync(params.key, 'utf-8');

  // 페이로드 구성 (LEMail 전용 식별자 명시)
  const licenseId = 'LEMLIC-' + crypto.randomBytes(8).toString('hex').toUpperCase();

  const payload = {
    licenseId,
    product: 'LEMail',
    productCode: 'LEM',
    organizationName: params.org.trim(),
    maxUsers: params.users,
    registerExpiresAt,
    expiresAt,
    isUnlimited,
    issuedAt,
    features: ['ALL'],
  };

  // Canonical JSON 문자열로 직렬화 (키 순서 정렬)
  const canonicalPayloadString = JSON.stringify(payload, Object.keys(payload).sort());

  // RSA-SHA256 전자서명 생성
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(canonicalPayloadString);
  signer.end();
  const signature = signer.sign(privateKeyPem, 'base64');

  // 최종 라이선스 파일 구조체
  const licenseFile = {
    version: '1.0',
    product: 'LEMail',
    algorithm: 'RSA-SHA256',
    payload,
    signature,
  };

  // 1. 환경별(dev / prod) 년/월/일 아카이브 디렉터리 경로 (tools/license-issuer/{dev|prod}/YYYY/MM/DD)
  const now = new Date(nowMs);
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const formattedDateStr = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

  const archiveDir = path.resolve(__dirname, targetEnv, year, month, day);
  if (!fs.existsSync(archiveDir)) {
    fs.mkdirSync(archiveDir, { recursive: true });
  }

  const safeOrg = params.org.replace(/[/\\?%*:|"<>]/g, '').trim().replace(/\s+/g, '_');
  const archiveFileName = `${safeOrg}_${licenseId}.lic`;
  const archiveFilePath = path.join(archiveDir, archiveFileName);

  // 환경별 날짜 아카이브 디렉터리에 라이선스 파일 생성
  fs.writeFileSync(archiveFilePath, JSON.stringify(licenseFile, null, 2), 'utf-8');

  // 2. 사용자가 별도 --out 경로를 지정한 경우 추가 복사 저장
  let customOutPath = null;
  if (params.out && params.out !== './license.lic') {
    customOutPath = path.resolve(process.cwd(), params.out);
    const outDir = path.dirname(customOutPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    fs.writeFileSync(customOutPath, JSON.stringify(licenseFile, null, 2), 'utf-8');
  }

  // 3. 개발(license-dev.md) / 운영(license-prod.md) 분리된 대장 파일에 발급 이력 기록 관리
  const mdFileName = targetEnv === 'prod' ? 'license-prod.md' : 'license-dev.md';
  const mdFilePath = path.resolve(__dirname, mdFileName);
  if (!fs.existsSync(mdFilePath)) {
    const initialContent =
      targetEnv === 'prod'
        ? `# 📜 LEMail 라이선스 발급 이력 관리 대장 (운영 / PROD)

본 문서는 LEMail(엔터프라이즈 메일 시스템)의 **운영(PROD)** 환경용 정품 라이선스 발급 내역을 기록·관리하는 문서입니다.

| 발급일시 (KST) | 구분 | 라이선스 ID | 제품 | 발급 기관/고객사 | 사용자 정원 | 등록 유효기간 | 사용 기한 | 저장 위치 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
`
        : `# 📜 LEMail 라이선스 발급 이력 관리 대장 (개발 / DEV)

본 문서는 LEMail(엔터프라이즈 메일 시스템)의 **개발/테스트(DEV)** 환경용 라이선스 발급 내역을 기록·관리하는 문서입니다.

| 발급일시 (KST) | 구분 | 라이선스 ID | 제품 | 발급 기관/고객사 | 사용자 정원 | 등록 유효기간 | 사용 기한 | 저장 위치 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
`;
    fs.writeFileSync(mdFilePath, initialContent, 'utf-8');
  }

  const rootDir = path.resolve(__dirname, '../..');
  const relSavePath = path.relative(rootDir, archiveFilePath).replace(/\\/g, '/');
  const regExpiryDesc = `${registerExpiresAt.slice(0, 10)} (${params.days}일간)`;
  const usageExpiryDesc = isUnlimited
    ? '영구 (Unlimited)'
    : `${expiresAt ? expiresAt.slice(0, 10) : '-'}`;

  const row = `| ${formattedDateStr} | \`${envUpper}\` | \`${payload.licenseId}\` | \`${payload.product}\` | ${payload.organizationName} | ${payload.maxUsers}명 | ${regExpiryDesc} | ${usageExpiryDesc} | \`${relSavePath}\` |\n`;
  fs.appendFileSync(mdFilePath, row, 'utf-8');

  console.log('====================================================');
  console.log(`🎉 [LEMail] 신규 ${envLabel} 라이선스가 성공적으로 발급되었습니다!`);
  console.log('====================================================');
  console.log(`- 제품 구분   : ${payload.product} (${payload.productCode})`);
  console.log(`- 발급 구분   : ${envLabel}`);
  console.log(`- 라이선스 ID : ${payload.licenseId}`);
  console.log(`- 발급 기관명 : ${payload.organizationName}`);
  console.log(`- 최대사용자수: ${payload.maxUsers}명`);
  console.log(`- 등록유효기간: ${registerExpiresAt} (생성 후 ${params.days}일 이내 등록 필수)`);
  console.log(`- 사용 기한   : ${isUnlimited ? '무제한 (Unlimited)' : expiresAt}`);
  console.log(`- 발급 일시   : ${formattedDateStr}`);
  console.log(`- 저장 파일   : ${archiveFilePath}`);
  if (customOutPath && customOutPath !== archiveFilePath) {
    console.log(`- 지정 출력지 : ${customOutPath}`);
  }
  console.log(`- 관리 대장   : ${mdFilePath}`);
  console.log('====================================================');
}

run();
