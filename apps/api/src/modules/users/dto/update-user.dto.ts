import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { UserRole } from '@lemail/shared-types';

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
}
