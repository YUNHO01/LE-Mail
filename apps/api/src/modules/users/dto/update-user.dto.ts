import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { UserRole } from '@lemail/shared-types';
import type { EmploymentStatus } from '@lemail/shared-types';

export class UpdateUserDto {
  @ApiProperty({ example: '홍길동(수정)', required: false, description: '사용자 이름' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ example: 'newPassword123!', required: false, description: '신규 비밀번호' })
  @IsString()
  @MinLength(6, { message: '비밀번호는 최소 6자 이상이어야 합니다.' })
  @IsOptional()
  password?: string;

  @ApiProperty({ enum: UserRole, required: false, description: '사용자 역할' })
  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @ApiProperty({ example: true, required: false, description: '계정 활성 여부' })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiProperty({ example: 512, required: false, description: '메일 사서함 용량 (MB 단위)' })
  @IsOptional()
  mailboxQuotaMb?: number;

  @ApiProperty({ example: 'ko', required: false, description: '선호 사용 언어' })
  @IsString()
  @IsOptional()
  preferredLanguage?: string;

  @ApiProperty({ example: 'Asia/Seoul', required: false, description: '타임존' })
  @IsString()
  @IsOptional()
  timezone?: string;

  @ApiProperty({ example: 'EMP1001', required: false, description: '사번 / 직원 ID' })
  @IsString()
  @IsOptional()
  employeeId?: string | null;

  @ApiProperty({ required: false, description: '소속 부서 ID' })
  @IsString()
  @IsOptional()
  departmentId?: string | null;

  @ApiProperty({ example: '과장', required: false, description: '직위' })
  @IsString()
  @IsOptional()
  position?: string | null;

  @ApiProperty({ example: '팀장', required: false, description: '직책' })
  @IsString()
  @IsOptional()
  jobTitle?: string | null;

  @ApiProperty({ example: '02-1234-5678', required: false, description: '사내 전화/내선' })
  @IsString()
  @IsOptional()
  phone?: string | null;

  @ApiProperty({ example: '010-1234-5678', required: false, description: '휴대전화' })
  @IsString()
  @IsOptional()
  mobile?: string | null;

  @ApiProperty({ enum: ['ACTIVE', 'ON_LEAVE', 'RESIGNED'], required: false, description: '재직 상태' })
  @IsEnum(['ACTIVE', 'ON_LEAVE', 'RESIGNED'])
  @IsOptional()
  employmentStatus?: EmploymentStatus;
}
