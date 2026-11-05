import { ApiPropertyOptional } from '@nestjs/swagger';

export class MailboxQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1, description: '페이지 번호' })
  page?: number;

  @ApiPropertyOptional({ example: 20, default: 20, description: '페이지당 항목 수' })
  limit?: number;

  @ApiPropertyOptional({ example: 'example.com', description: '도메인 필터' })
  domain?: string;

  @ApiPropertyOptional({ example: 'user', description: '이메일 검색어' })
  search?: string;

  @ApiPropertyOptional({ example: true, description: '활성화 상태 필터' })
  isActive?: boolean;
}
