import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateCalendarDto {
  @ApiPropertyOptional({ description: '캘린더 이름' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ description: '캘린더 색상 (HEX)' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;

  @ApiPropertyOptional({ description: '캘린더 유형', enum: ['PERSONAL', 'SHARED'] })
  @IsOptional()
  @IsIn(['PERSONAL', 'SHARED'])
  type?: 'PERSONAL' | 'SHARED';

  @ApiPropertyOptional({ description: '표시 여부' })
  @IsOptional()
  @IsBoolean()
  isVisible?: boolean;

  @ApiPropertyOptional({ description: '정렬 순서' })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
