import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User, Mailbox } from '../database/entities';
import { SeedService } from './seed.service';
import { SmtpIngestionModule } from '../smtp-ingestion/smtp-ingestion.module';
import { MailFolderModule } from '../mail-folder/mail-folder.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Mailbox]),
    SmtpIngestionModule,
    MailFolderModule,
  ],
  providers: [SeedService],
  exports: [SeedService],
})
export class SeedModule {}
