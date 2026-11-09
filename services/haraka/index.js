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

// Haraka 환경 변수 설정
process.env.HARAKA = path.resolve(__dirname);

// 발송 실패(Bounce) 메일 Outlook 한글 인코딩(RFC 2047 / UTF-8) 패치 적용
try {
  const { applyBouncePatch } = require('./patch-bounce');
  applyBouncePatch();
} catch (e) {
  console.warn('[LEMail Haraka] Failed to initialize bounce patch:', e.message);
}

try {
  const server = require('Haraka/server');
  console.log('[LEMail Haraka] Starting Haraka Outbound MTA on 127.0.0.1:2526...');
  server.createServer();
} catch (err) {
  console.error('[LEMail Haraka] Failed to start Haraka:', err);
  process.exit(1);
}
