import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
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
}
