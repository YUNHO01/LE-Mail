import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Department, Domain, Mailbox, OrgSyncLog, SystemSetting, User } from '../database/entities';
import { LicenseModule } from '../license/license.module';
import { MailFolderModule } from '../mail-folder/mail-folder.module';
import { SmtpIngestionModule } from '../smtp-ingestion/smtp-ingestion.module';
import { MailModule } from '../mail/mail.module';
import { DepartmentsService } from './departments.service';
import { OrgSyncService } from './org-sync.service';
import { OrgController } from './org.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Department, OrgSyncLog, User, Mailbox, Domain, SystemSetting]),
    LicenseModule,
    MailFolderModule,
    SmtpIngestionModule,
    forwardRef(() => MailModule),
  ],
  controllers: [OrgController],
  providers: [DepartmentsService, OrgSyncService],
  exports: [DepartmentsService, OrgSyncService],
})
export class OrgModule {}
