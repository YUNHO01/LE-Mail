import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Calendar,
  CalendarEvent,
  CalendarEventAttendee,
  SystemHoliday,
  SystemSetting,
  User,
} from '../database/entities';
import { MailModule } from '../mail/mail.module';
import { CalendarController } from './calendar.controller';
import { AdminHolidayController } from './admin-holiday.controller';
import { CalendarService } from './calendar.service';
import { CalendarReminderService } from './calendar-reminder.service';
import { CalendarIcsService } from './calendar-ics.service';
import { HolidayService } from './holiday.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Calendar,
      CalendarEvent,
      CalendarEventAttendee,
      SystemHoliday,
      SystemSetting,
      User,
    ]),
    MailModule,
  ],
  controllers: [CalendarController, AdminHolidayController],
  providers: [
    CalendarService,
    CalendarReminderService,
    CalendarIcsService,
    HolidayService,
  ],
  exports: [CalendarService, HolidayService],
})
export class CalendarModule {}
