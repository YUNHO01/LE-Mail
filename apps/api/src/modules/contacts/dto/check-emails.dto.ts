import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class CheckContactEmailsDto {
  @ApiProperty({
    description: '주소록 및 사내 사용자 등록 여부를 확인할 이메일 주소 목록',
    type: [String],
    example: ['external@example.com', 'partner@company.co.kr'],
  })
  @IsArray()
  @IsString({ each: true })
  emails: string[];
}
