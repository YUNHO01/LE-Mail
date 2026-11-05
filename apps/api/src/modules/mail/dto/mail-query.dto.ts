import { ApiPropertyOptional } from '@nestjs/swagger';
import { MailStatus, Direction } from '../../database/entities/mail-message.entity';

export class MailQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1, description: '페이지 번호' })
  page?: number;

  @ApiPropertyOptional({ example: 20, default: 20, description: '페이지당 항목 수' })
  limit?: number;

  @ApiPropertyOptional({ example: 'user@example.com', description: '특정 사서함 주소 필터' })
  mailbox?: string;

  @ApiPropertyOptional({ example: 'meeting', description: '제목 및 발신자 검색어' })
  search?: string;

  @ApiPropertyOptional({ enum: MailStatus, description: '메일 상태 필터' })
  status?: MailStatus;

  @ApiPropertyOptional({ enum: Direction, description: '수신/발신 구분 필터' })
  direction?: Direction;
}
