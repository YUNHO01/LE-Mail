import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User, Mailbox, Domain } from '../database/entities';
import { SeedService } from './seed.service';
import { SmtpIngestionModule } from '../smtp-ingestion/smtp-ingestion.module';
import { MailFolderModule } from '../mail-folder/mail-folder.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Mailbox, Domain]),
    SmtpIngestionModule,
    MailFolderModule,
  ],
  providers: [SeedService],
  exports: [SeedService],
})
export class SeedModule {}
