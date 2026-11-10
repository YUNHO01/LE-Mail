import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  HttpException,
  HttpStatus,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { SpamConfigService } from './spam-config.service';

export interface RateLimitUsage {
  minute: { current: number; limit: number };
  day: { current: number; limit: number };
}

@Injectable()
export class OutboundRateLimitService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboundRateLimitService.name);
  private redisClient: Redis | null = null;

  // 분당 발송 한도 (기본값: 30통)
  private readonly limitPerMinute: number;
  // 일일 발송 한도 (기본값: 500통)
  private readonly limitPerDay: number;

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly spamConfigService?: SpamConfigService,
  ) {
    this.limitPerMinute = parseInt(
      this.configService.get<string>('OUTBOUND_RATE_LIMIT_PER_MINUTE') ||
        process.env.OUTBOUND_RATE_LIMIT_PER_MINUTE ||
        '30',
      10,
    );
    this.limitPerDay = parseInt(
      this.configService.get<string>('OUTBOUND_RATE_LIMIT_PER_DAY') ||
        process.env.OUTBOUND_RATE_LIMIT_PER_DAY ||
        '500',
      10,
    );
  }

  async onModuleInit(): Promise<void> {
    try {
      const host =
        this.configService.get<string>('redis.host') ||
        process.env.REDIS_HOST ||
        '127.0.0.1';
      const port =
        this.configService.get<number>('redis.port') ||
        parseInt(process.env.REDIS_PORT || '6379', 10);
      const password =
        this.configService.get<string>('redis.password') ||
        process.env.REDIS_PASSWORD ||
        undefined;

      this.redisClient = new Redis({
        host,
        port,
        password,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        enableOfflineQueue: false,
      });

      await this.redisClient.connect();
      this.logger.log('OutboundRateLimitService connected to Redis successfully.');
    } catch (err: any) {
      this.logger.warn(
        `Failed to connect to Redis for outbound rate limiting: ${err.message}. Rate limiting will operate in fail-open mode.`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redisClient) {
      await this.redisClient.quit().catch(() => {});
    }
  }

  private getMinuteKey(userId: string): string {
    const minuteEpoch = Math.floor(Date.now() / 60000);
    return `lemail:rate:outbound:${userId}:min:${minuteEpoch}`;
  }

  private getDayKey(userId: string): string {
    const dateStr = new Date().toISOString().slice(0, 10);
    return `lemail:rate:outbound:${userId}:day:${dateStr}`;
  }

  /**
   * 계정별 아웃바운드 발송 건수 검사 및 원자적 카운트 증가
   * 허용량 초과 시 HTTP 429 Too Many Requests 예외 발생
   *
   * @param userId 발신 사용자 고유 ID
   * @param recipientCount 발송 대상 수신자 수 (TO + CC + BCC)
   */
  async checkAndIncrement(
    userId: string,
    recipientCount: number = 1,
  ): Promise<{ allowed: boolean; minuteUsed: number; dayUsed: number }> {
    if (!this.redisClient || this.redisClient.status !== 'ready') {
      // Redis 장애 시 메일 발송 업무 연속성을 위해 통과 (Fail-open)
      return { allowed: true, minuteUsed: 0, dayUsed: 0 };
    }

    const minKey = this.getMinuteKey(userId);
    const dayKey = this.getDayKey(userId);

    const config = this.spamConfigService?.getConfig();
    const limitMin = config?.outboundRateLimitMinute ?? this.limitPerMinute;
    const limitDay = config?.outboundRateLimitDay ?? this.limitPerDay;

    try {
      const [currentMinStr, currentDayStr] = await this.redisClient.mget(minKey, dayKey);
      const currentMin = parseInt(currentMinStr || '0', 10);
      const currentDay = parseInt(currentDayStr || '0', 10);

      // 1. 분당 발송 한도 체크
      if (currentMin + recipientCount > limitMin) {
        this.logger.warn(
          `[RateLimit Blocked] User ${userId} exceeded minute limit: ${currentMin} + ${recipientCount} > ${limitMin}`,
        );
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: `분당 메일 발송 한도(${limitMin}건)를 초과하였습니다. 잠시 후 다시 시도해 주세요.`,
            error: 'Too Many Requests',
            limit: limitMin,
            current: currentMin,
            type: 'OUTBOUND_RATE_LIMIT_MINUTE',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // 2. 일일 발송 한도 체크
      if (currentDay + recipientCount > limitDay) {
        this.logger.warn(
          `[RateLimit Blocked] User ${userId} exceeded daily limit: ${currentDay} + ${recipientCount} > ${limitDay}`,
        );
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: `일일 메일 발송 허용 한도(${limitDay}건)를 초과하였습니다. 관리자에게 문의해 주세요.`,
            error: 'Too Many Requests',
            limit: limitDay,
            current: currentDay,
            type: 'OUTBOUND_RATE_LIMIT_DAILY',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // 3. 카운터 증가 및 TTL 설정
      const pipeline = this.redisClient.pipeline();
      pipeline.incrby(minKey, recipientCount);
      pipeline.expire(minKey, 120); // 2분 후 만료
      pipeline.incrby(dayKey, recipientCount);
      pipeline.expire(dayKey, 172800); // 48시간 후 만료
      await pipeline.exec();

      return {
        allowed: true,
        minuteUsed: currentMin + recipientCount,
        dayUsed: currentDay + recipientCount,
      };
    } catch (err: any) {
      if (err instanceof HttpException) {
        throw err;
      }
      this.logger.warn(
        `Redis error during outbound rate limit check: ${err.message}. Allowing request.`,
      );
      return { allowed: true, minuteUsed: 0, dayUsed: 0 };
    }
  }

  /**
   * 특정 사용자의 현재 발송량 조회
   */
  async getUsage(userId: string): Promise<RateLimitUsage> {
    const config = this.spamConfigService?.getConfig();
    const limitMin = config?.outboundRateLimitMinute ?? this.limitPerMinute;
    const limitDay = config?.outboundRateLimitDay ?? this.limitPerDay;

    if (!this.redisClient || this.redisClient.status !== 'ready') {
      return {
        minute: { current: 0, limit: limitMin },
        day: { current: 0, limit: limitDay },
      };
    }

    try {
      const minKey = this.getMinuteKey(userId);
      const dayKey = this.getDayKey(userId);
      const [minStr, dayStr] = await this.redisClient.mget(minKey, dayKey);

      return {
        minute: {
          current: parseInt(minStr || '0', 10),
          limit: limitMin,
        },
        day: {
          current: parseInt(dayStr || '0', 10),
          limit: limitDay,
        },
      };
    } catch {
      return {
        minute: { current: 0, limit: limitMin },
        day: { current: 0, limit: limitDay },
      };
    }
  }

  /**
   * 관리자 발송 제한 초기화
   */
  async resetUsage(userId: string): Promise<void> {
    if (!this.redisClient || this.redisClient.status !== 'ready') return;
    try {
      const minKey = this.getMinuteKey(userId);
      const dayKey = this.getDayKey(userId);
      await this.redisClient.del(minKey, dayKey);
    } catch (err: any) {
      this.logger.warn(`Failed to reset rate limit for user ${userId}: ${err.message}`);
    }
  }
}
