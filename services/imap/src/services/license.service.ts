import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { DbService } from './db.service';

export interface LicenseStatusResult {
  isValid: boolean;
  licenseId?: string;
  product?: string;
  organizationName?: string;
  maxUsers?: number;
  currentUsers?: number;
  expiresAt?: string | null;
  isUnlimited?: boolean;
  isExpired?: boolean;
  daysRemaining?: number | null;
  fileIntegrityMatched?: boolean;
  message?: string;
}

const DEFAULT_LICENSE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAy8lnI4j0NPdlsQB/BPfC
I5Z4cISGqF5b8tFK+N7Dkmkj7HfmpzqWUkLqVmrL++xh2csZxUFfq50myABfLad3
+2e1LQzkm5cDavBIO8Fk+oEyVvpUh8yOlJF8d4YsYfK+FoevwdhclPAdgc4OY+Ls
ROwybuwotZcpGDGLQhUEBgqgFiqiRRvYLygNlwZeBr8FcA+uW4Cgectta4bkCwOF
hgohtIpj92dzw/RFN9mtvO8gatR4i9GGYwP9jVSFok3h19qKgo7BjXwgcwVExhha
jQl2MWhKhoiddcS1vNaFb6rOYIi0jQ/X1XA6WUV1hBe2tIPqejL+tfPyYdyWz/8p
4wIDAQAB
-----END PUBLIC KEY-----`;

export class ImapLicenseService {
  private static publicKeyPem: string | null = null;
  private static cachedStatus: LicenseStatusResult | null = null;
  private static lastCheckTime: number = 0;
  private static readonly CACHE_TTL_MS = 30 * 1000; // 30초 TTL

  /**
   * RSA 공개키 경로 탐색 및 로드
   */
  private static loadPublicKey(): string | null {
    if (this.publicKeyPem) {
      return this.publicKeyPem;
    }

    if (process.env.LICENSE_PUBLIC_KEY) {
      this.publicKeyPem = process.env.LICENSE_PUBLIC_KEY.replace(/\\n/g, '\n');
      return this.publicKeyPem;
    }

    const candidateKeyPaths = [
      path.resolve(__dirname, '../../keys', 'license-public.pem'),
      path.resolve(__dirname, '../keys', 'license-public.pem'),
      path.resolve(process.cwd(), 'keys', 'license-public.pem'),
      path.resolve(process.cwd(), 'services/imap/keys', 'license-public.pem'),
      path.resolve(process.cwd(), 'certs', 'license-public.pem'),
      path.resolve(process.cwd(), '../../apps/api/dist/modules/license/keys/license-public.pem'),
      path.resolve(process.cwd(), '../api/dist/modules/license/keys/license-public.pem'),
      path.resolve(process.cwd(), 'apps/api/dist/modules/license/keys/license-public.pem'),
      path.resolve(process.cwd(), '../../apps/api/src/modules/license/keys/license-public.pem'),
      path.resolve(process.cwd(), '../api/src/modules/license/keys/license-public.pem'),
      path.resolve(process.cwd(), 'apps/api/src/modules/license/keys/license-public.pem'),
    ];

    for (const p of candidateKeyPaths) {
      if (fs.existsSync(p)) {
        try {
          this.publicKeyPem = fs.readFileSync(p, 'utf-8');
          console.log(`[ImapLicenseService] Loaded RSA public key from: ${p}`);
          return this.publicKeyPem;
        } catch (e: any) {
          console.error(`[ImapLicenseService] Failed to read public key from ${p}:`, e.message);
        }
      }
    }

    // 소스/배포 모듈 내장 폴백 키 적용
    this.publicKeyPem = DEFAULT_LICENSE_PUBLIC_KEY;
    return this.publicKeyPem;
  }

  /**
   * 서버 라이선스 파일 경로 탐색
   */
  private static getLicenseFilePath(): string | null {
    if (process.env.LICENSE_FILE_PATH) {
      const customPath = path.resolve(process.cwd(), process.env.LICENSE_FILE_PATH);
      if (fs.existsSync(customPath)) return customPath;
    }

    const candidateFilePaths = [
      path.resolve(process.cwd(), 'license/lemail-license.lic'),
      path.resolve(process.cwd(), '../api/license/lemail-license.lic'),
      path.resolve(process.cwd(), '../../apps/api/license/lemail-license.lic'),
      path.resolve(process.cwd(), 'apps/api/license/lemail-license.lic'),
      path.resolve(process.cwd(), '../../license/lemail-license.lic'),
      path.resolve(process.cwd(), 'license_dev.lic'),
      path.resolve(process.cwd(), '../../license_dev.lic'),
    ];

    for (const p of candidateFilePaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }

    return null;
  }

  /**
   * 라이선스 파일 내용의 SHA-256 해시 계산
   */
  private static calculateHash(content: string): string {
    return crypto.createHash('sha256').update(content.trim()).digest('hex');
  }

  /**
   * RSA 전자서명 검증
   */
  private static verifySignature(data: string, signatureBase64: string): boolean {
    const pubKey = this.loadPublicKey();
    if (!pubKey) {
      console.error('[ImapLicenseService] Public key not available for signature verification');
      return false;
    }

    try {
      const verifier = crypto.createVerify('RSA-SHA256');
      verifier.update(data);
      verifier.end();
      return verifier.verify(pubKey, signatureBase64, 'base64');
    } catch (e: any) {
      console.error('[ImapLicenseService] Signature verification exception:', e.message);
      return false;
    }
  }

  /**
   * 라이선스 상태 검증 (인메모리 캐시 지원)
   */
  static async checkLicense(forceRefresh: boolean = false): Promise<LicenseStatusResult> {
    const now = Date.now();
    if (!forceRefresh && this.cachedStatus && now - this.lastCheckTime < this.CACHE_TTL_MS) {
      return this.cachedStatus;
    }

    const result = await this.evaluateLicense();
    this.cachedStatus = result;
    this.lastCheckTime = now;
    return result;
  }

  /**
   * 실제 DB와 파일 대조 무결성 검증
   */
  private static async evaluateLicense(): Promise<LicenseStatusResult> {
    try {
      // 1. 활성 사용자 수 집계
      const userRows = await DbService.query(
        'SELECT COUNT(*) as activeCount FROM user WHERE is_active = 1',
      );
      const currentUsers = userRows && userRows[0] ? Number(userRows[0].activeCount) : 0;

      // 2. DB에서 활성 라이선스 조회
      const licRows = await DbService.query(
        'SELECT * FROM system_licenses WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1',
      );

      if (!licRows || licRows.length === 0) {
        return {
          isValid: false,
          currentUsers,
          fileIntegrityMatched: false,
          message: '등록된 시스템 라이선스가 없습니다. 정품 LEMail 라이선스를 등록해 주세요.',
        };
      }

      const dbLic = licRows[0];

      // 3. 디스크의 라이선스 파일 탐색
      const licFilePath = this.getLicenseFilePath();
      if (!licFilePath || !fs.existsSync(licFilePath)) {
        return {
          isValid: false,
          licenseId: dbLic.license_id,
          organizationName: dbLic.organization_name,
          currentUsers,
          fileIntegrityMatched: false,
          message: '라이선스 파일과 DB 불일치: 서버 디스크에 라이선스 파일이 누락되었습니다.',
        };
      }

      // 4. 디스크 파일 읽기 및 해시 검증
      let fileContent: string;
      try {
        fileContent = fs.readFileSync(licFilePath, 'utf-8');
      } catch (e: any) {
        return {
          isValid: false,
          licenseId: dbLic.license_id,
          organizationName: dbLic.organization_name,
          currentUsers,
          fileIntegrityMatched: false,
          message: `라이선스 파일을 읽을 수 없습니다: ${e.message}`,
        };
      }

      const fileHash = this.calculateHash(fileContent);

      // 파일 해시 vs DB 저장 해시 대조 (파일 위변조 방어)
      if (fileHash !== dbLic.file_hash) {
        return {
          isValid: false,
          licenseId: dbLic.license_id,
          organizationName: dbLic.organization_name,
          currentUsers,
          fileIntegrityMatched: false,
          message: '라이선스 무결성 위반: 라이선스 파일 해시가 DB와 일치하지 않습니다 (변조 감지).',
        };
      }

      // 5. 파일 구조 파싱 및 제품 식별자 검증
      let parsed: any;
      try {
        parsed = JSON.parse(fileContent);
      } catch {
        return {
          isValid: false,
          licenseId: dbLic.license_id,
          currentUsers,
          fileIntegrityMatched: false,
          message: '라이선스 파일 포맷이 올바르지 않습니다.',
        };
      }

      const { payload, signature } = parsed;
      if (!payload || !signature) {
        return {
          isValid: false,
          licenseId: dbLic.license_id,
          currentUsers,
          fileIntegrityMatched: false,
          message: '라이선스 파일의 페이로드 또는 서명이 누락되었습니다.',
        };
      }

      // 제품 식별자 검증 (근태관리 등 타 제품 차단)
      if (payload.product !== 'LEMail') {
        return {
          isValid: false,
          licenseId: payload.licenseId,
          organizationName: payload.organizationName,
          currentUsers,
          fileIntegrityMatched: false,
          message: `타 제품(${payload.product || '근태관리 등'})의 라이선스는 LEMail에서 사용할 수 없습니다.`,
        };
      }

      // 6. 파일 Payload ↔ DB 컬럼 상호 일치 검증 (DB 조작 방어)
      const isIdMatch = payload.licenseId === dbLic.license_id;
      const isOrgMatch = payload.organizationName === dbLic.organization_name;
      const isUsersMatch = payload.maxUsers === dbLic.max_users;
      const isProdMatch = payload.product === dbLic.product;
      const isSigMatch = signature === dbLic.signature;

      if (!isIdMatch || !isOrgMatch || !isUsersMatch || !isProdMatch || !isSigMatch) {
        return {
          isValid: false,
          licenseId: dbLic.license_id,
          organizationName: dbLic.organization_name,
          currentUsers,
          fileIntegrityMatched: false,
          message: '라이선스 파일과 DB 정보가 일치하지 않습니다 (DB 컬럼 변조 감지).',
        };
      }

      // 7. DB 내부 서명 원문(license_raw)과 DB 컬럼 대조
      let dbRawPayload: any;
      try {
        dbRawPayload = JSON.parse(dbLic.license_raw);
      } catch {
        return {
          isValid: false,
          licenseId: dbLic.license_id,
          currentUsers,
          fileIntegrityMatched: false,
          message: 'DB에 저장된 원본 라이선스 데이터가 손상되었습니다.',
        };
      }

      if (
        dbRawPayload.maxUsers !== dbLic.max_users ||
        dbRawPayload.organizationName !== dbLic.organization_name ||
        dbRawPayload.licenseId !== dbLic.license_id ||
        dbRawPayload.product !== 'LEMail'
      ) {
        return {
          isValid: false,
          licenseId: dbLic.license_id,
          organizationName: dbLic.organization_name,
          currentUsers,
          fileIntegrityMatched: false,
          message: 'DB 컬럼 정보가 서명 원본과 일치하지 않습니다 (DB 변조 감지).',
        };
      }

      // 8. RSA-SHA256 전자서명 수학적 검증
      const canonicalPayloadString = JSON.stringify(
        payload,
        Object.keys(payload).sort(),
      );

      const isSignatureValid = this.verifySignature(
        canonicalPayloadString,
        signature,
      );

      if (!isSignatureValid) {
        return {
          isValid: false,
          licenseId: dbLic.license_id,
          organizationName: dbLic.organization_name,
          currentUsers,
          fileIntegrityMatched: false,
          message: '라이선스 전자서명 검증에 실패했습니다. 키가 불일치하거나 파일이 변조되었습니다.',
        };
      }

      // 9. 사용 기한(expires_at) 검사
      let isExpired = false;
      let daysRemaining: number | null = null;

      if (!dbLic.is_unlimited && dbLic.expires_at) {
        const expiresTime = new Date(dbLic.expires_at).getTime();
        const diffMs = expiresTime - Date.now();
        daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        if (diffMs <= 0) {
          isExpired = true;
        }
      }

      if (isExpired) {
        return {
          isValid: false,
          licenseId: dbLic.license_id,
          product: dbLic.product,
          organizationName: dbLic.organization_name,
          maxUsers: dbLic.max_users,
          currentUsers,
          expiresAt: dbLic.expires_at ? new Date(dbLic.expires_at).toISOString() : null,
          isUnlimited: false,
          isExpired: true,
          daysRemaining: 0,
          fileIntegrityMatched: true,
          message: '라이선스 사용 기한이 만료되었습니다.',
        };
      }

      // 10. 사용자 정원(max_users) 초과 검사
      if (currentUsers > dbLic.max_users) {
        return {
          isValid: false,
          licenseId: dbLic.license_id,
          product: dbLic.product,
          organizationName: dbLic.organization_name,
          maxUsers: dbLic.max_users,
          currentUsers,
          expiresAt: dbLic.expires_at ? new Date(dbLic.expires_at).toISOString() : null,
          isUnlimited: !!dbLic.is_unlimited,
          isExpired: false,
          daysRemaining,
          fileIntegrityMatched: true,
          message: `라이선스 허용 사용자 정원(${dbLic.max_users}명)을 초과했습니다. (현재 활성 사용자: ${currentUsers}명)`,
        };
      }

      // 모든 검증 통과
      return {
        isValid: true,
        licenseId: dbLic.license_id,
        product: dbLic.product,
        organizationName: dbLic.organization_name,
        maxUsers: dbLic.max_users,
        currentUsers,
        expiresAt: dbLic.expires_at ? new Date(dbLic.expires_at).toISOString() : null,
        isUnlimited: !!dbLic.is_unlimited,
        isExpired: false,
        daysRemaining,
        fileIntegrityMatched: true,
        message: '정상 인증된 정품 LEMail 라이선스입니다.',
      };
    } catch (err: any) {
      console.error('[ImapLicenseService] License evaluation exception:', err.message);
      return {
        isValid: false,
        fileIntegrityMatched: false,
        message: `라이선스 확인 중 시스템 오류가 발생했습니다: ${err.message}`,
      };
    }
  }
}
