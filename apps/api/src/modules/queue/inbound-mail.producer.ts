import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  InboundMailJobData,
  INBOUND_MAIL_QUEUE_NAME,
  PROCESS_MAIL_JOB_NAME,
} from './interfaces/inbound-mail.interface';

@Injectable()
export class InboundMailProducer {
  private readonly logger = new Logger(InboundMailProducer.name);

  constructor(
    @InjectQueue(INBOUND_MAIL_QUEUE_NAME)
    private readonly queue: Queue<InboundMailJobData>,
  ) {}

  async enqueueInbound(data: InboundMailJobData): Promise<void> {
    this.logger.log(
      `Enqueuing inbound mail job: ${data.id} (from: ${data.from}, recipients: ${data.to.length})`,
    );

    await this.queue.add(PROCESS_MAIL_JOB_NAME, data, {
      jobId: data.id,
      removeOnComplete: true,
      removeOnFail: false,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    });
  }
}
