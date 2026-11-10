import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailMessage } from '../database/entities/mail-message.entity';
import { Mailbox } from '../database/entities/mailbox.entity';
import { QueueModule } from '../queue/queue.module';
import { SpamModule } from '../spam/spam.module';
import { MonitoringService } from './monitoring.service';
import { MonitoringController } from './monitoring.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([MailMessage, Mailbox]),
    QueueModule,
    SpamModule,
  ],
  controllers: [MonitoringController],
  providers: [MonitoringService],
  exports: [MonitoringService],
})
export class MonitoringModule {}
