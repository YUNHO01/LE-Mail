import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { SpamRuleType, SpamRuleTargetType } from '@lemail/shared-types';

export class CreateSpamRuleDto {
  @IsEnum(SpamRuleType)
  @IsNotEmpty()
  type: SpamRuleType;

  @IsEnum(SpamRuleTargetType)
  @IsNotEmpty()
  targetType: SpamRuleTargetType;

  @IsString()
  @IsNotEmpty()
  pattern: string;

  @IsString()
  @IsOptional()
  reason?: string;
}
