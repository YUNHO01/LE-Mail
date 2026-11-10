import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as nodemailer from 'nodemailer';
import Redis from 'ioredis';
import * as fs from 'fs';
import * as path from 'path';
import {
  SettingCategory,
  RestartLevel,
  TargetModule,
} from '@lemail/shared-types';
import { SystemSetting } from '../database/entities/system-setting.entity';
import { CryptoService } from '../../common/crypto/crypto.service';
import {
  TestRelayConnectionDto,
  TestRedisConnectionDto,
} from './dto/step-settings.dto';

export const STEP_CATEGORY_MAP: Record<number, SettingCategory> = {
  1: SettingCategory.SERVER,
  2: SettingCategory.SMTP_INBOUND,
  3: SettingCategory.SMTP_OUTBOUND,
  4: SettingCategory.AUTH,
  5: SettingCategory.INFRA,
};

export const CATEGORY_LABEL_MAP: Record<SettingCategory, string> = {
  [SettingCategory.SERVER]: '기본 서버 및 작업 경로',
  [SettingCategory.SMTP_INBOUND]: '메일 수신(Inbound SMTP) 엔진',
  [SettingCategory.SMTP_OUTBOUND]: '메일 발송 & 스마트호스트 릴레이',
  [SettingCategory.AUTH]: '보안 및 JWT 인증',
  [SettingCategory.INFRA]: '데이터베이스 & Redis 인프라',
};

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    @InjectRepository(SystemSetting)
    private readonly settingsRepo: Repository<SystemSetting>,
    private readonly cryptoService: CryptoService,
  ) {}

  /**
   * 단계(Step)별 설정 조회 (민감 정보는 마스킹 처리)
   */
  async getSettingsByStep(stepNumber: number) {
    const category = STEP_CATEGORY_MAP[stepNumber];
    if (!category) {
      throw new NotFoundException(`존재하지 않는 설정 단계입니다: Step ${stepNumber}`);
    }

    const items = await this.settingsRepo.find({
      where: { category },
      order: { key: 'ASC' },
    });

    const settings: Record<string, any> = {};
    const metadata: Record<string, any> = {};

    for (const item of items) {
      let castedValue: any = item.value;

      if (item.isSecret && item.value) {
        castedValue = this.cryptoService.maskSecret(item.value);
      } else if (item.value !== null && item.value !== undefined) {
        if (item.valueType === 'number') {
          castedValue = Number(item.value);
        } else if (item.valueType === 'boolean') {
          castedValue = item.value === 'true' || item.value === '1';
        } else if (item.valueType === 'json') {
          try {
            castedValue = JSON.parse(item.value);
          } catch {
            castedValue = item.value;
          }
        }
      }

      settings[item.key] = castedValue;
      metadata[item.key] = {
        description: item.description,
        valueType: item.valueType,
        isEncrypted: item.isEncrypted,
        isSecret: item.isSecret,
        restartRequired: item.restartRequired,
        targetModule: item.targetModule,
      };
    }

    return {
      step: stepNumber,
      category,
      categoryLabel: CATEGORY_LABEL_MAP[category],
      settings,
      metadata,
    };
  }

  /**
   * 단계(Step)별 설정 저장 및 변경 영향도(재시작 레벨, 대상 모듈) 분석
   */
  async saveStepSettings(
    stepNumber: number,
    newSettings: Record<string, any>,
    updatedBy?: string,
  ) {
    const category = STEP_CATEGORY_MAP[stepNumber];
    if (!category) {
      throw new NotFoundException(`존재하지 않는 설정 단계입니다: Step ${stepNumber}`);
    }

    const currentItems = await this.settingsRepo.find({
      where: { category },
    });

    const changedKeys: string[] = [];
    const targetModules = new Set<TargetModule>();
    let highestRestartLevel: RestartLevel = RestartLevel.NONE;

    const rankRestart = (level: RestartLevel): number => {
      if (level === RestartLevel.HARD) return 3;
      if (level === RestartLevel.SOFT) return 2;
      return 1;
    };

    const envUpdates: Record<string, string> = {};

    for (const item of currentItems) {
      if (!(item.key in newSettings)) {
        continue;
      }

      const inputRawVal = newSettings[item.key];
      let finalStringVal: string = '';

      // 마스킹된 비밀번호를 그대로 보낸 경우 변경하지 않음
      if (item.isSecret && (inputRawVal === '••••••••' || inputRawVal === '')) {
        continue;
      }

      if (inputRawVal === null || inputRawVal === undefined) {
        finalStringVal = '';
      } else if (typeof inputRawVal === 'boolean') {
        finalStringVal = inputRawVal ? 'true' : 'false';
      } else {
        finalStringVal = String(inputRawVal).trim();
      }

      // 암호화 처리 필요 항목
      let storedDbVal = finalStringVal;
      let effectiveCompareVal = finalStringVal;

      if (item.isEncrypted && finalStringVal) {
        storedDbVal = this.cryptoService.encrypt(finalStringVal);
        // 비교용 기존 평문 복호화
        const currentDecrypted = item.value ? this.cryptoService.decrypt(item.value) : '';
        if (currentDecrypted === finalStringVal) {
          continue; // 동일한 값이면 스킵
        }
      } else {
        if (item.value === finalStringVal) {
          continue; // 동일한 값이면 스킵
        }
      }

      // 변경 감지
      changedKeys.push(item.key);
      if (item.targetModule && item.targetModule !== TargetModule.NONE) {
        targetModules.add(item.targetModule);
      }

      if (rankRestart(item.restartRequired) > rankRestart(highestRestartLevel)) {
        highestRestartLevel = item.restartRequired;
      }

      item.value = storedDbVal;
      item.updatedBy = updatedBy || null;
      await this.settingsRepo.save(item);

      // .env 동기화 대상 (Step 5의 INFRA 또는 PORT)
      envUpdates[item.key] = finalStringVal;
    }

    // 파일 시스템 .env Write-back (부트스트랩 동기화)
    if (Object.keys(envUpdates).length > 0) {
      this.syncToEnvFile(envUpdates);
    }

    const requiresRestart = highestRestartLevel !== RestartLevel.NONE;

    this.logger.log(
      `Saved Step ${stepNumber} [${category}]. Changed: [${changedKeys.join(', ')}]. Restart: ${highestRestartLevel}`,
    );

    return {
      success: true,
      message: `Step ${stepNumber} (${CATEGORY_LABEL_MAP[category]}) 설정이 안전하게 저장되었습니다.`,
      step: stepNumber,
      category,
      categoryLabel: CATEGORY_LABEL_MAP[category],
      requiresRestart,
      restartLevel: highestRestartLevel,
      targetModules: Array.from(targetModules),
      changedKeys,
    };
  }

  /**
   * 관리자 전용: 특정 키의 암호화된 비밀번호를 원본 평문으로 복호화하여 반환
   */
  async revealSecret(key: string): Promise<{ key: string; value: string }> {
    const item = await this.settingsRepo.findOne({ where: { key } });
    if (!item) {
      throw new NotFoundException(`설정 키 ${key}를 찾을 수 없습니다.`);
    }

    if (!item.value) {
      return { key, value: '' };
    }

    if (item.isEncrypted) {
      const decrypted = this.cryptoService.decrypt(item.value);
      return { key, value: decrypted };
    }

    return { key, value: item.value };
  }

  /**
   * 단일 설정값 조회 (복호화 지원)
   */
  async getDecryptedValue(key: string, defaultValue = ''): Promise<string> {
    const item = await this.settingsRepo.findOne({ where: { key } });
    if (!item || item.value === null) {
      return process.env[key] ?? defaultValue;
    }

    if (item.isEncrypted && item.value) {
      try {
        return this.cryptoService.decrypt(item.value);
      } catch (e: any) {
        this.logger.error(`Failed to decrypt setting key ${key}: ${e.message}`);
        return defaultValue;
      }
    }

    return item.value;
  }

  /**
   * 아웃바운드 릴레이 설정 조회 (Nodemailer 연동용)
   */
  async getRelayConfig() {
    const [
      enabledVal,
      host,
      portVal,
      secureVal,
      user,
      pass,
      rejectUnauthVal,
      harakaEnabledVal,
      harakaHost,
      harakaPortVal,
    ] = await Promise.all([
      this.getDecryptedValue('SMTP_RELAY_ENABLED', 'false'),
      this.getDecryptedValue('SMTP_RELAY_HOST', ''),
      this.getDecryptedValue('SMTP_RELAY_PORT', '587'),
      this.getDecryptedValue('SMTP_RELAY_SECURE', 'false'),
      this.getDecryptedValue('SMTP_RELAY_USER', ''),
      this.getDecryptedValue('SMTP_RELAY_PASS', ''),
      this.getDecryptedValue('SMTP_RELAY_REJECT_UNAUTHORIZED', 'false'),
      this.getDecryptedValue('HARAKA_ENABLED', 'true'),
      this.getDecryptedValue('HARAKA_HOST', '127.0.0.1'),
      this.getDecryptedValue('HARAKA_PORT', '2526'),
    ]);

    return {
      relayEnabled: enabledVal === 'true',
      relayHost: host,
      relayPort: parseInt(portVal, 10) || 587,
      relaySecure: secureVal === 'true',
      relayUser: user,
      relayPass: pass,
      relayRejectUnauthorized: rejectUnauthVal === 'true',
      harakaEnabled: harakaEnabledVal !== 'false',
      harakaHost: harakaHost || '127.0.0.1',
      harakaPort: parseInt(harakaPortVal, 10) || 2526,
    };
  }

  /**
   * SMTP 릴레이 연결 사전 테스트
   */
  async testRelayConnection(dto: TestRelayConnectionDto) {
    let password = dto.pass;
    // 마스킹된 비밀번호가 전달된 경우 DB의 실제 암호화된 비밀번호 복호화 사용
    if (!password || password === '••••••••') {
      password = await this.getDecryptedValue('SMTP_RELAY_PASS', '');
    }

    try {
      const transporter = nodemailer.createTransport({
        host: dto.host,
        port: dto.port,
        secure: dto.secure,
        auth:
          dto.user && password
            ? {
                user: dto.user,
                pass: password,
              }
            : undefined,
        tls: {
          rejectUnauthorized: dto.rejectUnauthorized ?? false,
        },
        connectionTimeout: 10000,
      });

      await transporter.verify();
      return {
        success: true,
        message: `SMTP 릴레이 서버 (${dto.host}:${dto.port}) 연결 및 인증 테스트에 성공했습니다.`,
      };
    } catch (err: any) {
      this.logger.warn(`SMTP relay connection test failed: ${err.message}`);
      return {
        success: false,
        message: `SMTP 릴레이 연결 실패: ${err.message}`,
      };
    }
  }

  /**
   * Redis 연결 사전 테스트
   */
  async testRedisConnection(dto: TestRedisConnectionDto) {
    let password = dto.password;
    if (!password || password === '••••••••') {
      password = await this.getDecryptedValue('REDIS_PASSWORD', '');
    }

    const redis = new Redis({
      host: dto.host,
      port: dto.port,
      password: password || undefined,
      connectTimeout: 5000,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });

    try {
      await redis.connect();
      const pong = await redis.ping();
      await redis.quit();

      if (pong === 'PONG') {
        return {
          success: true,
          message: `Redis 서버 (${dto.host}:${dto.port}) 핑 응답에 성공했습니다.`,
        };
      }
      return {
        success: false,
        message: `Redis 비정상 응답: ${pong}`,
      };
    } catch (err: any) {
      try {
        redis.disconnect();
      } catch {}
      this.logger.warn(`Redis connection test failed: ${err.message}`);
      return {
        success: false,
        message: `Redis 연결 실패: ${err.message}`,
      };
    }
  }

  /**
   * .env 파일에 주요 설정 동기화 기록 (부트스트랩 안정성 보장)
   */
  private syncToEnvFile(updates: Record<string, string>) {
    const candidateFiles = [
      path.resolve(process.cwd(), '.env'),
      path.resolve(process.cwd(), 'apps/api/.env'),
    ];

    for (const envPath of candidateFiles) {
      try {
        if (!fs.existsSync(envPath)) continue;

        let content = fs.readFileSync(envPath, 'utf8');
        let modified = false;

        for (const [key, val] of Object.entries(updates)) {
          const regex = new RegExp(`^${key}=.*$`, 'm');
          if (regex.test(content)) {
            content = content.replace(regex, `${key}=${val}`);
            modified = true;
          } else {
            content += `\n${key}=${val}`;
            modified = true;
          }
        }

        if (modified) {
          fs.writeFileSync(envPath, content, 'utf8');
          this.logger.log(`Synced ${Object.keys(updates).length} settings to ${envPath}`);
        }
      } catch (err: any) {
        this.logger.warn(`Failed to sync to .env (${envPath}): ${err.message}`);
      }
    }
  }
}
