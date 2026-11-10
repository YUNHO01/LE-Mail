'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');

let publicKeyPem = null;
let cachedStatus = null;
let lastCheckTime = 0;
const CACHE_TTL_MS = 30 * 1000; // 30초 TTL 캐시

/**
 * RSA 공개키 로드
 */
function loadPublicKey() {
  if (publicKeyPem) return publicKeyPem;

  if (process.env.LICENSE_PUBLIC_KEY) {
    publicKeyPem = process.env.LICENSE_PUBLIC_KEY.replace(/\\n/g, '\n');
    return publicKeyPem;
  }

  const candidateKeyPaths = [
    path.resolve(__dirname, 'config', 'license-public.pem'),
    path.resolve(__dirname, '../../apps/api/src/modules/license/keys/license-public.pem'),
    path.resolve(__dirname, '../api/src/modules/license/keys/license-public.pem'),
    path.resolve(__dirname, '../../tools/license-issuer/keys/license-public.pem'),
    'C:/Work/workspace/lineedge/LEMail/tools/license-issuer/keys/license-public.pem',
  ];

  for (const p of candidateKeyPaths) {
    if (fs.existsSync(p)) {
      try {
        publicKeyPem = fs.readFileSync(p, 'utf-8');
        return publicKeyPem;
      } catch (e) {
        // ignore
      }
    }
  }

  return null;
}

/**
 * 라이선스 파일 경로 탐색
 */
function getLicenseFilePath() {
  if (process.env.LICENSE_FILE_PATH) {
    const custom = path.resolve(process.cwd(), process.env.LICENSE_FILE_PATH);
    if (fs.existsSync(custom)) return custom;
  }

  const candidates = [
    path.resolve(__dirname, '../../apps/api/license/lemail-license.lic'),
    path.resolve(__dirname, '../api/license/lemail-license.lic'),
    path.resolve(process.cwd(), 'apps/api/license/lemail-license.lic'),
    path.resolve(process.cwd(), 'license/lemail-license.lic'),
    path.resolve(__dirname, '../../license_dev.lic'),
    'C:/Work/workspace/lineedge/LEMail/apps/api/license/lemail-license.lic',
    'C:/Work/workspace/lineedge/LEMail/license_dev.lic',
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return null;
}

/**
 * RSA-SHA256 전자서명 검증
 */
function verifySignature(data, signatureBase64) {
  const pubKey = loadPublicKey();
  if (!pubKey) {
    console.error('[HarakaLicenseChecker] Public key not available');
    return false;
  }

  try {
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(data);
    verifier.end();
    return verifier.verify(pubKey, signatureBase64, 'base64');
  } catch (e) {
    console.error('[HarakaLicenseChecker] Signature verification error:', e.message);
    return false;
  }
}

/**
 * 로컬 디스크 파일 직접 검증
 */
function verifyLocalFile() {
  const filePath = getLicenseFilePath();
  if (!filePath || !fs.existsSync(filePath)) {
    return {
      isValid: false,
      message: '서버에 라이선스 파일이 존재하지 않습니다.',
    };
  }

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (e) {
    return {
      isValid: false,
      message: `라이선스 파일을 읽을 수 없습니다: ${e.message}`,
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    return {
      isValid: false,
      message: '라이선스 파일 포맷이 유효하지 않습니다.',
    };
  }

  const { payload, signature } = parsed;
  if (!payload || !signature) {
    return {
      isValid: false,
      message: '라이선스 파일 구조가 유효하지 않습니다.',
    };
  }

  // 제품 식별자 검증 (근태관리 등 타 제품 라이선스 차단)
  if (payload.product !== 'LEMail') {
    return {
      isValid: false,
      message: `타 제품(${payload.product || '근태관리 등'})의 라이선스는 LEMail에서 사용할 수 없습니다.`,
    };
  }

  // RSA-SHA256 서명 검증
  const canonicalPayloadString = JSON.stringify(
    payload,
    Object.keys(payload).sort()
  );

  const isSigValid = verifySignature(canonicalPayloadString, signature);
  if (!isSigValid) {
    return {
      isValid: false,
      message: '라이선스 전자서명 검증 실패 (키 불일치 또는 파일 변조).',
    };
  }

  // 사용 기한 검사
  if (!payload.isUnlimited && payload.expiresAt) {
    const expiresTime = new Date(payload.expiresAt).getTime();
    if (expiresTime <= Date.now()) {
      return {
        isValid: false,
        message: '라이선스 사용 기한이 만료되었습니다.',
      };
    }
  }

  return {
    isValid: true,
    licenseId: payload.licenseId,
    organizationName: payload.organizationName,
    maxUsers: payload.maxUsers,
    message: '정상 인증된 정품 LEMail 라이선스입니다.',
  };
}

/**
 * 로컬 REST API 비동기 백그라운드 확인 (DB 일치성 동기화용)
 */
function fetchApiStatus(callback) {
  const req = http.get(
    'http://127.0.0.1:9200/api/admin/license/status',
    { timeout: 1500 },
    (res) => {
      let rawData = '';
      res.on('data', (chunk) => {
        rawData += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(rawData);
          callback(null, parsed);
        } catch (e) {
          callback(e);
        }
      });
    }
  );

  req.on('error', (err) => {
    callback(err);
  });

  req.on('timeout', () => {
    req.destroy();
    callback(new Error('API request timeout'));
  });
}

/**
 * 동기/캐시된 라이선스 상태 검사 (Haraka 훅에서 호출)
 */
function checkLicenseSync(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedStatus && now - lastCheckTime < CACHE_TTL_MS) {
    return cachedStatus;
  }

  // 1. 로컬 파일 직접 검증 수행
  const fileStatus = verifyLocalFile();
  cachedStatus = fileStatus;
  lastCheckTime = now;

  // 2. 백그라운드에서 REST API 비동기 조회하여 DB 일치성 반영
  fetchApiStatus((err, apiStatus) => {
    if (!err && apiStatus) {
      if (!apiStatus.isValid) {
        cachedStatus = {
          isValid: false,
          message: apiStatus.message || '라이선스 유효성 또는 DB 일치성 검증 실패',
        };
      }
    }
  });

  return cachedStatus;
}

module.exports = {
  checkLicenseSync,
  verifyLocalFile,
};
