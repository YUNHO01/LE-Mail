import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateDepartmentDto {
  @ApiProperty({ example: '개발본부', description: '부서명' })
  @IsString()
  @IsNotEmpty({ message: '부서명을 입력해 주세요.' })
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: 'DEV', required: false, description: '부서 코드 (선택, 유니크)' })
  @IsString()
  @IsOptional()
  @MaxLength(64)
  code?: string | null;

  @ApiProperty({ required: false, description: '상위 부서 ID (최상위 부서일 경우 null)' })
  @IsString()
  @IsOptional()
  parentId?: string | null;

  @ApiProperty({ example: 0, required: false, description: '정렬 순서' })
  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;

  @ApiProperty({ example: 'EMP1001', required: false, description: '부서장 사번' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  managerEmployeeId?: string | null;

  @ApiProperty({ example: true, required: false, description: '부서 활성 여부' })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateDepartmentDto {
  @ApiProperty({ example: '플랫폼개발팀', required: false, description: '부서명' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @ApiProperty({ example: 'DEV_PLATFORM', required: false, description: '부서 코드' })
  @IsString()
  @IsOptional()
  @MaxLength(64)
  code?: string | null;

  @ApiProperty({ required: false, description: '상위 부서 ID' })
  @IsString()
  @IsOptional()
  parentId?: string | null;

  @ApiProperty({ example: 1, required: false, description: '정렬 순서' })
  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;

  @ApiProperty({ example: 'EMP1002', required: false, description: '부서장 사번' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  managerEmployeeId?: string | null;

  @ApiProperty({ example: true, required: false, description: '부서 활성 여부' })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class MoveDepartmentDto {
  @ApiProperty({ required: false, nullable: true, description: '이동할 상위 부서 ID (생략 시 현재 상위 부서 유지)' })
  @IsString()
  @IsOptional()
  targetParentId?: string | null;

  @ApiProperty({ example: 0, required: false, description: '대상 상위 부서 내 배치할 정렬 위치 (0부터 시작)' })
  @IsInt()
  @Min(0)
  @IsOptional()
  targetIndex?: number;
}
