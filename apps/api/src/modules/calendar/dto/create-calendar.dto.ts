import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateCalendarDto {
  @ApiProperty({ description: '캘린더 이름', example: '업무 일정' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ description: '캘린더 색상 (HEX)', example: '#0284c7' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;

  @ApiPropertyOptional({ description: '캘린더 유형', enum: ['PERSONAL', 'SHARED'] })
  @IsOptional()
  @IsIn(['PERSONAL', 'SHARED'])
  type?: 'PERSONAL' | 'SHARED';

  @ApiPropertyOptional({ description: '표시 여부', default: true })
  @IsOptional()
  @IsBoolean()
  isVisible?: boolean;

  @ApiPropertyOptional({ description: '정렬 순서', default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
