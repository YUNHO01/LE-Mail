import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Department, SystemLicense, User } from '../database/entities';
import { LicenseService } from './license.service';
import { LicenseController, LicensePublicController } from './license.controller';
import { LicenseGuard } from './guards/license.guard';

@Module({
  imports: [TypeOrmModule.forFeature([SystemLicense, User, Department])],
  controllers: [LicenseController, LicensePublicController],
  providers: [LicenseService, LicenseGuard],
  exports: [LicenseService, LicenseGuard],
})
export class LicenseModule {}
