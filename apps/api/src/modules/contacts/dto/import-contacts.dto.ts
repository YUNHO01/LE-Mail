import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type { DuplicateContactAction } from '@lemail/shared-types';

export class ImportContactsDto {
  @ApiProperty({
    description: '가져올 파일 내용 (텍스트 형식 또는 UTF-8 디코딩된 문자열)',
    example: '이름,전자 메일 주소,전화번호\n홍길동,hong@example.com,010-1234-5678',
  })
  @IsNotEmpty()
  @IsString()
  fileContent: string;

  @ApiProperty({
    description: '원본 파일명 (확장자 .csv 또는 .vcf 판별용)',
    example: 'contacts.csv',
  })
  @IsNotEmpty()
  @IsString()
  filename: string;

  @ApiPropertyOptional({
    description: '중복 이메일 처리 전략 (SKIP: 건너뛰기, OVERWRITE: 덮어쓰기, KEEP_BOTH: 모두 유지)',
    enum: ['SKIP', 'OVERWRITE', 'KEEP_BOTH'],
    default: 'SKIP',
  })
  @IsOptional()
  @IsIn(['SKIP', 'OVERWRITE', 'KEEP_BOTH'])
  duplicateAction?: DuplicateContactAction = 'SKIP';
}
