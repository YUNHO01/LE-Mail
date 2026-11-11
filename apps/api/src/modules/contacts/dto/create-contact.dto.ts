import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, IsBoolean } from 'class-validator';

export class CreateContactDto {
  @ApiProperty({ description: '연락처 이름', example: '홍길동' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: '이메일 주소', example: 'hong@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string | null;

  @ApiPropertyOptional({ description: '그룹 ID', example: 'uuid-string' })
  @IsOptional()
  @IsString()
  groupId?: string | null;

  @ApiPropertyOptional({ description: '전화번호', example: '010-1234-5678' })
  @IsOptional()
  @IsString()
  phone?: string | null;

  @ApiPropertyOptional({ description: '회사명', example: '라인에지테크놀로지' })
  @IsOptional()
  @IsString()
  company?: string | null;

  @ApiPropertyOptional({ description: '부서명', example: '개발본부' })
  @IsOptional()
  @IsString()
  department?: string | null;

  @ApiPropertyOptional({ description: '직책/직급', example: '수석연구원' })
  @IsOptional()
  @IsString()
  position?: string | null;

  @ApiPropertyOptional({ description: '회사 전화번호', example: '02-1234-5678' })
  @IsOptional()
  @IsString()
  companyPhone?: string | null;

  @ApiPropertyOptional({ description: '회사 팩스번호', example: '02-1234-5679' })
  @IsOptional()
  @IsString()
  companyFax?: string | null;

  @ApiPropertyOptional({ description: '휴대전화 국가번호', example: '+82' })
  @IsOptional()
  @IsString()
  mobileCountryCode?: string | null;

  @ApiPropertyOptional({ description: '생일', example: '1985-05-15' })
  @IsOptional()
  @IsString()
  birthday?: string | null;

  @ApiPropertyOptional({ description: '우편번호', example: '13493' })
  @IsOptional()
  @IsString()
  postalCode?: string | null;

  @ApiPropertyOptional({ description: '주소', example: '경기도 성남시 분당구' })
  @IsOptional()
  @IsString()
  address?: string | null;

  @ApiPropertyOptional({ description: '웹사이트 URL', example: 'https://example.com' })
  @IsOptional()
  @IsString()
  websiteUrl?: string | null;

  @ApiPropertyOptional({ description: '공개 여부', example: false })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({ description: '메모', example: '주요 협력사 담당자' })
  @IsOptional()
  @IsString()
  memo?: string | null;

  @ApiPropertyOptional({ description: '중요 연락처 여부', example: false })
  @IsOptional()
  @IsBoolean()
  isStarred?: boolean;
}
