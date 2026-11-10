import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class CryptoService {
  private readonly logger = new Logger(CryptoService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly ivLength = 12; // GCM 권장 12바이트 IV
  private readonly tagLength = 16;
  private readonly prefix = 'ENC:v1:';
  private key: Buffer;

  constructor() {
    this.key = this.resolveEncryptionKey();
  }

  /**
   * 마스터 암호화 키를 안전하게 해결 (환경변수 -> 로컬 키 파일 -> 파생 키)
   */
  private resolveEncryptionKey(): Buffer {
    // 1. 환경변수 APP_ENCRYPTION_KEY (32바이트 hex or utf8)
    const envKey = process.env.APP_ENCRYPTION_KEY;
    if (envKey) {
      if (envKey.length === 64) {
        return Buffer.from(envKey, 'hex');
      }
      return crypto.createHash('sha256').update(envKey).digest();
    }

    // 2. 로컬 키 파일 확인/생성 (.encryption_key)
    const candidatePaths = [
      path.resolve(process.cwd(), '.encryption_key'),
      path.resolve(process.cwd(), 'apps/api/.encryption_key'),
      path.resolve(__dirname, '../../../../.encryption_key'),
      path.resolve(__dirname, '../../../.encryption_key'),
      path.resolve(__dirname, '../../.encryption_key'),
      path.resolve(__dirname, '../.encryption_key'),
    ];

    try {
      for (const candidate of candidatePaths) {
        if (fs.existsSync(candidate)) {
          const fileContent = fs.readFileSync(candidate, 'utf8').trim();
          if (fileContent.length === 64) {
            return Buffer.from(fileContent, 'hex');
          }
        }
      }

      // 없으면 신규 32바이트 생성 후 저장 시도
      const generatedKey = crypto.randomBytes(32);
      const targetPath = candidatePaths[0];
      fs.writeFileSync(targetPath, generatedKey.toString('hex'), {
        encoding: 'utf8',
        mode: 0o600, // 관리자 읽기/쓰기 권한
      });
      this.logger.log(`Generated new AES-256 master encryption key in ${targetPath}`);
      return generatedKey;
    } catch (e: any) {
      this.logger.warn(
        `Failed to persist .encryption_key file (${e.message}). Falling back to seed derivation.`,
      );
      // 3. Fallback: JWT_SECRET 기반 SHA-256 결정론적 키 파생 (재기동 시 복호화 가능 보장)
      const secret = process.env.JWT_SECRET || 'lemail_default_secure_secret_key_2026!';
      return crypto.createHash('sha256').update(`lemail:crypto:${secret}`).digest();
    }
  }

  /**
   * 평문을 AES-256-GCM 으로 암호화
   * 반환 형식: ENC:v1:<iv_hex>:<auth_tag_hex>:<cipher_hex>
   */
  encrypt(plainText: string): string {
    if (!plainText) {
      return '';
    }

    // 이미 암호화된 문자열인 경우 그대로 반환
    if (this.isEncrypted(plainText)) {
      return plainText;
    }

    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv, {
      authTagLength: this.tagLength,
    });

    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return `${this.prefix}${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  /**
   * 암호문을 복호화하여 원본 평문 반환
   */
  decrypt(encryptedText: string): string {
    if (!encryptedText) {
      return '';
    }

    // 암호화 형식이 아니면 원문 그대로 반환 (하위 호환성)
    if (!this.isEncrypted(encryptedText)) {
      return encryptedText;
    }

    try {
      const payload = encryptedText.substring(this.prefix.length);
      const [ivHex, tagHex, cipherHex] = payload.split(':');

      if (!ivHex || !tagHex || !cipherHex) {
        throw new Error('Malformed encrypted text payload');
      }

      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(tagHex, 'hex');
      const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv, {
        authTagLength: this.tagLength,
      });

      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (err: any) {
      this.logger.error(`Decryption failed: ${err.message}`);
      throw new Error(`복호화 실패: 암호화 키가 일치하지 않거나 데이터가 손상되었습니다.`);
    }
  }

  /**
   * 암호화된 형식인지 확인
   */
  isEncrypted(value: string | null | undefined): boolean {
    if (!value || typeof value !== 'string') {
      return false;
    }
    return value.startsWith(this.prefix);
  }

  /**
   * 민감 정보 마스킹
   */
  maskSecret(value: string | null | undefined): string {
    if (!value) return '';
    return '••••••••';
  }
}
