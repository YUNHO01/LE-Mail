import {
  Injectable,
  Logger,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { SystemLicense, User } from '../database/entities';
import {
  LicenseFileContent,
  LicensePayload,
  SystemLicenseInfo,
} from '@lemail/shared-types';

const DEFAULT_LICENSE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAy8lnI4j0NPdlsQB/BPfC
I5Z4cISGqF5b8tFK+N7Dkmkj7HfmpzqWUkLqVmrL++xh2csZxUFfq50myABfLad3
+2e1LQzkm5cDavBIO8Fk+oEyVvpUh8yOlJF8d4YsYfK+FoevwdhclPAdgc4OY+Ls
ROwybuwotZcpGDGLQhUEBgqgFiqiRRvYLygNlwZeBr8FcA+uW4Cgectta4bkCwOF
hgohtIpj92dzw/RFN9mtvO8gatR4i9GGYwP9jVSFok3h19qKgo7BjXwgcwVExhha
jQl2MWhKhoiddcS1vNaFb6rOYIi0jQ/X1XA6WUV1hBe2tIPqejL+tfPyYdyWz/8p
4wIDAQAB
-----END PUBLIC KEY-----`;

@Injectable()
export class LicenseService implements OnModuleInit {
  private readonly logger = new Logger(LicenseService.name);
  private publicKeyPem: string;
  private readonly licenseFilePath: string;

  constructor(
    @InjectRepository(SystemLicense)
    private readonly licenseRepository: Repository<SystemLicense>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {
    // 라이선스 파일 보관 경로 (환경변수 지정 또는 기본 license/lemail-license.lic)
    if (process.env.LICENSE_FILE_PATH) {
      this.licenseFilePath = path.resolve(process.cwd(), process.env.LICENSE_FILE_PATH);
    } else {
      // apps/api 하위 또는 프로젝트 루트 기준 디렉터리 자동 판단
      const inApiDir = path.resolve(process.cwd(), 'license', 'lemail-license.lic');
      const inRootAppsDir = path.resolve(process.cwd(), 'apps/api/license', 'lemail-license.lic');
      if (fs.existsSync(inRootAppsDir) && !fs.existsSync(inApiDir)) {
        this.licenseFilePath = inRootAppsDir;
      } else {
        this.licenseFilePath = inApiDir;
      }
    }

    this.loadPublicKey();
  }

  getLicenseFilePath(): string {
    return this.licenseFilePath;
  }

  async onModuleInit() {
    this.logger.log('🔍 LEMail 시스템 라이선스 무결성 검증을 시작합니다...');

    // 만약 디스크에 라이선스 파일이 존재하는데 DB에 활성 라이선스가 없는 경우 자동 등록 시도
    if (fs.existsSync(this.licenseFilePath)) {
      const activeCount = await this.licenseRepository.count({
        where: { isActive: true },
      });
      if (activeCount === 0) {
        try {
          this.logger.log(`📄 디스크의 라이선스 파일 발견: ${this.licenseFilePath} -> DB 자동 동기화 진행`);
          const fileContent = fs.readFileSync(this.licenseFilePath, 'utf-8');
          await this.registerLicense(fileContent, false);
        } catch (err: any) {
          this.logger.warn(`초기 라이선스 파일 자동 등록 실패: ${err.message}`);
        }
      }
    }

    const status = await this.getLicenseStatus();
    if (status.isValid) {
      this.logger.log(
        `✅ [LEMail] 라이선스 인증 정상: [${status.organizationName}] 정원 ${status.maxUsers}명 (현재 활성 사용자: ${status.currentUsers}명) - 기한: ${status.isUnlimited ? '무제한' : status.expiresAt}`,
      );
    } else {
      this.logger.warn(`⚠️ [LEMail] 라이선스 주의/제한 상태: ${status.message}`);
    }
  }

  /**
   * RSA 공개키 로드 (1: 환경변수, 2: 모듈 내장/로컬 파일, 3: 임베디드 폴백)
   */
  private loadPublicKey() {
    if (process.env.LICENSE_PUBLIC_KEY) {
      this.publicKeyPem = process.env.LICENSE_PUBLIC_KEY.replace(/\\n/g, '\n');
      this.logger.log('🔑 환경변수에서 RSA 공개키 로드 완료.');
      return;
    }

    const keyPaths = [
      path.resolve(__dirname, 'keys', 'license-public.pem'),
      path.resolve(__dirname, '../license/keys', 'license-public.pem'),
      path.resolve(process.cwd(), 'dist/modules/license/keys/license-public.pem'),
      path.resolve(process.cwd(), 'src/modules/license/keys/license-public.pem'),
      path.resolve(process.cwd(), 'apps/api/dist/modules/license/keys/license-public.pem'),
      path.resolve(process.cwd(), 'apps/api/src/modules/license/keys/license-public.pem'),
      path.resolve(process.cwd(), 'keys/license-public.pem'),
    ];

    for (const p of keyPaths) {
      if (fs.existsSync(p)) {
        try {
          this.publicKeyPem = fs.readFileSync(p, 'utf-8');
          this.logger.log(`🔑 RSA 공개키 로드 완료: ${p}`);
          return;
        } catch (e: any) {
          this.logger.error(`공개키 로드 실패 (${p}): ${e.message}`);
        }
      }
    }

    // 소스/배포 모듈 내장 폴백 키 적용
    this.publicKeyPem = DEFAULT_LICENSE_PUBLIC_KEY;
    this.logger.log('🔑 내장 기본 RSA 공개키 로드 완료.');
  }

  /**
   * 라이선스 파일 내용의 SHA-256 해시 계산
   */
  private calculateHash(content: string): string {
    return crypto.createHash('sha256').update(content.trim()).digest('hex');
  }

  /**
   * RSA 전자서명 검증 (Canonical JSON 문자열과 signature 검증)
   */
  private verifySignature(data: string, signatureBase64: string): boolean {
    if (!this.publicKeyPem) {
      this.loadPublicKey();
    }
    if (!this.publicKeyPem) {
      this.logger.error('라이선스 서명 검증 불가: 공개키가 등록되어 있지 않습니다.');
      return false;
    }

    try {
      const verifier = crypto.createVerify('RSA-SHA256');
      verifier.update(data);
      verifier.end();
      return verifier.verify(this.publicKeyPem, signatureBase64, 'base64');
    } catch (e: any) {
      this.logger.error('서명 검증 중 예외 발생:', e.message);
      return false;
    }
  }

  /**
   * 현재 시스템 라이선스 상태 조회 및 무결성(파일-DB 불일치, 변조) 심층 검증
   */
  async getLicenseStatus(): Promise<SystemLicenseInfo> {
    const currentUsers = await this.userRepository.count({
      where: { isActive: true },
    });

    const activeLicense = await this.licenseRepository.findOne({
      where: { isActive: true },
      order: { createdAt: 'DESC' },
    });

    // 1. DB에 활성 라이선스가 없는 경우
    if (!activeLicense) {
      return {
        isValid: false,
        currentUsers,
        fileIntegrityMatched: false,
        message: '등록된 시스템 라이선스가 없습니다. 정품 LEMail 라이선스를 등록해 주세요.',
      };
    }

    // 2. 디스크의 라이선스 파일 존재 여부 검사
    if (!fs.existsSync(this.licenseFilePath)) {
      return {
        isValid: false,
        licenseId: activeLicense.licenseId,
        organizationName: activeLicense.organizationName,
        currentUsers,
        fileIntegrityMatched: false,
        message:
          '라이선스 파일과 DB 정보 불일치: 서버에 라이선스 파일이 존재하지 않습니다. 라이선스를 다시 등록해 주세요.',
      };
    }

    // 3. 디스크의 라이선스 파일 읽기 & 해시 검증
    let fileContent: string;
    try {
      fileContent = fs.readFileSync(this.licenseFilePath, 'utf-8');
    } catch (e: any) {
      return {
        isValid: false,
        licenseId: activeLicense.licenseId,
        organizationName: activeLicense.organizationName,
        currentUsers,
        fileIntegrityMatched: false,
        message: `라이선스 파일을 읽을 수 없습니다: ${e.message}`,
      };
    }

    const diskFileHash = this.calculateHash(fileContent);

    // 4. 파일 해시 vs DB 저장 해시 대조 (파일 내용 변경 또는 교체 방어)
    if (diskFileHash !== activeLicense.fileHash) {
      return {
        isValid: false,
        licenseId: activeLicense.licenseId,
        organizationName: activeLicense.organizationName,
        currentUsers,
        fileIntegrityMatched: false,
        message:
          '라이선스 무결성 위반: 디스크의 라이선스 파일과 데이터베이스 저장 해시가 일치하지 않습니다. 파일이 변조되었거나 교체되었습니다.',
      };
    }

    // 5. 디스크 파일 JSON 파싱 및 필드 대조
    let parsedFile: LicenseFileContent;
    try {
      parsedFile = JSON.parse(fileContent);
    } catch {
      return {
        isValid: false,
        licenseId: activeLicense.licenseId,
        organizationName: activeLicense.organizationName,
        currentUsers,
        fileIntegrityMatched: false,
        message: '디스크의 라이선스 파일 포맷이 올바르지 않습니다.',
      };
    }

    const { payload, signature } = parsedFile;
    if (!payload || !signature) {
      return {
        isValid: false,
        licenseId: activeLicense.licenseId,
        organizationName: activeLicense.organizationName,
        currentUsers,
        fileIntegrityMatched: false,
        message: '라이선스 파일 구조가 유효하지 않습니다.',
      };
    }

    // 6. 근태관리(AMS 등) 타 제품 라이선스 차단 검증
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

    // 7. 파일 데이터 ↔ DB 컬럼 상호 일치 검증 (DB 컬럼 임의 수정 방어)
    const isIdMatched = payload.licenseId === activeLicense.licenseId;
    const isOrgMatched = payload.organizationName === activeLicense.organizationName;
    const isMaxUsersMatched = payload.maxUsers === activeLicense.maxUsers;
    const isProductMatched = payload.product === activeLicense.product;
    const isSigMatched = signature === activeLicense.signature;

    if (!isIdMatched || !isOrgMatched || !isMaxUsersMatched || !isProductMatched || !isSigMatched) {
      return {
        isValid: false,
        licenseId: activeLicense.licenseId,
        organizationName: activeLicense.organizationName,
        currentUsers,
        fileIntegrityMatched: false,
        message:
          '라이선스 파일과 데이터베이스 정보가 일치하지 않습니다. 데이터베이스 또는 라이선스 정보가 임의로 변조되었습니다.',
      };
    }

    // 8. DB 내부 변조 방어: licenseRaw 파싱 데이터 vs DB 컬럼 대조
    let dbRawPayload: LicensePayload;
    try {
      dbRawPayload = JSON.parse(activeLicense.licenseRaw);
    } catch {
      return {
        isValid: false,
        licenseId: activeLicense.licenseId,
        organizationName: activeLicense.organizationName,
        currentUsers,
        fileIntegrityMatched: false,
        message: '데이터베이스에 저장된 원본 라이선스 데이터가 손상되었습니다.',
      };
    }

    if (
      dbRawPayload.maxUsers !== activeLicense.maxUsers ||
      dbRawPayload.organizationName !== activeLicense.organizationName ||
      dbRawPayload.licenseId !== activeLicense.licenseId ||
      dbRawPayload.product !== 'LEMail'
    ) {
      return {
        isValid: false,
        licenseId: activeLicense.licenseId,
        organizationName: activeLicense.organizationName,
        currentUsers,
        fileIntegrityMatched: false,
        message: '데이터베이스 컬럼 정보가 원본 서명 데이터와 일치하지 않습니다 (DB 변조 감지).',
      };
    }

    // 9. RSA-SHA256 전자서명 수학적 검증 (위변조 검증)
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
        licenseId: activeLicense.licenseId,
        organizationName: activeLicense.organizationName,
        currentUsers,
        fileIntegrityMatched: false,
        message: '라이선스 전자서명 검증에 실패했습니다. 키가 일치하지 않거나 파일이 변조되었습니다.',
      };
    }

    // 10. 사용 기한(expiresAt) 만료 검사
    let isExpired = false;
    let daysRemaining: number | null = null;

    if (!activeLicense.isUnlimited && activeLicense.expiresAt) {
      const now = Date.now();
      const expiresTime = new Date(activeLicense.expiresAt).getTime();
      const diffMs = expiresTime - now;
      daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      if (diffMs <= 0) {
        isExpired = true;
      }
    }

    if (isExpired) {
      return {
        isValid: false,
        licenseId: activeLicense.licenseId,
        product: activeLicense.product,
        organizationName: activeLicense.organizationName,
        maxUsers: activeLicense.maxUsers,
        currentUsers,
        expiresAt: activeLicense.expiresAt ? activeLicense.expiresAt.toISOString() : null,
        isUnlimited: false,
        isExpired: true,
        daysRemaining: 0,
        issuedAt: activeLicense.issuedAt.toISOString(),
        registeredAt: activeLicense.createdAt.toISOString(),
        fileIntegrityMatched: true,
        message: '라이선스 사용 기한이 만료되었습니다. 라이선스 갱신이 필요합니다.',
      };
    }

    // 11. 최대 허용 사용자 수(maxUsers) 초과 검사
    if (currentUsers > activeLicense.maxUsers) {
      return {
        isValid: false,
        licenseId: activeLicense.licenseId,
        product: activeLicense.product,
        organizationName: activeLicense.organizationName,
        maxUsers: activeLicense.maxUsers,
        currentUsers,
        expiresAt: activeLicense.expiresAt ? activeLicense.expiresAt.toISOString() : null,
        isUnlimited: activeLicense.isUnlimited,
        isExpired: false,
        daysRemaining,
        issuedAt: activeLicense.issuedAt.toISOString(),
        registeredAt: activeLicense.createdAt.toISOString(),
        fileIntegrityMatched: true,
        message: `라이선스 허용 사용자 수(${activeLicense.maxUsers}명)를 초과했습니다. (현재 활성 사용자: ${currentUsers}명)`,
      };
    }

    // 모든 검증 통과
    return {
      isValid: true,
      licenseId: activeLicense.licenseId,
      product: activeLicense.product,
      organizationName: activeLicense.organizationName,
      maxUsers: activeLicense.maxUsers,
      currentUsers,
      expiresAt: activeLicense.expiresAt ? activeLicense.expiresAt.toISOString() : null,
      isUnlimited: activeLicense.isUnlimited,
      isExpired: false,
      daysRemaining,
      issuedAt: activeLicense.issuedAt.toISOString(),
      registeredAt: activeLicense.createdAt.toISOString(),
      fileIntegrityMatched: true,
      message: '정상 인증된 정품 LEMail 라이선스입니다.',
    };
  }

  /**
   * 라이선스 파일 등록 및 디스크-DB 동기화 저장
   */
  async registerLicense(
    licenseContentStr: string,
    writeFileToDisk: boolean = true,
  ): Promise<SystemLicenseInfo> {
    if (!licenseContentStr || typeof licenseContentStr !== 'string') {
      throw new BadRequestException('라이선스 내용이 비어있습니다.');
    }

    let parsed: LicenseFileContent;
    try {
      parsed = JSON.parse(licenseContentStr.trim());
    } catch {
      throw new BadRequestException('올바른 JSON 포맷의 라이선스 파일이 아닙니다.');
    }

    if (!parsed.payload || !parsed.signature) {
      throw new BadRequestException('라이선스 파일 구조가 유효하지 않습니다 (payload 또는 signature 누락).');
    }

    const { payload, signature } = parsed;

    // 1. 제품 구분 검증 (근태관리 등 타 제품 라이선스 즉시 차단)
    if (!payload.product || payload.product !== 'LEMail') {
      throw new BadRequestException(
        `타 제품(${payload.product || '근태관리 등'})의 라이선스 파일은 LEMail에 등록할 수 없습니다. LEMail 전용 라이선스 파일을 등록해 주세요.`,
      );
    }

    // 2. 전자서명 검증 (Canonical JSON 기준)
    const canonicalPayloadString = JSON.stringify(
      payload,
      Object.keys(payload).sort(),
    );

    const isSignatureValid = this.verifySignature(
      canonicalPayloadString,
      signature,
    );

    if (!isSignatureValid) {
      throw new BadRequestException(
        '라이선스 전자서명 검증에 실패했습니다. 올바른 발급 파일이 아니거나 근태관리 등 타 시스템의 키로 서명된 파일입니다.',
      );
    }

    // 3. 발급일시(issuedAt) 검증
    if (!payload.issuedAt || typeof payload.issuedAt !== 'string') {
      throw new BadRequestException('라이선스 발급 일시(issuedAt) 정보가 누락되었습니다.');
    }
    const issuedTime = new Date(payload.issuedAt).getTime();
    if (isNaN(issuedTime)) {
      throw new BadRequestException('라이선스 발급 일시 형식이 유효하지 않습니다.');
    }

    // 4. 등록 유효기간(registerExpiresAt) 검증
    const now = Date.now();
    if (payload.registerExpiresAt) {
      const registerExpiresTime = new Date(payload.registerExpiresAt).getTime();
      if (isNaN(registerExpiresTime)) {
        throw new BadRequestException('등록 유효기간(registerExpiresAt) 형식이 유효하지 않습니다.');
      }
      if (registerExpiresTime <= now) {
        throw new BadRequestException(
          '등록 유효기간이 만료된 라이선스입니다. 신규 라이선스를 재발급받아 주세요.',
        );
      }
    }

    // 5. 사용 기한(expiresAt) 검증
    let usageExpiresAt: Date | null = null;
    let isUnlimited = true;

    if (payload.expiresAt && !payload.isUnlimited) {
      const expiresTime = new Date(payload.expiresAt).getTime();
      if (isNaN(expiresTime)) {
        throw new BadRequestException('사용 기한(expiresAt) 형식이 유효하지 않습니다.');
      }
      if (expiresTime <= now) {
        throw new BadRequestException('사용 기한이 이미 만료된 라이선스는 등록할 수 없습니다.');
      }
      isUnlimited = false;
      usageExpiresAt = new Date(payload.expiresAt);
    }

    // 6. 파일 포맷 표준화 및 디스크 저장
    const normalizedFileString = JSON.stringify(parsed, null, 2);
    const fileHash = this.calculateHash(normalizedFileString);

    if (writeFileToDisk) {
      const dir = path.dirname(this.licenseFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.licenseFilePath, normalizedFileString, 'utf-8');
      this.logger.log(`💾 라이선스 파일 디스크 저장 완료: ${this.licenseFilePath}`);
    }

    // 7. 기존 활성 라이선스 비활성화
    await this.licenseRepository.update({ isActive: true }, { isActive: false });

    // 8. DB에 신규 라이선스 엔티티 저장 또는 동일 라이선스 재등록 시 갱신
    const existing = await this.licenseRepository.findOne({
      where: { licenseId: payload.licenseId },
    });

    if (existing) {
      existing.product = payload.product;
      existing.organizationName = payload.organizationName;
      existing.maxUsers = payload.maxUsers || 200;
      existing.registerExpiresAt = payload.registerExpiresAt ? new Date(payload.registerExpiresAt) : null;
      existing.expiresAt = usageExpiresAt;
      existing.isUnlimited = isUnlimited;
      existing.issuedAt = new Date(payload.issuedAt);
      existing.fileHash = fileHash;
      existing.licenseRaw = canonicalPayloadString;
      existing.signature = signature;
      existing.isActive = true;
      await this.licenseRepository.save(existing);
    } else {
      const newLicense = this.licenseRepository.create({
        licenseId: payload.licenseId,
        product: payload.product,
        organizationName: payload.organizationName,
        maxUsers: payload.maxUsers || 200,
        registerExpiresAt: payload.registerExpiresAt ? new Date(payload.registerExpiresAt) : null,
        expiresAt: usageExpiresAt,
        isUnlimited: isUnlimited,
        issuedAt: new Date(payload.issuedAt),
        fileHash: fileHash,
        licenseRaw: canonicalPayloadString,
        signature: signature,
        isActive: true,
      });
      await this.licenseRepository.save(newLicense);
    }

    this.logger.log(
      `🎉 신규 라이선스 등록 및 파일-DB 동기화 완료: ${payload.organizationName} (${payload.licenseId})`,
    );

    return this.getLicenseStatus();
  }
}
