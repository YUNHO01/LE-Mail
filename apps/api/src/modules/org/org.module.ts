import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Department,
  Domain,
  Mailbox,
  OrgRank,
  OrgSyncLog,
  OrgTitle,
  SystemSetting,
  User,
} from '../database/entities';
import { LicenseModule } from '../license/license.module';
import { MailFolderModule } from '../mail-folder/mail-folder.module';
import { SmtpIngestionModule } from '../smtp-ingestion/smtp-ingestion.module';
import { MailModule } from '../mail/mail.module';
import { DepartmentsService } from './departments.service';
import { OrgPositionsService } from './org-positions.service';
import { OrgSyncService } from './org-sync.service';
import { OrgController } from './org.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Department,
      OrgRank,
      OrgTitle,
      OrgSyncLog,
      User,
      Mailbox,
      Domain,
      SystemSetting,
    ]),
    LicenseModule,
    MailFolderModule,
    SmtpIngestionModule,
    forwardRef(() => MailModule),
  ],
  controllers: [OrgController],
  providers: [DepartmentsService, OrgPositionsService, OrgSyncService],
  exports: [DepartmentsService, OrgPositionsService, OrgSyncService],
})
export class OrgModule {}
