import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { UserRole } from '@lemail/shared-types';

export class UserQueryDto {
  @ApiProperty({ required: false, default: 1, description: '페이지 번호' })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  @IsOptional()
  page?: number = 1;

  @ApiProperty({ required: false, default: 20, description: '페이지당 표시 수' })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  @IsOptional()
  limit?: number = 20;

  @ApiProperty({ required: false, description: '이메일 또는 이름 검색어' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiProperty({ enum: UserRole, required: false, description: '역할 필터' })
  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @ApiProperty({ required: false, description: '부서 ID 필터 (unassigned 입력 시 부서 미지정 사용자 조회)' })
  @IsString()
  @IsOptional()
  departmentId?: string;

  @ApiProperty({ required: false, default: true, description: '하위 부서 소속 사용자 포함 여부' })
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  @IsOptional()
  includeSubDepartments?: boolean = true;
}
