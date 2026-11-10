import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export interface SpamPolicyConfig {
  spamScoreThreshold: number;        // 기본값: 5.0 (스팸함 이동)
  quarantineScoreThreshold: number;  // 기본값: 10.0 (관리자 격리)
  outboundRateLimitMinute: number;   // 기본값: 30
  outboundRateLimitDay: number;      // 기본값: 500
  quarantineRetentionDays: number;   // 기본값: 30
  clamavEnabled: boolean;            // 기본값: true
  clamavHost: string;                // 기본값: '127.0.0.1'
  clamavPort: number;                // 기본값: 3310
  clamavTimeoutMs: number;           // 기본값: 3000
  bayesianEnabled: boolean;          // 기본값: true
  autoLockAbuseEnabled: boolean;     // 기본값: true
}

@Injectable()
export class SpamConfigService implements OnModuleInit {
  private readonly logger = new Logger(SpamConfigService.name);
  private redisClient: Redis | null = null;
  private readonly redisKey = 'lemail:config:spam_policy';

  private currentConfig: SpamPolicyConfig;

  constructor(private readonly configService: ConfigService) {
    const envClamavEnabled =
      (this.configService.get<string>('CLAMAV_ENABLED') ||
        process.env.CLAMAV_ENABLED ||
        'true') !== 'false';
    const envClamavHost =
      this.configService.get<string>('CLAMAV_HOST') ||
      process.env.CLAMAV_HOST ||
      '127.0.0.1';
    const envClamavPort = parseInt(
      this.configService.get<string>('CLAMAV_PORT') ||
        process.env.CLAMAV_PORT ||
        '3310',
      10,
    );
    const envClamavTimeoutMs = parseInt(
      this.configService.get<string>('CLAMAV_TIMEOUT_MS') ||
        process.env.CLAMAV_TIMEOUT_MS ||
        '3000',
      10,
    );

    this.currentConfig = {
      spamScoreThreshold: 5.0,
      quarantineScoreThreshold: 10.0,
      outboundRateLimitMinute: 30,
      outboundRateLimitDay: 500,
      quarantineRetentionDays: 30,
      clamavEnabled: envClamavEnabled,
      clamavHost: envClamavHost,
      clamavPort: envClamavPort,
      clamavTimeoutMs: envClamavTimeoutMs,
      bayesianEnabled: true,
      autoLockAbuseEnabled: true,
    };
  }

  async onModuleInit() {
    try {
      const host = this.configService.get<string>('redis.host') || '127.0.0.1';
      const port = this.configService.get<number>('redis.port') || 6379;
      const password = this.configService.get<string>('redis.password') || undefined;

      this.redisClient = new Redis({
        host,
        port,
        password,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
      });

      await this.redisClient.connect();
      await this.loadConfigFromRedis();
      this.logger.log('SpamConfigService loaded dynamic spam policy configuration.');
    } catch (err: any) {
      this.logger.warn(`Failed to connect Redis for SpamConfig: ${err.message}. Using default in-memory config.`);
    }
  }

  private async loadConfigFromRedis() {
    if (!this.redisClient || this.redisClient.status !== 'ready') return;
    try {
      const data = await this.redisClient.get(this.redisKey);
      if (data) {
        this.currentConfig = { ...this.currentConfig, ...JSON.parse(data) };
      }
    } catch {}
  }

  getConfig(): SpamPolicyConfig {
    return { ...this.currentConfig };
  }

  async updateConfig(partial: Partial<SpamPolicyConfig>): Promise<SpamPolicyConfig> {
    this.currentConfig = {
      ...this.currentConfig,
      ...partial,
    };

    if (this.redisClient && this.redisClient.status === 'ready') {
      try {
        await this.redisClient.set(this.redisKey, JSON.stringify(this.currentConfig));
      } catch (err: any) {
        this.logger.warn(`Failed to save spam policy to Redis: ${err.message}`);
      }
    }

    this.logger.log(`Updated spam policy config: ${JSON.stringify(partial)}`);
    return this.getConfig();
  }
}
