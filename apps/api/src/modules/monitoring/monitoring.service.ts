import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { INBOUND_MAIL_QUEUE_NAME } from '../queue/interfaces/inbound-mail.interface';
import { MailMessage, MailStatus } from '../database/entities/mail-message.entity';
import { Mailbox } from '../database/entities/mailbox.entity';

@Injectable()
export class MonitoringService {
  constructor(
    @InjectQueue(INBOUND_MAIL_QUEUE_NAME)
    private readonly inboundQueue: Queue,
    @InjectRepository(MailMessage)
    private readonly messageRepo: Repository<MailMessage>,
    @InjectRepository(Mailbox)
    private readonly mailboxRepo: Repository<Mailbox>,
  ) {}

  async getQueueStats() {
    const jobCounts = await this.inboundQueue.getJobCounts(
      'waiting',
      'active',
      'completed',
      'failed',
      'delayed',
    );

    const isPaused = await this.inboundQueue.isPaused();

    return {
      queueName: INBOUND_MAIL_QUEUE_NAME,
      isPaused,
      counts: jobCounts,
    };
  }

  async getSystemOverview() {
    const queueStats = await this.getQueueStats();

    const [totalMails, processedMails, failedMails] = await Promise.all([
      this.messageRepo.count(),
      this.messageRepo.count({ where: { status: MailStatus.PROCESSED } }),
      this.messageRepo.count({ where: { status: MailStatus.FAILED } }),
    ]);

    const activeMailboxes = await this.mailboxRepo.count({
      where: { isActive: true },
    });

    const memoryUsage = process.memoryUsage();

    return {
      uptimeSeconds: Math.floor(process.uptime()),
      memory: {
        rssMb: Math.round(memoryUsage.rss / 1024 / 1024),
        heapUsedMb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      },
      queue: queueStats,
      mailSummary: {
        totalMails,
        processedMails,
        failedMails,
        activeMailboxes,
      },
    };
  }
}
