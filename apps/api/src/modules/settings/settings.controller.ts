import {
  Controller,
  Get,
  Put,
  Post,
  Param,
  Body,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@lemail/shared-types';
import { SettingsService } from './settings.service';
import { SystemLifecycleService } from './system-lifecycle.service';
import {
  UpdateStepSettingsDto,
  TestRelayConnectionDto,
  TestRedisConnectionDto,
  RestartModuleDto,
  RevealSecretDto,
} from './dto/step-settings.dto';

@ApiTags('Admin Settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SYSTEM_ADMIN)
@Controller('admin/settings')
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly lifecycleService: SystemLifecycleService,
  ) {}

  @Get('step/:step')
  @ApiOperation({
    summary: '환경설정 단계(Step)별 설정 조회 (마스킹 포함)',
    description: '지정된 단계의 설정을 조회합니다. 비밀번호 및 시크릿 키는 마스킹 처리되어 반환됩니다.',
  })
  @ApiParam({ name: 'step', description: '단계 번호 (1: 서버, 2: 수신, 3: 발송/릴레이, 4: 보안/인증, 5: 인프라)' })
  getStepSettings(@Param('step', ParseIntPipe) step: number) {
    return this.settingsService.getSettingsByStep(step);
  }

  @Put('step/:step')
  @ApiOperation({
    summary: '환경설정 단계(Step)별 설정 저장 및 재시작 필요 여부 확인',
    description: '지정된 단계의 설정을 저장하고, 변경 사항에 따른 모듈 재시작 필요 여부와 대상 모듈 목록을 반환합니다.',
  })
  @ApiParam({ name: 'step', description: '단계 번호 (1~5)' })
  saveStepSettings(
    @Param('step', ParseIntPipe) step: number,
    @Body() dto: UpdateStepSettingsDto,
    @CurrentUser('id') adminId: string,
  ) {
    return this.settingsService.saveStepSettings(step, dto.settings, adminId);
  }

  @Post('test-relay')
  @ApiOperation({
    summary: '외부 SMTP 릴레이(Smarthost) 연결 사전 테스트',
    description: '입력된 릴레이 호스트, 포트, 계정, 비밀번호로 SMTP 연결 및 인증 가능 여부를 점검합니다.',
  })
  testRelay(@Body() dto: TestRelayConnectionDto) {
    return this.settingsService.testRelayConnection(dto);
  }

  @Post('test-redis')
  @ApiOperation({
    summary: 'Redis 인프라 연결 사전 테스트',
    description: '입력된 Redis 호스트, 포트, 비밀번호로 연결 및 PING 응답을 점검합니다.',
  })
  testRedis(@Body() dto: TestRedisConnectionDto) {
    return this.settingsService.testRedisConnection(dto);
  }

  @Post('restart-module')
  @ApiOperation({
    summary: '시스템 서브 모듈 재시작 (Graceful Restart)',
    description: '설정 변경 후 해당 모듈(SMTP_INGESTION, HARAKA, API_SERVER)을 실시간으로 안전하게 재시작합니다.',
  })
  restartModule(@Body() dto: RestartModuleDto) {
    return this.lifecycleService.restartModule(dto.module);
  }

  @Get('modules-status')
  @ApiOperation({
    summary: '시스템 핵심 모듈 실시간 가동 상태 조회',
    description: 'SMTP 수신 리스너, Haraka MTA, IMAP 서비스의 가동 여부 및 포트를 점검합니다.',
  })
  getModulesStatus() {
    return this.lifecycleService.getModulesStatus();
  }

  @Post('reveal-secret')
  @ApiOperation({
    summary: '암호화된 비밀번호 원본 복호화 조회 (암호보기 기능)',
    description: '관리자가 암호보기 버튼을 클릭했을 때 DB에 저장된 실제 암호화된 비밀번호를 복호화하여 반환합니다.',
  })
  revealSecret(@Body() dto: RevealSecretDto) {
    return this.settingsService.revealSecret(dto.key);
  }
}
