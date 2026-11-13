import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not } from 'typeorm';
import {
  Calendar,
  CalendarTypeEnum,
  CalendarEvent,
  CalendarEventAttendee,
  AttendeeRsvpStatus,
  User,
} from '../database/entities';
import { CreateCalendarDto } from './dto/create-calendar.dto';
import { UpdateCalendarDto } from './dto/update-calendar.dto';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto';
import { UpdateCalendarEventDto } from './dto/update-calendar-event.dto';
import { CalendarIcsService } from './calendar-ics.service';
import { HolidayService } from './holiday.service';
import {
  CalendarDto,
  CalendarEventDto,
  CalendarAttendeeDto,
} from '@lemail/shared-types';

@Injectable()
export class CalendarService {
  constructor(
    @InjectRepository(Calendar)
    private readonly calendarRepo: Repository<Calendar>,
    @InjectRepository(CalendarEvent)
    private readonly eventRepo: Repository<CalendarEvent>,
    @InjectRepository(CalendarEventAttendee)
    private readonly attendeeRepo: Repository<CalendarEventAttendee>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly icsService: CalendarIcsService,
    private readonly holidayService: HolidayService,
  ) {}

  private toCalendarDto(cal: Calendar, ownerName?: string | null): CalendarDto {
    return {
      id: cal.id,
      userId: cal.userId,
      ownerName: ownerName ?? null,
      name: cal.name,
      color: cal.color,
      type: cal.type,
      isDefault: Boolean(cal.isDefault),
      isVisible: Boolean(cal.isVisible),
      sortOrder: cal.sortOrder,
      createdAt: cal.createdAt.toISOString(),
      updatedAt: cal.updatedAt.toISOString(),
    };
  }

  private toAttendeeDto(a: CalendarEventAttendee): CalendarAttendeeDto {
    return {
      id: a.id,
      email: a.email,
      name: a.name ?? null,
      rsvpStatus: a.rsvpStatus,
    };
  }

  private toEventDto(
    ev: CalendarEvent,
    calMap?: Map<string, Calendar>,
    attendeeMap?: Map<string, CalendarEventAttendee[]>,
    overrideRange?: { startAt: Date; endAt: Date; isRecurringInstance?: boolean },
    currentUserId?: string,
  ): CalendarEventDto {
    const cal = calMap?.get(ev.calendarId);
    const attendees = (attendeeMap?.get(ev.id) || []).map((a) =>
      this.toAttendeeDto(a),
    );
    const isReadOnly =
      cal?.type === CalendarTypeEnum.HOLIDAY ||
      (currentUserId !== undefined && ev.userId !== currentUserId);

    return {
      id: ev.id,
      calendarId: ev.calendarId,
      calendarName: cal?.name,
      calendarColor: cal?.color,
      userId: ev.userId,
      title: ev.title,
      description: ev.description ?? null,
      location: ev.location ?? null,
      startAt: (overrideRange?.startAt || ev.startAt).toISOString(),
      endAt: (overrideRange?.endAt || ev.endAt).toISOString(),
      isAllDay: Boolean(ev.isAllDay),
      timezone: ev.timezone,
      rrule: ev.rrule ?? null,
      recurrenceEndAt: ev.recurrenceEndAt
        ? ev.recurrenceEndAt.toISOString()
        : null,
      reminderMinutesBefore: ev.reminderMinutesBefore ?? null,
      sourceMailId: ev.sourceMailId ?? null,
      attendees,
      isRecurringInstance: overrideRange?.isRecurringInstance ?? false,
      isReadOnly,
      createdAt: ev.createdAt.toISOString(),
      updatedAt: ev.updatedAt.toISOString(),
    };
  }

