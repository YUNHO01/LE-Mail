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
import { UserRole, formatBrandName } from '@lemail/shared-types';
import { LicenseService } from './license.service';
import { RegisterLicenseDto } from './dto/license.dto';
import { SkipLicenseCheck } from './decorators/skip-license-check.decorator';

@ApiTags('License (공개 브랜드 정보)')
@Controller('license')
export class LicensePublicController {
  constructor(private readonly licenseService: LicenseService) {}

  @Get('public')
  @SkipLicenseCheck()
  @ApiOperation({
    summary: '공개 브랜드명 및 라이선스 유효 여부 조회',
    description: '로그인 전/일반 사용자 화면에서 브랜드명 표시를 위한 최소 정보만 반환합니다.',
  })
  @ApiResponse({ status: 200, description: '조회 성공' })
  async getPublicBrandInfo() {
    const status = await this.licenseService.getLicenseStatus();
    return {
      isValid: Boolean(status.isValid),
      brandName: formatBrandName(status),
    };
  }
}

@ApiTags('Admin License (시스템 라이선스 관리)')
@Controller('admin/license')
export class LicenseController {
  constructor(private readonly licenseService: LicenseService) {}

  @Get('status')
  @SkipLicenseCheck()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SYSTEM_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '현재 시스템 라이선스 상태 및 무결성 정보 조회 (관리자 전용)',
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
