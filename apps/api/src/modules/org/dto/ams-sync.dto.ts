import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import type { EmploymentStatus, OrgSyncType } from '@lemail/shared-types';

export class AmsDepartmentPayloadDto {
  @ApiProperty({ example: 'AMS-DEPT-001', description: 'AMS 부서 고유 ID' })
  @IsString()
  @IsNotEmpty()
  amsDeptId!: string;

  @ApiProperty({ example: 'DEV', required: false, description: '부서 코드' })
  @IsString()
  @IsOptional()
  code?: string | null;

  @ApiProperty({ example: 'AMS-DEPT-000', required: false, description: '상위 부서의 AMS ID' })
  @IsString()
  @IsOptional()
  parentAmsDeptId?: string | null;

  @ApiProperty({ example: '개발팀', description: '부서명' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 1, required: false, description: '정렬 순서' })
  @IsInt()
  @IsOptional()
  sortOrder?: number;

  @ApiProperty({ example: 'EMP1001', required: false, description: '부서장 사번(employeeNumber)' })
  @IsString()
  @IsOptional()
  managerEmployeeId?: string | null;

  @ApiProperty({ example: true, required: false, description: '활성 여부' })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class AmsEmployeePayloadDto {
  @ApiProperty({ example: 'EMP1001', description: 'AMS 유니크 사번 (employeeNumber)' })
  @IsString()
  @IsNotEmpty()
  employeeNumber!: string;

  @ApiProperty({ example: 'ams-user-uuid', required: false, description: 'AMS 내부 사용자 ID' })
  @IsString()
  @IsOptional()
  amsUserId?: string | null;

  @ApiProperty({ example: '홍길동', description: '이름' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 'hong@lineedge.com', required: false, description: '이메일 (신규 메일 계정 생성 시 필수)' })
  @IsEmail()
  @IsOptional()
  email?: string | null;

  @ApiProperty({ example: 'AMS-DEPT-001', required: false, description: '소속 부서의 AMS ID' })
  @IsString()
  @IsOptional()
  amsDeptId?: string | null;

  @ApiProperty({ example: 'DEV', required: false, description: '소속 부서 코드 (amsDeptId 없을 때 보조 매핑)' })
  @IsString()
  @IsOptional()
  departmentCode?: string | null;

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

  @ApiProperty({
    enum: ['ACTIVE', 'ON_LEAVE', 'RESIGNED'],
    required: false,
    default: 'ACTIVE',
    description: '재직 상태',
  })
  @IsEnum(['ACTIVE', 'ON_LEAVE', 'RESIGNED'])
  @IsOptional()
  employmentStatus?: EmploymentStatus;

  @ApiProperty({ example: true, required: false, default: true, description: 'LEMail 계정 생성 허용 여부' })
  @IsBoolean()
  @IsOptional()
  mailEnabled?: boolean;
}

export class UpdateAmsSyncSettingsDto {
  @ApiProperty({ example: false, required: false, description: 'AMS 자동 동기화 활성화 여부' })
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @ApiProperty({ example: 'https://ams.company.com/api/org/export', required: false, description: 'AMS 조직도 공통 Base URL' })
  @IsString()
  @IsOptional()
  apiUrl?: string;

  @ApiProperty({ example: '/departments', required: false, description: '부서 조회 엔드포인트 URL 또는 상대 경로 (선택)' })
  @IsString()
  @IsOptional()
  departmentsApiUrl?: string;

  @ApiProperty({ example: '/users', required: false, description: '사용자 조회 엔드포인트 URL 또는 상대 경로 (선택)' })
  @IsString()
  @IsOptional()
  usersApiUrl?: string;

  @ApiProperty({ example: 'secret-token', required: false, description: 'AMS API Bearer 토큰 (변경 시에만 입력)' })
  @IsString()
  @IsOptional()
  apiToken?: string;

  @ApiProperty({ example: 60, required: false, description: '자동 동기화 주기 (분, 최소 5분)' })
  @IsInt()
  @IsOptional()
  intervalMinutes?: number;

  @ApiProperty({ example: true, required: false, description: '신규 입사자 사서함 자동 생성 여부' })
  @IsBoolean()
  @IsOptional()
  autoProvisionMailbox?: boolean;
}

export class SyncAmsOrgDto {
  @ApiProperty({
    enum: ['FULL', 'INCREMENTAL', 'WEBHOOK'],
    required: false,
    default: 'FULL',
    description: '동기화 유형',
  })
  @IsEnum(['FULL', 'INCREMENTAL', 'WEBHOOK'])
  @IsOptional()
  syncType?: OrgSyncType;

  @ApiProperty({ type: [AmsDepartmentPayloadDto], required: false, description: '동기화할 부서 목록' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AmsDepartmentPayloadDto)
  @IsOptional()
  departments?: AmsDepartmentPayloadDto[];

  @ApiProperty({ type: [AmsEmployeePayloadDto], required: false, description: '동기화할 임직원 목록' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AmsEmployeePayloadDto)
  @IsOptional()
  employees?: AmsEmployeePayloadDto[];

  @ApiProperty({
    example: true,
    required: false,
    default: true,
    description: '미등록 신규 임직원에 대한 LEMail 사서함 자동 생성 여부 (라이선스 한도 내)',
  })
  @IsBoolean()
  @IsOptional()
  autoProvisionMailbox?: boolean;
}