  private parseRruleFrequency(
    rrule: string | null | undefined,
  ): 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' | null {
    if (!rrule) return null;
    const match = rrule.match(/FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)/i);
    return match ? (match[1].toUpperCase() as any) : null;
  }

  private advanceDateByFreq(
    date: Date,
    freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY',
  ): Date {
    const next = new Date(date);
    if (freq === 'DAILY') {
      next.setDate(next.getDate() + 1);
    } else if (freq === 'WEEKLY') {
      next.setDate(next.getDate() + 7);
    } else if (freq === 'MONTHLY') {
      next.setMonth(next.getMonth() + 1);
    } else if (freq === 'YEARLY') {
      next.setFullYear(next.getFullYear() + 1);
    }
    return next;
  }

  private expandRecurringEvent(
    ev: CalendarEvent,
    rangeStart: Date,
    rangeEnd: Date,
    calMap: Map<string, Calendar>,
    attendeeMap: Map<string, CalendarEventAttendee[]>,
    currentUserId: string,
  ): CalendarEventDto[] {
    const freq = this.parseRruleFrequency(ev.rrule);
    if (!freq) {
      return [this.toEventDto(ev, calMap, attendeeMap, undefined, currentUserId)];
    }

    const durationMs = Math.max(0, ev.endAt.getTime() - ev.startAt.getTime());
    const limitEnd =
      ev.recurrenceEndAt && ev.recurrenceEndAt < rangeEnd
        ? ev.recurrenceEndAt
        : rangeEnd;

    const instances: CalendarEventDto[] = [];
    let currentStart = new Date(ev.startAt);
    let guard = 0;
    const MAX_OCCURRENCES = 500;

    while (currentStart <= limitEnd && guard < MAX_OCCURRENCES) {
      const currentEnd = new Date(currentStart.getTime() + durationMs);
      if (currentStart <= rangeEnd && currentEnd >= rangeStart) {
        instances.push(
          this.toEventDto(
            ev,
            calMap,
            attendeeMap,
            {
              startAt: currentStart,
              endAt: currentEnd,
              isRecurringInstance: guard > 0,
            },
            currentUserId,
          ),
        );
      }
      currentStart = this.advanceDateByFreq(currentStart, freq);
      guard++;
    }

    return instances;
  }

  async ensureDefaultCalendar(userId: string): Promise<Calendar> {
    let defaultCal = await this.calendarRepo.findOne({
      where: { userId, isDefault: true },
    });

    if (!defaultCal) {
      const anyPersonal = await this.calendarRepo.findOne({
        where: { userId, type: Not(CalendarTypeEnum.HOLIDAY) },
        order: { sortOrder: 'ASC', createdAt: 'ASC' },
      });
      if (anyPersonal) {
        anyPersonal.isDefault = true;
        defaultCal = await this.calendarRepo.save(anyPersonal);
      } else {
        const created = this.calendarRepo.create({
          userId,
          name: '내 일정',
          color: '#0284c7',
          type: CalendarTypeEnum.PERSONAL,
          isDefault: true,
          isVisible: true,
          sortOrder: 0,
        });
        defaultCal = await this.calendarRepo.save(created);
      }
    }

    // 대한민국 공휴일 캘린더 자동 보장
    const holidayCal = await this.calendarRepo.findOne({
      where: { userId, type: CalendarTypeEnum.HOLIDAY },
    });
    if (!holidayCal) {
      await this.calendarRepo.save(
        this.calendarRepo.create({
          userId,
          name: '대한민국 공휴일',
          color: '#e11d48',
          type: CalendarTypeEnum.HOLIDAY,
          isDefault: false,
          isVisible: true,
          sortOrder: 99,
        }),
      );
    }

    return defaultCal;
  }

  async getCalendars(userId: string): Promise<CalendarDto[]> {
    await this.ensureDefaultCalendar(userId);
    const ownCalendars = await this.calendarRepo.find({
      where: { userId },
      order: { isDefault: 'DESC', sortOrder: 'ASC', createdAt: 'ASC' },
    });

    // 다른 사용자가 생성한 사내 공유(SHARED) 캘린더도 함께 조회
    const sharedCalendars = await this.calendarRepo.find({
      where: { type: CalendarTypeEnum.SHARED, userId: Not(userId) },
      order: { createdAt: 'ASC' },
    });

    let ownerNameMap = new Map<string, string>();
    if (sharedCalendars.length > 0) {
      const ownerIds = Array.from(new Set(sharedCalendars.map((c) => c.userId)));
      const owners = await this.userRepo.find({
        where: { id: In(ownerIds) },
        select: { id: true, name: true },
      });
      ownerNameMap = new Map(owners.map((u) => [u.id, u.name]));
    }

    return [
      ...ownCalendars.map((c) => this.toCalendarDto(c)),
      ...sharedCalendars.map((c) => this.toCalendarDto(c, ownerNameMap.get(c.userId) ?? null)),
    ];
  }

  async createCalendar(
    userId: string,
    dto: CreateCalendarDto,
  ): Promise<CalendarDto> {
    await this.ensureDefaultCalendar(userId);
    const cal = this.calendarRepo.create({
      userId,
      name: dto.name.trim(),
      color: dto.color || '#0284c7',
      type:
        dto.type === 'SHARED'
          ? CalendarTypeEnum.SHARED
          : CalendarTypeEnum.PERSONAL,
      isDefault: false,
      isVisible: dto.isVisible ?? true,
      sortOrder: dto.sortOrder ?? 0,
    });
    const saved = await this.calendarRepo.save(cal);
    return this.toCalendarDto(saved);
  }

  async updateCalendar(
    userId: string,
    id: string,
    dto: UpdateCalendarDto,
  ): Promise<CalendarDto> {
    const cal = await this.calendarRepo.findOne({ where: { id, userId } });
    if (!cal) {
      throw new NotFoundException('캘린더를 찾을 수 없거나 수정 권한이 없습니다.');
    }

    if (cal.type !== CalendarTypeEnum.HOLIDAY) {
      if (dto.name !== undefined) cal.name = dto.name.trim();
      if (dto.type !== undefined && !cal.isDefault) {
        cal.type =
          dto.type === 'SHARED'
            ? CalendarTypeEnum.SHARED
            : CalendarTypeEnum.PERSONAL;
      }
    }
    if (dto.color !== undefined) cal.color = dto.color;
    if (dto.isVisible !== undefined) cal.isVisible = dto.isVisible;
    if (dto.sortOrder !== undefined) cal.sortOrder = dto.sortOrder;

    const saved = await this.calendarRepo.save(cal);
    return this.toCalendarDto(saved);
  }

  async deleteCalendar(userId: string, id: string): Promise<{ deleted: true }> {
    const cal = await this.calendarRepo.findOne({ where: { id, userId } });
    if (!cal) {
      throw new NotFoundException('캘린더를 찾을 수 없습니다.');
    }
    if (cal.isDefault || cal.type === CalendarTypeEnum.HOLIDAY) {
      throw new BadRequestException('기본 캘린더 및 공휴일 캘린더는 삭제할 수 없습니다.');
    }

    await this.calendarRepo.remove(cal);
    return { deleted: true };
  }

  async getEvents(
    userId: string,
    query: {
      start?: string;
      end?: string;
      calendarIds?: string;
      search?: string;
    },
  ): Promise<CalendarEventDto[]> {
    await this.ensureDefaultCalendar(userId);
    const ownCalendars = await this.calendarRepo.find({ where: { userId } });
    const sharedCalendars = await this.calendarRepo.find({
      where: { type: CalendarTypeEnum.SHARED, userId: Not(userId) },
    });
    const allCalendars = [...ownCalendars, ...sharedCalendars];
    const calMap = new Map(allCalendars.map((c) => [c.id, c]));

    let targetCalendarIds: string[];
    if (query.calendarIds) {
      const requested = query.calendarIds
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      targetCalendarIds = requested.filter((id) => calMap.has(id));
    } else {
      targetCalendarIds = allCalendars
        .filter((c) => c.isVisible)
        .map((c) => c.id);
    }

    if (targetCalendarIds.length === 0) {
      return [];
    }

    let rangeStart: Date | null = null;
    let rangeEnd: Date | null = null;

    if (query.start && query.end) {
      rangeStart = new Date(query.start);
      rangeEnd = new Date(query.end);
      if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime())) {
        throw new BadRequestException('유효한 조회 기간(start, end)을 입력해 주세요.');
      }
    }

    const nonHolidayIds = targetCalendarIds.filter(
      (id) => calMap.get(id)?.type !== CalendarTypeEnum.HOLIDAY,
    );

    const result: CalendarEventDto[] = [];

    if (nonHolidayIds.length > 0) {
      const qb = this.eventRepo
        .createQueryBuilder('e')
        .where('e.calendar_id IN (:...ids)', { ids: nonHolidayIds });

      if (rangeStart && rangeEnd) {
        qb.andWhere(
          '( (e.rrule IS NULL AND e.start_at <= :endDate AND e.end_at >= :startDate) OR (e.rrule IS NOT NULL AND e.start_at <= :endDate AND (e.recurrence_end_at IS NULL OR e.recurrence_end_at >= :startDate)) )',
          { startDate: rangeStart, endDate: rangeEnd },
        );
      }

      if (query.search?.trim()) {
        const keyword = `%${query.search.trim()}%`;
        qb.andWhere(
          '(e.title LIKE :keyword OR e.location LIKE :keyword OR e.description LIKE :keyword)',
          { keyword },
        );
      }

      qb.orderBy('e.is_all_day', 'DESC').addOrderBy('e.start_at', 'ASC');

      const events = await qb.getMany();
      if (events.length > 0) {
        const eventIds = events.map((e) => e.id);
        const allAttendees = await this.attendeeRepo.find({
          where: { eventId: In(eventIds) },
        });
        const attendeeMap = new Map<string, CalendarEventAttendee[]>();
        for (const a of allAttendees) {
          if (!attendeeMap.has(a.eventId)) attendeeMap.set(a.eventId, []);
          attendeeMap.get(a.eventId)!.push(a);
        }

        for (const ev of events) {
          if (ev.rrule && rangeStart && rangeEnd) {
            result.push(
              ...this.expandRecurringEvent(
                ev,
                rangeStart,
                rangeEnd,
                calMap,
                attendeeMap,
                userId,
              ),
            );
          } else {
            result.push(
              this.toEventDto(ev, calMap, attendeeMap, undefined, userId),
            );
          }
        }
      }
    }

    // 공휴일 캘린더가 선택된 경우 조회 기간 내 대한민국 공휴일 추가
    const holidayCal = ownCalendars.find(
      (c) =>
        c.type === CalendarTypeEnum.HOLIDAY && targetCalendarIds.includes(c.id),
    );
    if (holidayCal && rangeStart && rangeEnd) {
      const holidays = await this.holidayService.getHolidaysInRange(
        rangeStart,
        rangeEnd,
      );
      const searchLower = query.search?.trim().toLowerCase();
      for (const h of holidays) {
        if (searchLower && !h.name.toLowerCase().includes(searchLower)) {
          continue;
        }
        const dayStart = new Date(`${h.date}T00:00:00`);
        const dayEnd = new Date(`${h.date}T23:59:59`);
        result.push({
          id: `holiday-${h.date}`,
          calendarId: holidayCal.id,
          calendarName: holidayCal.name,
          calendarColor: holidayCal.color,
          userId,
          title: h.name,
          description: '대한민국 법정 공휴일',
          location: null,
          startAt: dayStart.toISOString(),
          endAt: dayEnd.toISOString(),
          isAllDay: true,
          timezone: 'Asia/Seoul',
          isReadOnly: true,
          createdAt: dayStart.toISOString(),
          updatedAt: dayStart.toISOString(),
        });
      }
    }

    return result.sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
    );
  }

  async exportEventsToIcs(
    userId: string,
    query: { start?: string; end?: string; calendarIds?: string },
  ): Promise<string> {
    const events = await this.getEvents(userId, query);
    // 가상 공휴일/반복 인스턴스 중 마스터 중복 제거 후 내보내기
    const exportable = events.filter(
      (ev) => !ev.id.startsWith('holiday-') && !ev.isRecurringInstance,
    );
    return this.icsService.exportEventsToIcs(exportable, 'LEMail Calendar');
  }

  async importEventsFromIcs(
    userId: string,
    icsContent: string,
    calendarId?: string,
  ): Promise<{ imported: number }> {
    const parsed = this.icsService.parseIcsToEvents(icsContent);
    if (parsed.length === 0) {
      throw new BadRequestException(
        'ICS 파일에서 유효한 일정(VEVENT)을 찾지 못했습니다.',
      );
    }

    let targetCal: Calendar | null = null;
    if (calendarId) {
      targetCal = await this.calendarRepo.findOne({ where: { id: calendarId } });
      if (!targetCal) {
        throw new NotFoundException('대상 캘린더를 찾을 수 없습니다.');
      }
      if (targetCal.userId !== userId) {
        throw new ForbiddenException('공유 캘린더는 생성한 사용자만 일정을 등록할 수 있습니다.');
      }
      if (targetCal.type === CalendarTypeEnum.HOLIDAY) {
        throw new BadRequestException('공휴일 캘린더에는 일정을 가져올 수 없습니다.');
      }
    } else {
      targetCal = await this.ensureDefaultCalendar(userId);
    }

    const entities = parsed.map((item) =>
      this.eventRepo.create({
        calendarId: targetCal!.id,
        userId,
        title: item.title,
        description: item.description,
        location: item.location,
        startAt: item.startAt,
        endAt: item.endAt,
        isAllDay: item.isAllDay,
        timezone: 'Asia/Seoul',
        rrule: item.rrule,
      }),
    );

    await this.eventRepo.save(entities);
    return { imported: entities.length };
  }

  private async syncAttendees(
    eventId: string,
    attendees?: { email: string; name?: string | null }[],
  ): Promise<CalendarEventAttendee[]> {
    await this.attendeeRepo.delete({ eventId });
    if (!attendees || attendees.length === 0) {
      return [];
    }

    const uniqueByEmail = new Map<string, { email: string; name?: string | null }>();
    for (const item of attendees) {
      const normalized = item.email.trim().toLowerCase();
      if (normalized && !uniqueByEmail.has(normalized)) {
        uniqueByEmail.set(normalized, { email: normalized, name: item.name ?? null });
      }
    }

    const entities = Array.from(uniqueByEmail.values()).map((a) =>
      this.attendeeRepo.create({
        eventId,
        email: a.email,
        name: a.name,
        rsvpStatus: AttendeeRsvpStatus.PENDING,
      }),
    );

    return this.attendeeRepo.save(entities);
  }

  async createEvent(
    userId: string,
    dto: CreateCalendarEventDto,
  ): Promise<CalendarEventDto> {
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      throw new BadRequestException('유효한 시작/종료 일시를 입력해 주세요.');
    }
    if (endAt < startAt) {
      throw new BadRequestException('종료 일시는 시작 일시보다 빠를 수 없습니다.');
    }

    const recurrenceEndAt = dto.recurrenceEndAt
      ? new Date(dto.recurrenceEndAt)
      : null;

    let calendar: Calendar | null = null;
    if (dto.calendarId) {
      calendar = await this.calendarRepo.findOne({ where: { id: dto.calendarId } });
      if (!calendar) {
        throw new NotFoundException('선택한 캘린더를 찾을 수 없습니다.');
      }
      if (calendar.userId !== userId) {
        throw new ForbiddenException('공유 캘린더는 생성한 사용자만 일정을 등록할 수 있습니다.');
      }
      if (calendar.type === CalendarTypeEnum.HOLIDAY) {
        throw new BadRequestException('공휴일 캘린더에는 일정을 등록할 수 없습니다.');
      }
    } else {
      calendar = await this.ensureDefaultCalendar(userId);
    }

    const ev = this.eventRepo.create({
      calendarId: calendar.id,
      userId,
      title: dto.title.trim(),
      description: dto.description ?? null,
      location: dto.location ?? null,
      startAt,
      endAt,
      isAllDay: dto.isAllDay ?? false,
      timezone: dto.timezone || 'Asia/Seoul',
      rrule: dto.rrule || null,
      recurrenceEndAt,
      reminderMinutesBefore: dto.reminderMinutesBefore ?? null,
      reminderSentAt: null,
      sourceMailId: dto.sourceMailId ?? null,
    });

    const saved = await this.eventRepo.save(ev);
    const savedAttendees = await this.syncAttendees(saved.id, dto.attendees);
    const calMap = new Map([[calendar.id, calendar]]);
    const attendeeMap = new Map([[saved.id, savedAttendees]]);
    return this.toEventDto(saved, calMap, attendeeMap, undefined, userId);
  }

  async updateEvent(
    userId: string,
    id: string,
    dto: UpdateCalendarEventDto,
  ): Promise<CalendarEventDto> {
    const ev = await this.eventRepo.findOne({ where: { id, userId } });
    if (!ev) {
      throw new NotFoundException('일정을 찾을 수 없거나 수정 권한이 없습니다.');
    }

    if (dto.calendarId !== undefined && dto.calendarId !== ev.calendarId) {
      const targetCal = await this.calendarRepo.findOne({
        where: { id: dto.calendarId },
      });
      if (!targetCal) {
        throw new NotFoundException('이동할 캘린더를 찾을 수 없습니다.');
      }
      if (targetCal.userId !== userId) {
        throw new ForbiddenException('공유 캘린더는 생성한 사용자만 일정을 등록할 수 있습니다.');
      }
      if (targetCal.type === CalendarTypeEnum.HOLIDAY) {
        throw new BadRequestException('공휴일 캘린더로 이동할 수 없습니다.');
      }
      ev.calendarId = targetCal.id;
    }

    const nextStart = dto.startAt ? new Date(dto.startAt) : ev.startAt;
    const nextEnd = dto.endAt ? new Date(dto.endAt) : ev.endAt;
    if (Number.isNaN(nextStart.getTime()) || Number.isNaN(nextEnd.getTime())) {
      throw new BadRequestException('유효한 시작/종료 일시를 입력해 주세요.');
    }
    if (nextEnd < nextStart) {
      throw new BadRequestException('종료 일시는 시작 일시보다 빠를 수 없습니다.');
    }

    if (dto.startAt || dto.reminderMinutesBefore !== undefined) {
      ev.reminderSentAt = null;
    }

    ev.startAt = nextStart;
    ev.endAt = nextEnd;
    if (dto.title !== undefined) ev.title = dto.title.trim();
    if (dto.description !== undefined) ev.description = dto.description;
    if (dto.location !== undefined) ev.location = dto.location;
    if (dto.isAllDay !== undefined) ev.isAllDay = dto.isAllDay;
    if (dto.timezone !== undefined) ev.timezone = dto.timezone;
    if (dto.rrule !== undefined) ev.rrule = dto.rrule || null;
    if (dto.recurrenceEndAt !== undefined) {
      ev.recurrenceEndAt = dto.recurrenceEndAt
        ? new Date(dto.recurrenceEndAt)
        : null;
    }
    if (dto.reminderMinutesBefore !== undefined) {
      ev.reminderMinutesBefore = dto.reminderMinutesBefore;
    }

    const saved = await this.eventRepo.save(ev);
    let attendees: CalendarEventAttendee[];
    if (dto.attendees !== undefined) {
      attendees = await this.syncAttendees(saved.id, dto.attendees);
    } else {
      attendees = await this.attendeeRepo.find({ where: { eventId: saved.id } });
    }

    const calendars = await this.calendarRepo.find({
      where: { id: In([saved.calendarId]), userId },
    });
    const calMap = new Map(calendars.map((c) => [c.id, c]));
    const attendeeMap = new Map([[saved.id, attendees]]);
    return this.toEventDto(saved, calMap, attendeeMap, undefined, userId);
  }

  async deleteEvent(userId: string, id: string): Promise<{ deleted: true }> {
    const ev = await this.eventRepo.findOne({ where: { id, userId } });
    if (!ev) {
      throw new NotFoundException('일정을 찾을 수 없거나 삭제 권한이 없습니다.');
    }
    await this.eventRepo.remove(ev);
    return { deleted: true };
  }
}
