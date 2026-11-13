import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contact, ContactGroup, Department, User } from '../database/entities';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { ContactsImportExportService } from './contacts-import-export.service';

@Module({
  imports: [TypeOrmModule.forFeature([Contact, ContactGroup, User, Department])],
  controllers: [ContactsController],
  providers: [ContactsService, ContactsImportExportService],
  exports: [ContactsService],
})
export class ContactsModule {}
