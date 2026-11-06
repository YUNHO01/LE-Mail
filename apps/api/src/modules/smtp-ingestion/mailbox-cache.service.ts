import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { Mailbox } from '../database/entities/mailbox.entity';
import { Domain } from '../database/entities/domain.entity';

@Injectable()
export class MailboxCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MailboxCacheService.name);
  private redisClient: Redis;
  private readonly cacheTtlMs: number;
  private readonly redisKey = 'mail:active_mailboxes';

  // L1 In-Memory Cache (0ms 빠른 조회)
  private memoryCache = new Set<string>();
  private lastRefreshedAt = 0;
  private totalRegisteredCount = 0;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Mailbox)
    private readonly mailboxRepo: Repository<Mailbox>,
    @InjectRepository(Domain)
    private readonly domainRepo: Repository<Domain>,
  ) {
    const ttlSec =
      this.configService.get<number>('smtp.cacheTtlSeconds') || 60;
    this.cacheTtlMs = ttlSec * 1000;
  }

  async onModuleInit() {
    this.redisClient = new Redis({
      host: this.configService.get<string>('redis.host'),
      port: this.configService.get<number>('redis.port'),
      password: this.configService.get<string>('redis.password') || undefined,
      lazyConnect: true,
    });

    try {
      await this.redisClient.connect();
      this.logger.log('Connected to Redis for MailboxCacheService');
    } catch (err) {
      this.logger.warn(`Redis connection failed for MailboxCache, fallback to memory: ${err.message}`);
    }

    // 초기 캐시 워밍업
    await this.refreshCache();
  }

  /**
   * 캐시를 DB에서 갱신 (L2 Redis & L1 Memory)
   */
  async refreshCache(): Promise<void> {
    try {
      // 비활성화된 도메인 확인
      const disabledDomains = await this.domainRepo.find({
        where: { isActive: false },
        select: { name: true },
      });
      const disabledDomainSet = new Set(
        disabledDomains.map((d) => d.name.toLowerCase().trim()),
      );

      const activeMailboxes = await this.mailboxRepo.find({
        where: { isActive: true },
        select: { email: true, domain: true },
      });

      this.memoryCache.clear();

      // 도메인이 비활성화된 사서함은 제외
      const validMailboxes = activeMailboxes.filter(
        (m) => !disabledDomainSet.has((m.domain || '').toLowerCase().trim()),
      );
      this.totalRegisteredCount = validMailboxes.length;

      const emails = validMailboxes.map((m) => m.email.toLowerCase().trim());
      for (const email of emails) {
        this.memoryCache.add(email);
      }

      this.lastRefreshedAt = Date.now();

      // Redis Set 동기화
      if (this.redisClient && this.redisClient.status === 'ready') {
        const pipeline = this.redisClient.pipeline();
        pipeline.del(this.redisKey);
        if (emails.length > 0) {
          pipeline.sadd(this.redisKey, ...emails);
          pipeline.expire(this.redisKey, Math.floor(this.cacheTtlMs / 1000));
        }
        await pipeline.exec();
      }

      this.logger.debug(
        `Refreshed Mailbox cache. Active count: ${emails.length}`,
      );
    } catch (err) {
      this.logger.error(`Failed to refresh mailbox cache: ${err.message}`);
    }
  }

  /**
   * 수신자 이메일의 활성 사서함 여부를 O(1)로 고속 판별
   */
  async isMailboxActive(email: string): Promise<boolean> {
    const normalized = email.toLowerCase().trim();

    // 캐시 만료 시 비동기 또는 동기 갱신
    if (Date.now() - this.lastRefreshedAt > this.cacheTtlMs) {
      await this.refreshCache();
    }

    // 등록된 사서함이 아예 없는 초기 개발 환경인 경우 모두 허용
    if (this.totalRegisteredCount === 0) {
      return true;
    }

    return this.memoryCache.has(normalized);
  }

  /**
   * 시스템에 등록된 활성 사서함이 존재하는지 여부
   */
  hasRegisteredMailboxes(): boolean {
    return this.totalRegisteredCount > 0;
  }

  /**
   * 사서함 생성/수정/삭제 시 수동 캐시 무효화
   */
  async invalidate(): Promise<void> {
    this.lastRefreshedAt = 0;
    await this.refreshCache();
  }

  async onModuleDestroy() {
    if (this.redisClient) {
      await this.redisClient.quit();
    }
  }
}
