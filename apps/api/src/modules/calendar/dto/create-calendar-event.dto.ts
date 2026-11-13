import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CalendarAttendeeInputDto {
  @ApiProperty({ description: '참석자 이메일' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ description: '참석자 이름' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string | null;
}

export class CreateCalendarEventDto {
  @ApiPropertyOptional({ description: '소속 캘린더 ID (미지정 시 기본 캘린더)' })
  @IsOptional()
  @IsString()
  calendarId?: string;

  @ApiProperty({ description: '일정 제목', example: '주간 팀 미팅' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional({ description: '상세 메모' })
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({ description: '장소', example: '3층 대회의실' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string | null;

  @ApiProperty({ description: '시작 일시 (ISO 8601)' })
  @IsDateString()
  startAt: string;

  @ApiProperty({ description: '종료 일시 (ISO 8601)' })
  @IsDateString()
  endAt: string;

  @ApiPropertyOptional({ description: '종일 일정 여부', default: false })
  @IsOptional()
  @IsBoolean()
  isAllDay?: boolean;

  @ApiPropertyOptional({ description: '타임존', default: 'Asia/Seoul' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  timezone?: string;

  @ApiPropertyOptional({ description: '반복 규칙 (예: FREQ=WEEKLY;INTERVAL=1)' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  rrule?: string | null;

  @ApiPropertyOptional({ description: '반복 종료 일시 (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  recurrenceEndAt?: string | null;

  @ApiPropertyOptional({ description: '이메일 알림 시간 (분 전, 예: 10, 30, 60, 1440)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  reminderMinutesBefore?: number | null;

  @ApiPropertyOptional({ description: '원본 메일 ID (메일에서 일정 생성 시)' })
  @IsOptional()
  @IsString()
  sourceMailId?: string | null;

  @ApiPropertyOptional({ description: '참석자 목록', type: [CalendarAttendeeInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CalendarAttendeeInputDto)
  attendees?: CalendarAttendeeInputDto[];
}
