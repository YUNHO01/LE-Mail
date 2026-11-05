import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailMessage } from '../database/entities/mail-message.entity';
import { MailAttachment } from '../database/entities/mail-attachment.entity';
import { MailRecipient } from '../database/entities/mail-recipient.entity';
import { MailService } from './mail.service';
import { MailController } from './mail.controller';
import { WorkerPoolModule } from '../worker-pool/worker-pool.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MailMessage, MailAttachment, MailRecipient]),
    WorkerPoolModule,
  ],
  controllers: [MailController],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
