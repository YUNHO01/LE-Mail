import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserAiSetting } from '../database/entities/user-ai-setting.entity';
import { UserMail } from '../database/entities/user-mail.entity';
import { MailAttachment } from '../database/entities/mail-attachment.entity';
import { SettingsModule } from '../settings/settings.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiProviderAdapter } from './providers/ai-provider.adapter';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserAiSetting, UserMail, MailAttachment]),
    SettingsModule,
  ],
  controllers: [AiController],
  providers: [AiService, AiProviderAdapter],
  exports: [AiService],
})
export class AiModule {}
