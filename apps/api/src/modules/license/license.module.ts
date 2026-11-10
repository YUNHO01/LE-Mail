import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemLicense, User } from '../database/entities';
import { LicenseService } from './license.service';
import { LicenseController } from './license.controller';
import { LicenseGuard } from './guards/license.guard';

@Module({
  imports: [TypeOrmModule.forFeature([SystemLicense, User])],
  controllers: [LicenseController],
  providers: [LicenseService, LicenseGuard],
  exports: [LicenseService, LicenseGuard],
})
export class LicenseModule {}
