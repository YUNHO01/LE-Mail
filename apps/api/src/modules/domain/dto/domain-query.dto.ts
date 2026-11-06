import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsBooleanString } from 'class-validator';

export class DomainQueryDto {
  @ApiPropertyOptional({ example: 1, description: '페이지 번호' })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ example: 20, description: '페이지당 표시 수' })
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ example: 'lineedge', description: '도메인 검색어' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 'true', description: '활성화 상태 필터' })
  @IsOptional()
  @IsBooleanString()
  isActive?: string;
}
