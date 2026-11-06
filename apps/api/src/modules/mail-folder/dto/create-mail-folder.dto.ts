import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMailFolderDto {
  @ApiProperty({ description: '편지함 이름', example: '프로젝트 A' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({
    description: '상위 편지함 ID (트리 구조의 부모 폴더 ID)',
    example: 'd3b07384-d113-406a-a664-d65e7be60c91',
  })
  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @ApiPropertyOptional({ description: '정렬 순서', example: 1 })
  @IsOptional()
  sortOrder?: number;
}
