import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateUserSignatureDto {
  @ApiProperty({ description: '서명 사용 여부', example: true })
  @IsBoolean()
  useSignature: boolean;

  @ApiProperty({
    description: 'DHTML 서명 HTML 본문',
    example: '<p>감사합니다.<br/><strong>홍길동 드림</strong></p>',
    required: false,
  })
  @IsOptional()
  @IsString()
  signatureHtml?: string | null;
}
