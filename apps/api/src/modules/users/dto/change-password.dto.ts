import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ example: 'currentPassword123!', description: '현재 비밀번호' })
  @IsString()
  @IsNotEmpty({ message: '현재 비밀번호를 입력해 주세요.' })
  currentPassword!: string;

  @ApiProperty({ example: 'newPassword123!', description: '신규 비밀번호' })
  @IsString()
  @IsNotEmpty({ message: '신규 비밀번호를 입력해 주세요.' })
  @MinLength(6, { message: '새 비밀번호는 최소 6자 이상이어야 합니다.' })
  newPassword!: string;
}
