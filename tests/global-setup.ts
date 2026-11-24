import fs from 'fs';
import path from 'path';

export default async function globalSetup() {
  const envTestPath = path.resolve(process.cwd(), '.env.test');
  const hasEnvTest = fs.existsSync(envTestPath);

  const webmailUrl = (
    process.env.WEBMAIL_URL || 'http://localhost:9000'
  ).replace(/\/+$/, '');
  const testUserEmail = process.env.TEST_USER_EMAIL || '(미설정)';
  const hasTestUserPass = Boolean(process.env.TEST_USER_PASS);
  const imapHost = process.env.IMAP_HOST || '127.0.0.1';
  const imapPort = process.env.IMAP_PORT || '1143';
  const imapSecure = process.env.IMAP_SECURE === 'true';
  const imapRejectUnauthorized =
    process.env.IMAP_TLS_REJECT_UNAUTHORIZED === 'true';
  const pollTimeoutMs = process.env.IMAP_POLL_TIMEOUT_MS || '20000';
  const pollIntervalMs = process.env.IMAP_POLL_INTERVAL_MS || '1500';
  const e2eTimeoutMs = process.env.E2E_TIMEOUT_MS || '60000';
  const ignoreHttpsErrors = process.env.E2E_IGNORE_HTTPS_ERRORS === 'true';

  console.log('\n============================================================');
  console.log('[E2E-QA] 실행 환경 정보');
  console.log('------------------------------------------------------------');
  console.log(`  설정 파일        : .env.test (${hasEnvTest ? '로드됨' : '미존재 - 기본값 사용'})`);
  console.log(`  WEBMAIL_URL      : ${webmailUrl}`);
  console.log(`  TEST_USER_EMAIL  : ${testUserEmail}`);
  console.log(`  TEST_USER_PASS   : ${hasTestUserPass ? '(설정됨)' : '(미설정)'}`);
  console.log(`  IMAP             : ${imapHost}:${imapPort} (secure=${imapSecure}, rejectUnauthorized=${imapRejectUnauthorized})`);
  console.log(`  POLL / TIMEOUT   : interval=${pollIntervalMs}ms, pollTimeout=${pollTimeoutMs}ms, testTimeout=${e2eTimeoutMs}ms`);
  console.log(`  HTTPS 오류 무시  : ${ignoreHttpsErrors}`);
  console.log('============================================================\n');
}
