import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { UserRole } from '@lemail/shared-types';

export class CreateUserDto {
  @ApiProperty({ example: 'user1@lineedge.com', description: '사용자 이메일' })
  @IsEmail({}, { message: '올바른 이메일 형식이 아닙니다.' })
  @IsNotEmpty({ message: '이메일을 입력해 주세요.' })
  email!: string;

  @ApiProperty({ example: '홍길동', description: '사용자 이름' })
  @IsString()
  @IsNotEmpty({ message: '이름을 입력해 주세요.' })
  name!: string;

  @ApiProperty({ example: 'user1234!', description: '초기 비밀번호' })
  @IsString()
  @IsNotEmpty({ message: '비밀번호를 입력해 주세요.' })
  @MinLength(6, { message: '비밀번호는 최소 6자 이상이어야 합니다.' })
  password!: string;

  @ApiProperty({
    enum: UserRole,
    default: UserRole.USER,
    description: '사용자 권한 (SYSTEM_ADMIN, USER)',
  })
  @IsEnum(UserRole, { message: '유효한 권한(SYSTEM_ADMIN, USER)을 지정해 주세요.' })
  @IsOptional()
  role?: UserRole;
}
