#!/usr/bin/env node
/**
 * LEMail RSA 키쌍 생성 도구
 * 라이선스 전자서명용 2048-bit 비대칭 RSA 키를 생성합니다.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const keysDir = path.resolve(__dirname, 'keys');
const privateKeyPath = path.join(keysDir, 'license-private.pem');
const publicKeyPath = path.join(keysDir, 'license-public.pem');

if (!fs.existsSync(keysDir)) {
  fs.mkdirSync(keysDir, { recursive: true });
}

console.log('🔑 LEMail 라이선스 전용 RSA-2048 키쌍을 생성합니다...');

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem',
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem',
  },
});

fs.writeFileSync(privateKeyPath, privateKey, { mode: 0o600 });
fs.writeFileSync(publicKeyPath, publicKey, { mode: 0o644 });

console.log(`✅ 개인키 생성 완료: ${privateKeyPath}`);
console.log(`✅ 공개키 생성 완료: ${publicKeyPath}`);

// 백엔드 API keys 디렉터리에도 공개키 복사
const apiKeysDir = path.resolve(__dirname, '../../apps/api/src/modules/license/keys');
if (!fs.existsSync(apiKeysDir)) {
  fs.mkdirSync(apiKeysDir, { recursive: true });
}
const apiPublicKeyPath = path.join(apiKeysDir, 'license-public.pem');
fs.writeFileSync(apiPublicKeyPath, publicKey, { mode: 0o644 });
console.log(`✅ API 공개키 동기화 완료: ${apiPublicKeyPath}`);
