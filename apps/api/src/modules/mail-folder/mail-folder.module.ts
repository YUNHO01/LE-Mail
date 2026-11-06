import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailFolder, UserMail, User } from '../database/entities';
import { MailFolderService } from './mail-folder.service';
import { MailFolderController } from './mail-folder.controller';

@Module({
  imports: [TypeOrmModule.forFeature([MailFolder, UserMail, User])],
  controllers: [MailFolderController],
  providers: [MailFolderService],
  exports: [MailFolderService],
})
export class MailFolderModule {}
