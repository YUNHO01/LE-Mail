import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../database/entities';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { MailFolderModule } from '../mail-folder/mail-folder.module';
import { ContactsModule } from '../contacts/contacts.module';
import { CalendarModule } from '../calendar/calendar.module';
import { UsersModule } from '../users/users.module';
import { SettingsModule } from '../settings/settings.module';
import { SpamModule } from '../spam/spam.module';
import { McpController } from './mcp.controller';
import { McpServerService } from './mcp-server.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    AuthModule,
    MailModule,
    MailFolderModule,
    ContactsModule,
    CalendarModule,
    UsersModule,
    SettingsModule,
    SpamModule,
  ],
  controllers: [McpController],
  providers: [McpServerService],
  exports: [McpServerService],
})
export class McpModule {}
