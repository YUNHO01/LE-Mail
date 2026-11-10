import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { User } from '../database/entities/user.entity';

export interface SecurityIncident {
  userId: string;
  email: string;
  userName: string;
  reason: string;
  lockedAt: string;
  violations: number;
}

@Injectable()
export class AccountDefenseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AccountDefenseService.name);
  private redisClient: Redis | null = null;

  // 자동 잠금 임계치 (15분 이내 연속 3회 위반 시 잠금)
  private readonly maxViolations = 3;
  private readonly violationWindowSec = 900; // 15분

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

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
      this.logger.log('AccountDefenseService connected to Redis successfully.');
    } catch (err: any) {
      this.logger.warn(`Failed to connect Redis for AccountDefense: ${err.message}`);
    }
  }

  async onModuleDestroy() {
    if (this.redisClient) {
      await this.redisClient.quit().catch(() => {});
    }
  }

  /**
   * 발송 한도 위반 또는 비정상 스팸 발송 행위 감지 시 위반 기록 및 임계치 초과 시 계정 자동 잠금
   */
  async recordViolation(
    userId: string,
    reason: string = '발송 한도 초과 또는 대량 스팸성 발송 감지',
  ): Promise<{ locked: boolean; violationCount: number }> {
    if (!this.redisClient || this.redisClient.status !== 'ready') {
      return { locked: false, violationCount: 0 };
    }

    const violationKey = `lemail:defense:violations:${userId}`;
    const lockKey = `lemail:defense:locked:${userId}`;

    try {
      const current = await this.redisClient.incr(violationKey);
      if (current === 1) {
        await this.redisClient.expire(violationKey, this.violationWindowSec);
      }

      if (current >= this.maxViolations) {
        const lockInfo = JSON.stringify({
          userId,
          reason,
          lockedAt: new Date().toISOString(),
          violations: current,
        });

        // 24시간 동안 계정 자동 보호 잠금
        await this.redisClient.set(lockKey, lockInfo, 'EX', 86400);

        this.logger.warn(
          `[CRITICAL ALERT] User ${userId} AUTO-SUSPENDED for abuse protection! Violations: ${current}, Reason: ${reason}`,
        );

        return { locked: true, violationCount: current };
      }

      return { locked: false, violationCount: current };
    } catch (err: any) {
      this.logger.warn(`Error recording security violation: ${err.message}`);
      return { locked: false, violationCount: 0 };
    }
  }

  /**
   * 계정 잠금 여부 확인
   */
  async isAccountLocked(userId: string): Promise<{ locked: boolean; reason?: string; lockedAt?: string }> {
    if (!this.redisClient || this.redisClient.status !== 'ready') {
      return { locked: false };
    }

    try {
      const lockKey = `lemail:defense:locked:${userId}`;
      const data = await this.redisClient.get(lockKey);
      if (!data) return { locked: false };

      const parsed = JSON.parse(data);
      return {
        locked: true,
        reason: parsed.reason,
        lockedAt: parsed.lockedAt,
      };
    } catch {
      return { locked: false };
    }
  }

  /**
   * 관리자 계정 잠금 해제 (수동 복구)
   */
  async unlockAccount(userId: string): Promise<boolean> {
    if (!this.redisClient || this.redisClient.status !== 'ready') {
      return false;
    }

    try {
      const violationKey = `lemail:defense:violations:${userId}`;
      const lockKey = `lemail:defense:locked:${userId}`;
      await this.redisClient.del(violationKey, lockKey);
      this.logger.log(`Account ${userId} manually unlocked by administrator`);
      return true;
    } catch (err: any) {
      this.logger.warn(`Failed to unlock account ${userId}: ${err.message}`);
      return false;
    }
  }

  /**
   * 현재 보호 잠금된 보안 이상 계정 목록 조회
   */
  async getSecurityIncidents(): Promise<SecurityIncident[]> {
    if (!this.redisClient || this.redisClient.status !== 'ready') {
      return [];
    }

    try {
      const keys = await this.redisClient.keys('lemail:defense:locked:*');
      if (keys.length === 0) return [];

      const values = await this.redisClient.mget(...keys);
      const incidents: SecurityIncident[] = [];

      for (const val of values) {
        if (!val) continue;
        const parsed = JSON.parse(val);
        const user = await this.userRepo.findOne({ where: { id: parsed.userId } });

        incidents.push({
          userId: parsed.userId,
          email: user?.email || 'unknown@unknown',
          userName: user?.name || '사용자',
          reason: parsed.reason || '비정상 발송 감지',
          lockedAt: parsed.lockedAt || new Date().toISOString(),
          violations: parsed.violations || 3,
        });
      }

      return incidents;
    } catch {
      return [];
    }
  }
}
