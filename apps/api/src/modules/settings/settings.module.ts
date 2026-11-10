import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemSetting } from '../database/entities/system-setting.entity';
import { SettingsService } from './settings.service';
import { SystemLifecycleService } from './system-lifecycle.service';
import { SettingsController } from './settings.controller';
import { SmtpIngestionModule } from '../smtp-ingestion/smtp-ingestion.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SystemSetting]),
    SmtpIngestionModule,
  ],
  controllers: [SettingsController],
  providers: [SettingsService, SystemLifecycleService],
  exports: [SettingsService, SystemLifecycleService],
})
export class SettingsModule {}
