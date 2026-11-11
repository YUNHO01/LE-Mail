import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contact, ContactGroup, User } from '../database/entities';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { ContactsImportExportService } from './contacts-import-export.service';

@Module({
  imports: [TypeOrmModule.forFeature([Contact, ContactGroup, User])],
  controllers: [ContactsController],
  providers: [ContactsService, ContactsImportExportService],
  exports: [ContactsService],
})
export class ContactsModule {}
