import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ImportIcsDto {
  @ApiProperty({ description: 'ICS 파일 원문 문자열' })
  @IsString()
  @IsNotEmpty()
  icsContent: string;

  @ApiPropertyOptional({ description: '가져올 대상 캘린더 ID' })
  @IsOptional()
  @IsString()
  calendarId?: string;
}
