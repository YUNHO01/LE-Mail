import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class UpdateDomainDto {
  @ApiPropertyOptional({ example: '변경할 설명', description: '도메인 설명' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: true, description: '기본 도메인 여부' })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @ApiPropertyOptional({ example: true, description: '활성화 여부' })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
