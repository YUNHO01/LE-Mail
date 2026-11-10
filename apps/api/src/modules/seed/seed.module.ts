import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User, Mailbox, Domain, SystemSetting } from '../database/entities';
import { SeedService } from './seed.service';
import { SettingsSeedService } from './settings-seed.service';
import { SmtpIngestionModule } from '../smtp-ingestion/smtp-ingestion.module';
import { MailFolderModule } from '../mail-folder/mail-folder.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Mailbox, Domain, SystemSetting]),
    SmtpIngestionModule,
    MailFolderModule,
  ],
  providers: [SeedService, SettingsSeedService],
  exports: [SeedService, SettingsSeedService],
})
export class SeedModule {}
