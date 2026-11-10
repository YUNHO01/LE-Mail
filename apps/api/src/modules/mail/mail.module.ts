import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailMessage } from '../database/entities/mail-message.entity';
import { MailAttachment } from '../database/entities/mail-attachment.entity';
import { MailRecipient } from '../database/entities/mail-recipient.entity';
import { MailFolder, UserMail, User } from '../database/entities';
import { MailService } from './mail.service';
import { MailController } from './mail.controller';
import { WorkerPoolModule } from '../worker-pool/worker-pool.module';
import { SettingsModule } from '../settings/settings.module';
import { SpamModule } from '../spam/spam.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MailMessage,
      MailAttachment,
      MailRecipient,
      MailFolder,
      UserMail,
      User,
    ]),
    WorkerPoolModule,
    SettingsModule,
    forwardRef(() => SpamModule),
  ],
  controllers: [MailController],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
