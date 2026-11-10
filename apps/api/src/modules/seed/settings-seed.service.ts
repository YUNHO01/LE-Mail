import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  SettingCategory,
  RestartLevel,
  TargetModule,
} from '@lemail/shared-types';
import { SystemSetting } from '../database/entities/system-setting.entity';
import { CryptoService } from '../../common/crypto/crypto.service';

interface DefaultSettingDefinition {
  category: SettingCategory;
  key: string;
  envKey: string;
  defaultValue: string;
  valueType: 'string' | 'number' | 'boolean' | 'json';
  isEncrypted: boolean;
  isSecret: boolean;
  restartRequired: RestartLevel;
  targetModule: TargetModule;
  description: string;
}

@Injectable()
export class SettingsSeedService {
  private readonly logger = new Logger(SettingsSeedService.name);

  private readonly defaultDefinitions: DefaultSettingDefinition[] = [
    // Step 1: SERVER
    {
      category: SettingCategory.SERVER,
      key: 'PORT',
      envKey: 'PORT',
      defaultValue: '9200',
      valueType: 'number',
      isEncrypted: false,
      isSecret: false,
      restartRequired: RestartLevel.HARD,
      targetModule: TargetModule.API_SERVER,
      description: 'API 서버 HTTP 리스닝 포트',
    },
    {
      category: SettingCategory.SERVER,
      key: 'WORKER_CONCURRENCY',
      envKey: 'WORKER_CONCURRENCY',
      defaultValue: '5',
      valueType: 'number',
      isEncrypted: false,
      isSecret: false,
      restartRequired: RestartLevel.HARD,
      targetModule: TargetModule.API_SERVER,
      description: '백그라운드 메일 처리 작업자 동시 실행 수',
    },
    {
      category: SettingCategory.SERVER,
      key: 'MAIL_SPOOL_DIR',
      envKey: 'MAIL_SPOOL_DIR',
      defaultValue: './mail-spool',
      valueType: 'string',
      isEncrypted: false,
      isSecret: false,
      restartRequired: RestartLevel.SOFT,
      targetModule: TargetModule.SMTP_INGESTION,
      description: '수신 원시 EML 임시 스풀 저장 디렉터리',
    },
    {
      category: SettingCategory.SERVER,
      key: 'MAIL_ARCHIVE_DIR',
      envKey: 'MAIL_ARCHIVE_DIR',
      defaultValue: './mail-archive',
      valueType: 'string',
      isEncrypted: false,
      isSecret: false,
      restartRequired: RestartLevel.NONE,
      targetModule: TargetModule.NONE,
      description: '영구 아카이브 EML 저장 디렉터리',
    },
    {
      category: SettingCategory.SERVER,
      key: 'MAIL_SPOOL_CLEANUP',
      envKey: 'MAIL_SPOOL_CLEANUP',
      defaultValue: 'false',
      valueType: 'boolean',
      isEncrypted: false,
      isSecret: false,
      restartRequired: RestartLevel.NONE,
      targetModule: TargetModule.NONE,
      description: '메일 처리 완료 후 스풀 원본 즉시 삭제 여부',
    },

    // Step 2: SMTP_INBOUND
    {
      category: SettingCategory.SMTP_INBOUND,
      key: 'SMTP_PORT',
      envKey: 'SMTP_PORT',
      defaultValue: '2525',
      valueType: 'number',
      isEncrypted: false,
      isSecret: false,
      restartRequired: RestartLevel.SOFT,
      targetModule: TargetModule.SMTP_INGESTION,
      description: '메일 수신 ESMTP 리스닝 포트',
    },
    {
      category: SettingCategory.SMTP_INBOUND,
      key: 'SMTP_MAX_CLIENTS',
      envKey: 'SMTP_MAX_CLIENTS',
      defaultValue: '100',
      valueType: 'number',
      isEncrypted: false,
      isSecret: false,
      restartRequired: RestartLevel.SOFT,
      targetModule: TargetModule.SMTP_INGESTION,
      description: '동시 접속 허용 SMTP 클라이언트 수',
    },
    {
      category: SettingCategory.SMTP_INBOUND,
      key: 'SMTP_USE_PROXY',
      envKey: 'SMTP_USE_PROXY',
      defaultValue: 'false',
      valueType: 'boolean',
      isEncrypted: false,
      isSecret: false,
      restartRequired: RestartLevel.SOFT,
      targetModule: TargetModule.SMTP_INGESTION,
      description: 'HAProxy / Reverse Proxy PROXY 프로토콜 지원 여부',
    },
    {
      category: SettingCategory.SMTP_INBOUND,
      key: 'MAILBOX_CACHE_TTL',
      envKey: 'MAILBOX_CACHE_TTL',
      defaultValue: '60',
      valueType: 'number',
      isEncrypted: false,
      isSecret: false,
      restartRequired: RestartLevel.NONE,
      targetModule: TargetModule.NONE,
      description: '사서함 존재 여부 Redis 캐시 TTL(초)',
    },

    // Step 3: SMTP_OUTBOUND
    {
      category: SettingCategory.SMTP_OUTBOUND,
      key: 'HARAKA_ENABLED',
      envKey: 'HARAKA_ENABLED',
      defaultValue: 'true',
      valueType: 'boolean',
      isEncrypted: false,
      isSecret: false,
      restartRequired: RestartLevel.NONE,
      targetModule: TargetModule.HARAKA,
      description: 'Haraka Direct MX 아웃바운드 MTA 활성화 여부',
    },
    {
      category: SettingCategory.SMTP_OUTBOUND,
      key: 'HARAKA_HOST',
      envKey: 'HARAKA_HOST',
      defaultValue: '127.0.0.1',
      valueType: 'string',
      isEncrypted: false,
      isSecret: false,
      restartRequired: RestartLevel.NONE,
      targetModule: TargetModule.HARAKA,
      description: 'Haraka MTA 호스트 주소',
    },
    {
      category: SettingCategory.SMTP_OUTBOUND,
      key: 'HARAKA_PORT',
      envKey: 'HARAKA_PORT',
      defaultValue: '2526',
      valueType: 'number',
      isEncrypted: false,
      isSecret: false,
      restartRequired: RestartLevel.NONE,
      targetModule: TargetModule.HARAKA,
      description: 'Haraka MTA 포트 번호',
    },
    {
      category: SettingCategory.SMTP_OUTBOUND,
      key: 'SMTP_RELAY_ENABLED',
      envKey: 'SMTP_RELAY_ENABLED',
      defaultValue: 'true',
      valueType: 'boolean',
      isEncrypted: false,
      isSecret: false,
      restartRequired: RestartLevel.NONE,
      targetModule: TargetModule.NONE,
      description: '외부 스마트호스트 SMTP 릴레이 활성화 여부',
    },
    {
      category: SettingCategory.SMTP_OUTBOUND,
      key: 'SMTP_RELAY_HOST',
      envKey: 'SMTP_RELAY_HOST',
      defaultValue: 'mail.aibworks.com',
      valueType: 'string',
      isEncrypted: false,
      isSecret: false,
      restartRequired: RestartLevel.NONE,
      targetModule: TargetModule.NONE,
      description: 'SMTP 릴레이 호스트',
    },
    {
      category: SettingCategory.SMTP_OUTBOUND,
      key: 'SMTP_RELAY_PORT',
      envKey: 'SMTP_RELAY_PORT',
      defaultValue: '587',
      valueType: 'number',
      isEncrypted: false,
      isSecret: false,
      restartRequired: RestartLevel.NONE,
      targetModule: TargetModule.NONE,
      description: 'SMTP 릴레이 포트 (587, 465, 25)',
    },
    {
      category: SettingCategory.SMTP_OUTBOUND,
      key: 'SMTP_RELAY_SECURE',
      envKey: 'SMTP_RELAY_SECURE',
      defaultValue: 'false',
      valueType: 'boolean',
      isEncrypted: false,
      isSecret: false,
      restartRequired: RestartLevel.NONE,
      targetModule: TargetModule.NONE,
      description: 'SMTP 릴레이 SSL/TLS 강제 적용 여부',
    },
    {
      category: SettingCategory.SMTP_OUTBOUND,
      key: 'SMTP_RELAY_USER',
      envKey: 'SMTP_RELAY_USER',
      defaultValue: 'admin@aibworks.com',
      valueType: 'string',
      isEncrypted: false,
      isSecret: false,
      restartRequired: RestartLevel.NONE,
      targetModule: TargetModule.NONE,
      description: 'SMTP 릴레이 인증 계정',
    },
    {
      category: SettingCategory.SMTP_OUTBOUND,
      key: 'SMTP_RELAY_PASS',
      envKey: 'SMTP_RELAY_PASS',
      defaultValue: 'Aiblab21!@',
      valueType: 'string',
      isEncrypted: true,
      isSecret: true,
      restartRequired: RestartLevel.NONE,
      targetModule: TargetModule.NONE,
      description: 'SMTP 릴레이 인증 비밀번호',
    },
    {
      category: SettingCategory.SMTP_OUTBOUND,
      key: 'SMTP_RELAY_REJECT_UNAUTHORIZED',
      envKey: 'SMTP_RELAY_REJECT_UNAUTHORIZED',
      defaultValue: 'false',
      valueType: 'boolean',
      isEncrypted: false,
      isSecret: false,
      restartRequired: RestartLevel.NONE,
      targetModule: TargetModule.NONE,
      description: '자체 서명 인증서 거부 여부',
    },

    // Step 4: AUTH
    {
      category: SettingCategory.AUTH,
      key: 'DEFAULT_ADMIN_EMAIL',
      envKey: 'DEFAULT_ADMIN_EMAIL',
      defaultValue: 'admin@lineedge.com',
      valueType: 'string',
      isEncrypted: false,
      isSecret: false,
      restartRequired: RestartLevel.NONE,
      targetModule: TargetModule.NONE,
      description: '시스템 기본 관리자 이메일',
    },
    {
      category: SettingCategory.AUTH,
      key: 'DEFAULT_ADMIN_NAME',
      envKey: 'DEFAULT_ADMIN_NAME',
      defaultValue: '시스템관리자',
      valueType: 'string',
      isEncrypted: false,
      isSecret: false,
      restartRequired: RestartLevel.NONE,
      targetModule: TargetModule.NONE,
      description: '시스템 기본 관리자 이름',
    },
    {
      category: SettingCategory.AUTH,
      key: 'JWT_SECRET',
      envKey: 'JWT_SECRET',
      defaultValue: 'lemail_super_secret_jwt_key_2026!',
      valueType: 'string',
      isEncrypted: true,
      isSecret: true,
      restartRequired: RestartLevel.HARD,
      targetModule: TargetModule.API_SERVER,
      description: 'JWT 토큰 서명 시크릿 키',
    },
    {
      category: SettingCategory.AUTH,
      key: 'JWT_EXPIRES_IN',
      envKey: 'JWT_EXPIRES_IN',
      defaultValue: '1d',
      valueType: 'string',
      isEncrypted: false,
      isSecret: false,
      restartRequired: RestartLevel.NONE,
      targetModule: TargetModule.API_SERVER,
      description: 'JWT 토큰 만료 시간',
    },

    // Step 5: INFRA
    {
      category: SettingCategory.INFRA,
      key: 'DB_HOST',
      envKey: 'DB_HOST',
      defaultValue: '127.0.0.1',
      valueType: 'string',
      isEncrypted: false,
      isSecret: false,
      restartRequired: RestartLevel.HARD,
      targetModule: TargetModule.API_SERVER,
      description: 'MySQL 데이터베이스 호스트 주소',
    },
    {
      category: SettingCategory.INFRA,
      key: 'DB_PORT',
      envKey: 'DB_PORT',
      defaultValue: '3300',
      valueType: 'number',
      isEncrypted: false,
      isSecret: false,
      restartRequired: RestartLevel.HARD,
      targetModule: TargetModule.API_SERVER,
      description: 'MySQL 데이터베이스 포트',
    },
    {
      category: SettingCategory.INFRA,
      key: 'DB_USERNAME',
      envKey: 'DB_USERNAME',
      defaultValue: 'lemail',
      valueType: 'string',
      isEncrypted: false,
      isSecret: false,
      restartRequired: RestartLevel.HARD,
      targetModule: TargetModule.API_SERVER,
      description: 'MySQL 사용자 이름',
    },
    {
      category: SettingCategory.INFRA,
      key: 'DB_PASSWORD',
      envKey: 'DB_PASSWORD',
      defaultValue: 'qweR1234@@',
      valueType: 'string',
      isEncrypted: true,
      isSecret: true,
      restartRequired: RestartLevel.HARD,
      targetModule: TargetModule.API_SERVER,
      description: 'MySQL 비밀번호',
    },
    {
      category: SettingCategory.INFRA,
      key: 'DB_DATABASE',
      envKey: 'DB_DATABASE',
      defaultValue: 'lemaildb',
      valueType: 'string',
      isEncrypted: false,
      isSecret: false,
      restartRequired: RestartLevel.HARD,
      targetModule: TargetModule.API_SERVER,
      description: 'MySQL 데이터베이스명',
    },
    {
      category: SettingCategory.INFRA,
      key: 'DB_POOL_SIZE',
      envKey: 'DB_POOL_SIZE',
      defaultValue: '20',
      valueType: 'number',
      isEncrypted: false,
      isSecret: false,
      restartRequired: RestartLevel.HARD,
      targetModule: TargetModule.API_SERVER,
      description: 'MySQL 커넥션 풀 크기',
    },
    {
      category: SettingCategory.INFRA,
      key: 'REDIS_HOST',
      envKey: 'REDIS_HOST',
      defaultValue: '127.0.0.1',
      valueType: 'string',
      isEncrypted: false,
      isSecret: false,
      restartRequired: RestartLevel.HARD,
      targetModule: TargetModule.API_SERVER,
      description: 'Redis 호스트 주소',
    },
    {
      category: SettingCategory.INFRA,
      key: 'REDIS_PORT',
      envKey: 'REDIS_PORT',
      defaultValue: '6379',
      valueType: 'number',
      isEncrypted: false,
      isSecret: false,
      restartRequired: RestartLevel.HARD,
      targetModule: TargetModule.API_SERVER,
      description: 'Redis 포트 번호',
    },
    {
      category: SettingCategory.INFRA,
      key: 'REDIS_PASSWORD',
      envKey: 'REDIS_PASSWORD',
      defaultValue: 'lemail123!',
      valueType: 'string',
      isEncrypted: true,
      isSecret: true,
      restartRequired: RestartLevel.HARD,
      targetModule: TargetModule.API_SERVER,
      description: 'Redis 비밀번호',
    },
  ];

