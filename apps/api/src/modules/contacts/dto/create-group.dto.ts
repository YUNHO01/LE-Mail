import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsNumber } from 'class-validator';

export class CreateGroupDto {
  @ApiProperty({ description: '그룹명', example: '거래처' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: '그룹 라벨 색상', example: '#0284c7' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ description: '정렬 순서', example: 0 })
  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}
