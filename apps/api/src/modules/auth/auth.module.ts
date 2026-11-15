import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { User, UserPasskey, IntegrationApiKey } from '../database/entities';
import { AuthService } from './auth.service';
import { ApiKeyService } from './api-key.service';
import { WebAuthnService } from './webauthn.service';
import { AuthController } from './auth.controller';
import { ApiKeyController } from './api-key.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RolesGuard } from './guards/roles.guard';
import { LicenseModule } from '../license/license.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserPasskey, IntegrationApiKey]),
    LicenseModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret:
          configService.get<string>('auth.jwtSecret') ||
          'lemail_super_secret_jwt_key_2026!',
        signOptions: {
          expiresIn: (configService.get<string>('auth.jwtExpiresIn') || '1d') as any,
        },
      }),
    }),
  ],
  controllers: [AuthController, ApiKeyController],
  providers: [AuthService, ApiKeyService, WebAuthnService, JwtStrategy, RolesGuard],
  exports: [AuthService, ApiKeyService, WebAuthnService, JwtModule, PassportModule, RolesGuard],
})
export class AuthModule {}
