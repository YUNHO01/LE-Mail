import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Mailbox } from '../database/entities/mailbox.entity';
import { MailboxService } from './mailbox.service';
import { MailboxController } from './mailbox.controller';
import { SmtpIngestionModule } from '../smtp-ingestion/smtp-ingestion.module';

@Module({
  imports: [TypeOrmModule.forFeature([Mailbox]), SmtpIngestionModule],
  controllers: [MailboxController],
  providers: [MailboxService],
  exports: [MailboxService],
})
export class MailboxModule {}
