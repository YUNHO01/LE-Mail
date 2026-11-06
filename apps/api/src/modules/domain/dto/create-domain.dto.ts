import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class CreateDomainDto {
  @ApiProperty({ example: 'lineedge.com', description: '도메인 이름' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: '본사 공식 메일 도메인', description: '도메인 설명' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: false, description: '기본 도메인 여부', default: false })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @ApiPropertyOptional({ example: true, description: '활성화 여부', default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
