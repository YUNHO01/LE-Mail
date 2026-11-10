import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { Domain } from '../database/entities/domain.entity';

export interface GeneratedDkimKey {
  selector: string;
  privateKey: string;
  publicKey: string;
  dnsTxtRecord: string;
  dnsHostRecord: string;
}

export interface DkimNodemailerConfig {
  domainName: string;
  keySelector: string;
  privateKey: string;
  cacheDir?: string | false;
}

@Injectable()
export class DkimSignService {
  private readonly logger = new Logger(DkimSignService.name);

  constructor(
    @InjectRepository(Domain)
    private readonly domainRepo: Repository<Domain>,
  ) {}

  /**
   * 표준 2048-bit RSA 암호화 키 쌍 생성 (순수 Node.js crypto 모듈 사용으로 OS 무관 100% 호환)
   */
  generateDkimKeyPair(selector: string = 'default', domainName: string = 'example.com'): GeneratedDkimKey {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
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

    // DNS TXT 레코드용 Base64 추출 (헤더/푸터 및 개행 제거)
    const cleanPublicKeyBase64 = publicKey
      .replace(/-----BEGIN PUBLIC KEY-----/g, '')
      .replace(/-----END PUBLIC KEY-----/g, '')
      .replace(/\r?\n|\r/g, '')
      .trim();

    const dnsTxtRecord = `v=DKIM1; k=rsa; p=${cleanPublicKeyBase64}`;
    const dnsHostRecord = `${selector}._domainkey.${domainName}`;

    return {
      selector,
      privateKey,
      publicKey,
      dnsTxtRecord,
      dnsHostRecord,
    };
  }

  /**
   * 발신 도메인에 해당하는 DKIM 서명 설정 조회
   */
  async getDkimConfigForDomain(domainName: string): Promise<DkimNodemailerConfig | null> {
    if (!domainName) return null;
    const cleanDomain = domainName.toLowerCase().trim();

    try {
      const domain = await this.domainRepo.findOne({
        where: { name: cleanDomain },
      });

      if (domain && domain.dkimPrivateKey) {
        return {
          domainName: domain.name,
          keySelector: domain.dkimSelector || 'default',
          privateKey: domain.dkimPrivateKey,
          cacheDir: false,
        };
      }
    } catch (err: any) {
      this.logger.warn(`Failed to lookup domain DKIM key from DB: ${err.message}`);
    }

    // 환경 변수 기반 전역 DKIM Fallback 지원
    const envPrivateKey = process.env.DKIM_PRIVATE_KEY;
    const envSelector = process.env.DKIM_SELECTOR || 'default';
    const envDomain = (process.env.DKIM_DOMAIN || '').toLowerCase().trim();

    if (envPrivateKey && (!envDomain || envDomain === cleanDomain)) {
      return {
        domainName: cleanDomain,
        keySelector: envSelector,
        privateKey: envPrivateKey.replace(/\\n/g, '\n'),
        cacheDir: false,
      };
    }

    return null;
  }
}
