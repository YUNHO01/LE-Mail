import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class RequestMailBackupDto {
  @ApiProperty({
    description: '백업할 메일함 폴더 ID (생략 시 전체 메일함 백업)',
    required: false,
    example: 'uuid-folder-id',
  })
  @IsOptional()
  @IsString()
  folderId?: string | null;

  @ApiProperty({
    description: '선택적으로 백업할 메일함 폴더 ID 목록 (생략 시 전체 메일함 백업)',
    required: false,
    type: [String],
    example: ['uuid-folder-1', 'uuid-folder-2'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  folderIds?: string[];
}
