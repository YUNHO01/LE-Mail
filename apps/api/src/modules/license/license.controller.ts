import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@lemail/shared-types';
import { LicenseService } from './license.service';
import { RegisterLicenseDto } from './dto/license.dto';
import { SkipLicenseCheck } from './decorators/skip-license-check.decorator';

@ApiTags('Admin License (시스템 라이선스 관리)')
@Controller('admin/license')
export class LicenseController {
  constructor(private readonly licenseService: LicenseService) {}

  @Get('status')
  @SkipLicenseCheck()
  @ApiOperation({
    summary: '현재 시스템 라이선스 상태 및 무결성 정보 조회',
    description: '라이선스 유효성, 기관명, 사용자 정원, 사용 기한, 파일-DB 일치 여부 등을 반환합니다.',
  })
  @ApiResponse({ status: 200, description: '조회 성공' })
  async getLicenseStatus() {
    return this.licenseService.getLicenseStatus();
  }

  @Post('register')
  @SkipLicenseCheck()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SYSTEM_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '신규 정품 라이선스 파일 등록 및 검증',
    description:
      '라이선스 파일(.lic)을 업로드하여 서명, 제품 식별자, 유효기간, 파일-DB 무결성을 검증하고 시스템에 등록합니다.',
  })
  @ApiResponse({ status: 201, description: '등록 및 인증 성공' })
  @ApiResponse({ status: 400, description: '유효하지 않거나 변조된 라이선스' })
  async registerLicense(@Body() dto: RegisterLicenseDto) {
    return this.licenseService.registerLicense(dto.licenseContent);
  }
}
