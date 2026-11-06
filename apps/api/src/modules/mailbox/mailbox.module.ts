import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Mailbox } from '../database/entities/mailbox.entity';
import { Domain } from '../database/entities/domain.entity';
import { MailboxService } from './mailbox.service';
import { MailboxController } from './mailbox.controller';
import { SmtpIngestionModule } from '../smtp-ingestion/smtp-ingestion.module';

@Module({
  imports: [TypeOrmModule.forFeature([Mailbox, Domain]), SmtpIngestionModule],
  controllers: [MailboxController],
  providers: [MailboxService],
  exports: [MailboxService],
})
export class MailboxModule {}
