const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

/**
 * LEMail 자동 TLS 인증서 관리 및 갱신 유틸리티
 * - 인증서 만료일 자동 검사 (기본 30일 이내 만료 시 갱신 대상)
 * - 자동 갱신 (자체 서명 SAN 인증서 자동 발급 또는 Let's Encrypt 동기화)
 * - 각 서비스(Haraka SMTP, IMAP Server, NestJS Inbound SMTP)로 인증서 자동 배포
 */

const ROOT_DIR = path.resolve(__dirname, '..');
const CERT_TARGETS = [
  {
    name: 'Haraka SMTP',
    keyPath: path.join(ROOT_DIR, 'services/haraka/config/tls_key.pem'),
    certPath: path.join(ROOT_DIR, 'services/haraka/config/tls_cert.pem'),
  },
  {
    name: 'IMAP Server',
    keyPath: path.join(ROOT_DIR, 'services/imap/certs/imap-key.pem'),
    certPath: path.join(ROOT_DIR, 'services/imap/certs/imap-cert.pem'),
  },
  {
    name: 'API Inbound SMTP',
    keyPath: path.join(ROOT_DIR, 'apps/api/certs/smtp-key.pem'),
    certPath: path.join(ROOT_DIR, 'apps/api/certs/smtp-cert.pem'),
  },
];

function checkCertificateExpiry(certPath) {
  if (!fs.existsSync(certPath)) {
    return { exists: false, daysRemaining: 0, expiresAt: null };
  }

  try {
    const certPem = fs.readFileSync(certPath, 'utf8');
    const x509 = new crypto.X509Certificate(certPem);
    const validTo = new Date(x509.validTo);
    const now = new Date();
    const msRemaining = validTo.getTime() - now.getTime();
    const daysRemaining = Math.floor(msRemaining / (1000 * 60 * 60 * 24));
    return {
      exists: true,
      daysRemaining,
      expiresAt: validTo.toISOString(),
      subject: x509.subject,
      issuer: x509.issuer,
    };
  } catch (err) {
    return { exists: true, daysRemaining: -1, error: err.message };
  }
}

async function generateSelfSignedCert(domain = 'localhost') {
  console.log(`[TLS-Manager] Generating valid RSA-2048 X.509 certificate for ${domain}...`);
  const selfsigned = require('selfsigned');
  const attrs = [
    { name: 'commonName', value: domain },
    { name: 'organizationName', value: 'LEMail Secure Mail Server' },
  ];
  const pems = await selfsigned.generate(attrs, {
    days: 365,
    keySize: 2048,
    algorithm: 'sha256',
    extensions: [
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: domain },
          { type: 2, value: `mail.${domain}` },
          { type: 7, ip: '127.0.0.1' },
        ],
      },
    ],
  });

  return { privateKey: pems.private, certPem: pems.cert };
}

function syncCerts(keyPem, certPem) {
  for (const target of CERT_TARGETS) {
    const keyDir = path.dirname(target.keyPath);
    const certDir = path.dirname(target.certPath);

    if (!fs.existsSync(keyDir)) fs.mkdirSync(keyDir, { recursive: true });
    if (!fs.existsSync(certDir)) fs.mkdirSync(certDir, { recursive: true });

    fs.writeFileSync(target.keyPath, keyPem, { encoding: 'utf8', mode: 0o600 });
    fs.writeFileSync(target.certPath, certPem, { encoding: 'utf8', mode: 0o644 });
    console.log(`[TLS-Manager] Synced TLS keys to: ${target.name}`);
  }
}

async function runAutoRenewal(force = false, renewalThresholdDays = 30) {
  console.log('=== [LEMail TLS Certificate Manager & Auto-Renewal] ===');

  let needsRenewal = force;
  for (const target of CERT_TARGETS) {
    const status = checkCertificateExpiry(target.certPath);
    if (!status.exists) {
      console.log(`[!] ${target.name}: Certificate MISSING -> Needs generation`);
      needsRenewal = true;
    } else if (status.daysRemaining <= renewalThresholdDays) {
      console.log(`[!] ${target.name}: Expiring in ${status.daysRemaining} days (Threshold: ${renewalThresholdDays}d) -> Needs renewal`);
      needsRenewal = true;
    } else {
      console.log(`[✓] ${target.name}: Valid (${status.daysRemaining} days remaining, expires: ${status.expiresAt})`);
    }
  }

  // Let's Encrypt 외부 디렉터리가 지정된 경우 해당 경로에서 동기화
  const customCertPath = process.env.LETSENCRYPT_CERT_PATH;
  const customKeyPath = process.env.LETSENCRYPT_KEY_PATH;

  if (customCertPath && customKeyPath && fs.existsSync(customCertPath) && fs.existsSync(customKeyPath)) {
    console.log(`[TLS-Manager] Loading external production certificates from ${customCertPath}...`);
    const keyPem = fs.readFileSync(customKeyPath, 'utf8');
    const certPem = fs.readFileSync(customCertPath, 'utf8');
    syncCerts(keyPem, certPem);
    console.log('[TLS-Manager] External certificates successfully synced to all services.');
    return;
  }

  if (needsRenewal) {
    console.log('[TLS-Manager] Renewing certificates automatically...');
    const { privateKey, certPem } = await generateSelfSignedCert(process.env.MAIL_DOMAIN || 'localhost');
    syncCerts(privateKey, certPem);
    console.log('[TLS-Manager] Auto-renewal completed successfully.');
  } else {
    console.log('[TLS-Manager] All certificates are healthy. No renewal required.');
  }
}

// CLI 실행
const args = process.argv.slice(2);
const force = args.includes('--force');
const checkOnly = args.includes('--check');

if (checkOnly) {
  console.log('Checking certificate statuses:');
  CERT_TARGETS.forEach((t) => {
    const s = checkCertificateExpiry(t.certPath);
    console.log(`${t.name}:`, s);
  });
} else {
  runAutoRenewal(force).catch((err) => {
    console.error('[TLS-Manager] Fatal error during cert renewal:', err);
    process.exit(1);
  });
}

module.exports = {
  checkCertificateExpiry,
  runAutoRenewal,
  CERT_TARGETS,
};
