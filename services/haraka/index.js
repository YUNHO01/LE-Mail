'use strict';

const dns = require('dns');
const os = require('os');
const path = require('path');
const fs = require('fs');

// Windows c-ares DNS 리졸버 호환성: 공용 DNS 서버(Google/Cloudflare) 지정
try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
  const dnsConfig = require('haraka-net-utils/lib/dns_config');
  const resolver = dnsConfig.getDnsResolver();
  resolver.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch (e) {
  console.warn('[LEMail Haraka] Failed to set custom DNS servers:', e.message);
}

// Windows 호환성: 호스트명 특수문자 치환으로 인한 백슬래시 경로 오류 방지
os.hostname = () => 'lemail-mta';

// queue 디렉토리 생성 보장
const queueDir = path.resolve(__dirname, 'queue');
if (!fs.existsSync(queueDir)) {
  fs.mkdirSync(queueDir, { recursive: true });
}

// TLS 인증서(tls_key.pem, tls_cert.pem) 보장
function ensureTlsCertificates() {
  const configDir = path.resolve(__dirname, 'config');
  const keyPath = path.join(configDir, 'tls_key.pem');
  const certPath = path.join(configDir, 'tls_cert.pem');

  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return;
  }

  const cp = require('child_process');
  const opensslCandidates = [
    'openssl',
    'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
    'C:\\Program Files (x86)\\Git\\usr\\bin\\openssl.exe',
  ];

  for (const bin of opensslCandidates) {
    try {
      cp.execFileSync(
        bin,
        [
          'req',
          '-x509',
          '-nodes',
          '-days',
          '3650',
          '-newkey',
          'rsa:2048',
          '-keyout',
          keyPath,
          '-out',
          certPath,
          '-subj',
          '/CN=lemail-mta',
        ],
        { stdio: 'ignore' },
      );
      if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
        console.log('[LEMail Haraka] Successfully generated self-signed TLS certificates.');
        return;
      }
    } catch {}
  }
}
ensureTlsCertificates();

// Haraka 환경 변수 설정
process.env.HARAKA = path.resolve(__dirname);

// 발송 실패(Bounce) 메일 Outlook 한글 인코딩(RFC 2047 / UTF-8) 패치 적용
try {
  const { applyBouncePatch } = require('./patch-bounce');
  applyBouncePatch();
} catch (e) {
  console.warn('[LEMail Haraka] Failed to initialize bounce patch:', e.message);
}

// 라이선스 상태 검증 및 로깅
try {
  const { checkLicenseSync } = require('./license-checker');
  const lic = checkLicenseSync(true);
  if (lic.isValid) {
    console.log(`[LEMail Haraka] ✅ System License Verified: [${lic.organizationName}] Max Users: ${lic.maxUsers}`);
  } else {
    console.warn(`[LEMail Haraka] ⚠️ System License Warning: ${lic.message} (Outbound relay will be restricted)`);
  }
} catch (e) {
  console.warn('[LEMail Haraka] License checker init note:', e.message);
}

try {
  const server = require('Haraka/server');
  console.log('[LEMail Haraka] Starting Haraka Outbound MTA on 127.0.0.1:2526...');
  server.createServer();
} catch (err) {
  console.error('[LEMail Haraka] Failed to start Haraka:', err);
  process.exit(1);
}
