import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMailboxDto {
  @ApiProperty({ example: 'user@example.com', description: '이메일 전체 주소' })
  email: string;

  @ApiPropertyOptional({ example: 'example.com', description: '메일 도메인 (생략 시 이메일에서 자동 추출)' })
  domain?: string;

  @ApiPropertyOptional({ example: true, description: '활성화 여부', default: true })
  isActive?: boolean;
}
