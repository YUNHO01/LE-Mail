import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import Redis from 'ioredis';
import { INBOUND_MAIL_QUEUE_NAME } from '../queue/interfaces/inbound-mail.interface';
import { MailMessage, MailStatus, Direction } from '../database/entities/mail-message.entity';
import { Mailbox } from '../database/entities/mailbox.entity';
import { SystemOverviewDto, ImapStatsDto, QueueCounts } from '@lemail/shared-types';
import { AttachmentSecurityService } from '../spam/attachment-security.service';

@Injectable()
export class MonitoringService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MonitoringService.name);
  private redisClient: Redis | null = null;

  constructor(
    private readonly configService: ConfigService,
    @InjectQueue(INBOUND_MAIL_QUEUE_NAME)
    private readonly inboundQueue: Queue,
    @InjectRepository(MailMessage)
    private readonly messageRepo: Repository<MailMessage>,
    @InjectRepository(Mailbox)
    private readonly mailboxRepo: Repository<Mailbox>,
    @Optional() private readonly attachmentSecurityService?: AttachmentSecurityService,
  ) {}

  onModuleInit() {
    const redisHost = this.configService.get<string>('redis.host') || '127.0.0.1';
    const redisPort = this.configService.get<number>('redis.port') || 6379;
    const redisPassword = this.configService.get<string>('redis.password') || undefined;

    this.redisClient = new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
  }

  async onModuleDestroy() {
    if (this.redisClient) {
      await this.redisClient.quit().catch(() => {});
    }
  }

  async getQueueStats() {
    const jobCounts = await this.inboundQueue.getJobCounts(
      'waiting',
      'active',
      'completed',
      'failed',
      'delayed',
    );

    const isPaused = await this.inboundQueue.isPaused();

    const counts: QueueCounts = {
      waiting: jobCounts.waiting || 0,
      active: jobCounts.active || 0,
      completed: jobCounts.completed || 0,
      failed: jobCounts.failed || 0,
      delayed: jobCounts.delayed || 0,
    };

    return {
      queueName: INBOUND_MAIL_QUEUE_NAME,
      isPaused,
      counts,
    };
  }

  async getSystemOverview(): Promise<SystemOverviewDto> {
    const [queueStats, clamavStats] = await Promise.all([
      this.getQueueStats(),
      this.attachmentSecurityService
        ? this.attachmentSecurityService.pingClamAV(undefined, undefined, 1000).catch((err) => ({
            enabled: false,
            isHealthy: false,
            host: '127.0.0.1',
            port: 3310,
            errorMessage: err.message,
          }))
        : Promise.resolve(undefined),
    ]);

    // 1. IMAP 실시간 메트릭 및 Heartbeat 확인 (Redis 조회)
    let imapStats: ImapStatsDto = {
      activeConnections: 0,
      maxConnections: 1000,
      isHealthy: false,
    };

    if (this.redisClient) {
      try {
        if (this.redisClient.status !== 'ready' && this.redisClient.status !== 'connecting') {
          await this.redisClient.connect().catch((err) => {
            this.logger.warn(`Redis connect error: ${err.message}`);
          });
        }

        const [activeConnStr, maxConnStr, heartbeatStr] = await this.redisClient.mget(
          'imap:stats:active_connections',
          'imap:stats:max_connections',
          'imap:stats:heartbeat',
        );

        const isHealthy =
          !!heartbeatStr && Date.now() - parseInt(heartbeatStr, 10) < 15000;
        imapStats = {
          activeConnections: isHealthy ? parseInt(activeConnStr || '0', 10) : 0,
          maxConnections: parseInt(maxConnStr || '1000', 10),
          isHealthy,
        };
      } catch (err: any) {
        this.logger.warn(`Failed to fetch IMAP metrics from Redis: ${err.message}`);
      }
    }

    // 2. 금일(00:00 이후) 메일 통계 집계 (수신 및 발송)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      todayTotal,
      todayProcessed,
      todayFailed,
      todayInboundTotal,
      todayInboundFailed,
      todayOutboundTotal,
      todayOutboundFailed,
      todayQuarantined,
      totalQuarantined,
      todaySpamBlocked,
    ] = await Promise.all([
      this.messageRepo.count({
        where: { createdAt: MoreThanOrEqual(todayStart) },
      }),
      this.messageRepo.count({
        where: {
          status: MailStatus.PROCESSED,
          createdAt: MoreThanOrEqual(todayStart),
        },
      }),
      this.messageRepo.count({
        where: {
          status: MailStatus.FAILED,
          createdAt: MoreThanOrEqual(todayStart),
        },
      }),
      this.messageRepo.count({
        where: {
          direction: Direction.INBOUND,
          createdAt: MoreThanOrEqual(todayStart),
        },
      }),
      this.messageRepo.count({
        where: {
          direction: Direction.INBOUND,
          status: MailStatus.FAILED,
          createdAt: MoreThanOrEqual(todayStart),
        },
      }),
      this.messageRepo.count({
        where: {
          direction: Direction.OUTBOUND,
          createdAt: MoreThanOrEqual(todayStart),
        },
      }),
      this.messageRepo.count({
        where: {
          direction: Direction.OUTBOUND,
          status: MailStatus.FAILED,
          createdAt: MoreThanOrEqual(todayStart),
        },
      }),
      this.messageRepo.count({
        where: {
          status: MailStatus.QUARANTINED,
          createdAt: MoreThanOrEqual(todayStart),
        },
      }),
      this.messageRepo.count({
        where: { status: MailStatus.QUARANTINED },
      }),
      this.messageRepo
        .createQueryBuilder('m')
        .where('m.createdAt >= :today AND m.direction = :dir AND (m.status = :quarantine OR m.spamScore >= 5.0)', {
          today: todayStart,
          dir: Direction.INBOUND,
          quarantine: MailStatus.QUARANTINED,
        })
        .getCount(),
    ]);

    // 3. 기존 메일박스 및 전체 통계 (하위 호환성 유지)
    const [totalMails, processedMails, failedMails] = await Promise.all([
      this.messageRepo.count(),
      this.messageRepo.count({ where: { status: MailStatus.PROCESSED } }),
      this.messageRepo.count({ where: { status: MailStatus.FAILED } }),
    ]);

    const activeMailboxes = await this.mailboxRepo.count({
      where: { isActive: true },
    });

    const memoryUsage = process.memoryUsage();

    const spamBlockRate =
      todayInboundTotal > 0
        ? Math.round((todaySpamBlocked / todayInboundTotal) * 1000) / 10
        : 0;

    return {
      uptimeSeconds: Math.floor(process.uptime()),
      memory: {
        rssMb: Math.round(memoryUsage.rss / 1024 / 1024),
        heapUsedMb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      },
      queue: queueStats,
      imap: imapStats,
      clamav: clamavStats,
      todayMails: {
        todayTotal,
        todayProcessed,
        todayFailed,
        todayInboundTotal,
        todayInboundFailed,
        todayOutboundTotal,
        todayOutboundFailed,
        todayQuarantined,
        todaySpamBlocked,
        todaySpamRate: spamBlockRate,
      },
      mailSummary: {
        totalMails,
        processedMails,
        failedMails,
        activeMailboxes,
      },
      spamSecurity: {
        totalQuarantined,
        todayQuarantined,
        todaySpamBlocked,
        spamBlockRate,
      },
    };
  }
}
