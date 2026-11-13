import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CalendarService } from './calendar.service';
import { CreateCalendarDto } from './dto/create-calendar.dto';
import { UpdateCalendarDto } from './dto/update-calendar.dto';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto';
import { UpdateCalendarEventDto } from './dto/update-calendar-event.dto';
import { ImportIcsDto } from './dto/import-ics.dto';

@ApiTags('Calendar')
@Controller('calendar')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get('calendars')
  @ApiOperation({ summary: '내 캘린더 및 사내 공유 캘린더 목록 조회' })
  async getCalendars(@CurrentUser() user: any) {
    return this.calendarService.getCalendars(user.id);
  }

  @Post('calendars')
  @ApiOperation({ summary: '새 캘린더 생성' })
  async createCalendar(
    @CurrentUser() user: any,
    @Body() dto: CreateCalendarDto,
  ) {
    return this.calendarService.createCalendar(user.id, dto);
  }

  @Patch('calendars/:id')
  @ApiOperation({ summary: '캘린더 정보/표시 여부 수정' })
  async updateCalendar(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateCalendarDto,
  ) {
    return this.calendarService.updateCalendar(user.id, id, dto);
  }

  @Delete('calendars/:id')
  @ApiOperation({ summary: '캘린더 삭제' })
  async deleteCalendar(@CurrentUser() user: any, @Param('id') id: string) {
    return this.calendarService.deleteCalendar(user.id, id);
  }

  @Get('events')
  @ApiOperation({ summary: '기간별 일정 목록 조회' })
  async getEvents(
    @CurrentUser() user: any,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('calendarIds') calendarIds?: string,
    @Query('search') search?: string,
  ) {
    return this.calendarService.getEvents(user.id, {
      start,
      end,
      calendarIds,
      search,
    });
  }

  @Get('export-ics')
  @ApiOperation({ summary: '일정을 iCalendar(.ics) 파일로 내보내기' })
  async exportIcs(
    @CurrentUser() user: any,
    @Res() res: Response,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('calendarIds') calendarIds?: string,
  ) {
    const ics = await this.calendarService.exportEventsToIcs(user.id, {
      start,
      end,
      calendarIds,
    });
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="lemail-calendar.ics"',
    );
    res.send(ics);
  }

  @Post('import-ics')
  @ApiOperation({ summary: 'iCalendar(.ics) 파일에서 일정 가져오기' })
  async importIcs(@CurrentUser() user: any, @Body() dto: ImportIcsDto) {
    return this.calendarService.importEventsFromIcs(
      user.id,
      dto.icsContent,
      dto.calendarId,
    );
  }

  @Post('events')
  @ApiOperation({ summary: '새 일정 등록' })
  async createEvent(
    @CurrentUser() user: any,
    @Body() dto: CreateCalendarEventDto,
  ) {
    return this.calendarService.createEvent(user.id, dto);
  }

  @Patch('events/:id')
  @ApiOperation({ summary: '일정 수정' })
  async updateEvent(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateCalendarEventDto,
  ) {
    return this.calendarService.updateEvent(user.id, id, dto);
  }

  @Delete('events/:id')
  @ApiOperation({ summary: '일정 삭제' })
  async deleteEvent(@CurrentUser() user: any, @Param('id') id: string) {
    return this.calendarService.deleteEvent(user.id, id);
  }
}
