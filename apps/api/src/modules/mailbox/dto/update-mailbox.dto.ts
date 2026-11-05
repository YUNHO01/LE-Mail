import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateMailboxDto {
  @ApiPropertyOptional({ example: true, description: '활성화 여부' })
  isActive?: boolean;
}
