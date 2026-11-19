import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserAiSetting } from '../database/entities/user-ai-setting.entity';
import { UserMailAiSummary } from '../database/entities/user-mail-ai-summary.entity';
import { UserMail } from '../database/entities/user-mail.entity';
import { MailMessage } from '../database/entities/mail-message.entity';
import { User } from '../database/entities/user.entity';
import { MailAttachment } from '../database/entities/mail-attachment.entity';
import { SettingsModule } from '../settings/settings.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiProviderAdapter } from './providers/ai-provider.adapter';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserAiSetting,
      UserMailAiSummary,
      UserMail,
      MailMessage,
      User,
      MailAttachment,
    ]),
    SettingsModule,
  ],
  controllers: [AiController],
  providers: [AiService, AiProviderAdapter],
  exports: [AiService],
})
export class AiModule {}
