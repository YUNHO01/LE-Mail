import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty } from 'class-validator';

export class BulkDeleteContactsDto {
  @ApiProperty({ description: '삭제할 연락처 ID 목록', type: [String] })
  @IsArray()
  @IsNotEmpty()
  ids: string[];
}
