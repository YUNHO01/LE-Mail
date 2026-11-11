import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailBackup, UserMail, MailFolder, MailMessage } from '../database/entities';
import { MailBackupService } from './mail-backup.service';
import { MailBackupCleanupService } from './mail-backup-cleanup.service';
import { MailBackupController } from './mail-backup.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([MailBackup, UserMail, MailFolder, MailMessage]),
  ],
  controllers: [MailBackupController],
  providers: [MailBackupService, MailBackupCleanupService],
  exports: [MailBackupService],
})
export class MailBackupModule {}