  constructor(
    @InjectRepository(SystemSetting)
    private readonly settingsRepo: Repository<SystemSetting>,
    private readonly cryptoService: CryptoService,
  ) {}

  /**
   * .env 및 기본 설정을 읽어 DB에 없는 경우 안전하게 시딩
   */
  async seedSettings(): Promise<void> {
    this.logger.log('Checking and seeding system settings from environment...');

    for (const def of this.defaultDefinitions) {
      const existing = await this.settingsRepo.findOne({
        where: { key: def.key },
      });

      if (!existing) {
        // .env 에서 우선 읽고 없으면 defaultValue 사용
        const rawValue = process.env[def.envKey] ?? def.defaultValue;
        let storedValue = rawValue;

        if (def.isEncrypted && rawValue) {
          storedValue = this.cryptoService.encrypt(rawValue);
        }

        const newSetting = this.settingsRepo.create({
          category: def.category,
          key: def.key,
          value: storedValue,
          valueType: def.valueType,
          isEncrypted: def.isEncrypted,
          isSecret: def.isSecret,
          restartRequired: def.restartRequired,
          targetModule: def.targetModule,
          description: def.description,
        });

        await this.settingsRepo.save(newSetting);
        this.logger.log(
          `Seeded system setting [${def.category}] ${def.key} (Encrypted: ${def.isEncrypted})`,
        );
      }
    }

    this.logger.log('System settings verification & seeding completed.');
  }
}
