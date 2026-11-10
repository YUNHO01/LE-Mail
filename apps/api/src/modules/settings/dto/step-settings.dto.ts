import { IsObject, IsOptional, IsString } from 'class-validator';

export class UpdateStepSettingsDto {
  @IsObject()
  settings: Record<string, any>;
}

export class TestRelayConnectionDto {
  @IsString()
  host: string;

  port: number;

  secure: boolean;

  @IsOptional()
  @IsString()
  user?: string;

  @IsOptional()
  @IsString()
  pass?: string;

  rejectUnauthorized?: boolean;
}

export class TestRedisConnectionDto {
  @IsString()
  host: string;

  port: number;

  @IsOptional()
  @IsString()
  password?: string;
}

export class RestartModuleDto {
  @IsString()
  module: string; // 'SMTP_INGESTION' | 'HARAKA' | 'API_SERVER' | 'IMAP'
}

export class RevealSecretDto {
  @IsString()
  key: string;
}

