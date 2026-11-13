import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CalendarAttendeeInputDto } from './create-calendar-event.dto';

export class UpdateCalendarEventDto {
  @ApiPropertyOptional({ description: '소속 캘린더 ID' })
  @IsOptional()
  @IsString()
  calendarId?: string;

  @ApiPropertyOptional({ description: '일정 제목' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ description: '상세 메모' })
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({ description: '장소' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string | null;

  @ApiPropertyOptional({ description: '시작 일시 (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  startAt?: string;

  @ApiPropertyOptional({ description: '종료 일시 (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  endAt?: string;

  @ApiPropertyOptional({ description: '종일 일정 여부' })
  @IsOptional()
  @IsBoolean()
  isAllDay?: boolean;

  @ApiPropertyOptional({ description: '타임존' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  timezone?: string;

  @ApiPropertyOptional({ description: '반복 규칙' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  rrule?: string | null;

  @ApiPropertyOptional({ description: '반복 종료 일시' })
  @IsOptional()
  @IsDateString()
  recurrenceEndAt?: string | null;

  @ApiPropertyOptional({ description: '이메일 알림 시간 (분 전)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  reminderMinutesBefore?: number | null;

  @ApiPropertyOptional({ description: '참석자 목록', type: [CalendarAttendeeInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CalendarAttendeeInputDto)
  attendees?: CalendarAttendeeInputDto[];
}
