import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RequestMailBackupDto {
  @ApiProperty({
    description: '백업할 메일함 폴더 ID (생략 시 전체 메일함 백업)',
    required: false,
    example: 'uuid-folder-id',
  })
  @IsOptional()
  @IsString()
  folderId?: string | null;
}
