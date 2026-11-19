import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PushSubscriptionKeysDto {
  @ApiProperty({ description: '브라우저 PushManager p256dh 공개키' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  p256dh: string;

  @ApiProperty({ description: '브라우저 PushManager auth 시크릿' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  auth: string;
}

export class RegisterPushSubscriptionDto {
  @ApiProperty({ description: 'Web Push 엔드포인트 URL' })
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true })
  @IsNotEmpty()
  endpoint: string;

  @ApiProperty({ type: PushSubscriptionKeysDto })
  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys: PushSubscriptionKeysDto;

  @ApiPropertyOptional({ description: '기기 표시 이름 (예: Chrome on Windows)' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceLabel?: string;
}

export class UpdatePushSettingsDto {
  @ApiPropertyOptional({ description: '계정 전역 Web Push 알림 활성화 여부' })
  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;

  @ApiPropertyOptional({ description: '알림 본문에 발신자 및 제목 미리보기 표시 여부' })
  @IsOptional()
  @IsBoolean()
  pushPreviewEnabled?: boolean;
}
