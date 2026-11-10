import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RegisterLicenseDto {
  @ApiProperty({
    description: '라이선스 파일(.lic)의 JSON 문자열 내용',
    example: '{"version":"1.0","product":"LEMail",...}',
  })
  @IsNotEmpty({ message: '라이선스 파일 내용은 필수입니다.' })
  @IsString({ message: '라이선스 파일 내용은 문자열이어야 합니다.' })
  licenseContent: string;
}
