import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { McpApiKeyScope } from '@lemail/shared-types';

export class CreateApiKeyDto {
  @ApiProperty({ example: 'Claude Desktop 연동키', description: 'API Key 명칭' })
  @IsString()
  @IsNotEmpty({ message: 'API Key 명칭을 입력해 주세요.' })
  @MaxLength(120, { message: 'API Key 명칭은 120자 이하여야 합니다.' })
  name!: string;

  @ApiPropertyOptional({ example: '업무용 맥북 Claude Desktop 연결용', description: 'API Key 설명' })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: '설명은 500자 이하여야 합니다.' })
  description?: string;

  @ApiProperty({
    enum: McpApiKeyScope,
    isArray: true,
    example: [McpApiKeyScope.MCP_READ],
    description: '허용 스코프 목록 (mcp:read, mcp:write)',
  })
  @IsArray({ message: '스코프는 배열 형식이어야 합니다.' })
  @ArrayNotEmpty({ message: '최소 1개 이상의 스코프를 선택해 주세요.' })
  @IsEnum(McpApiKeyScope, { each: true, message: '유효하지 않은 MCP 스코프입니다.' })
  scopes!: McpApiKeyScope[];

  @ApiPropertyOptional({
    example: '2027-12-31T23:59:59.000Z',
    description: '만료 일시 (ISO 8601, 미지정 시 무기한)',
  })
  @IsOptional()
  @IsDateString({}, { message: '올바른 ISO 8601 날짜 형식이어야 합니다.' })
  expiresAt?: string;
}
