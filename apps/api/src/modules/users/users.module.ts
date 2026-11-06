import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User, Mailbox, Domain } from '../database/entities';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { SmtpIngestionModule } from '../smtp-ingestion/smtp-ingestion.module';
import { MailFolderModule } from '../mail-folder/mail-folder.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Mailbox, Domain]),
    SmtpIngestionModule,
    MailFolderModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
