import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@lemail/shared-types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { DepartmentsService } from './departments.service';
import { OrgSyncService } from './org-sync.service';
import { CreateDepartmentDto, UpdateDepartmentDto } from './dto/department.dto';
import { SyncAmsOrgDto, UpdateAmsSyncSettingsDto } from './dto/ams-sync.dto';

@ApiTags('Organization')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('org')
export class OrgController {
  constructor(
    private readonly departmentsService: DepartmentsService,
    private readonly orgSyncService: OrgSyncService,
  ) {}

  @Get('departments')
  @ApiOperation({
    summary: '부서 목록 조회',
    description: '사내 부서 목록을 정렬 순서대로 조회합니다.',
  })
  async getDepartments(@Query('includeInactive') includeInactive?: string) {
    return this.departmentsService.findAll(includeInactive === 'true');
  }

  @Get('departments/tree')
  @ApiOperation({
    summary: '조직도 트리 조회',
    description: '계층 구조의 조직도 트리와 부서별 활성 인원 수를 조회합니다.',
  })
  async getDepartmentTree(@Query('includeInactive') includeInactive?: string) {
    return this.departmentsService.getTree(includeInactive === 'true');
  }

  @Post('departments')
  @Roles(UserRole.SYSTEM_ADMIN)
  @ApiOperation({
    summary: '부서 등록 (관리자 전용, 단독 운영 지원)',
    description: 'LEMail 단독 운영 시 사내 부서를 직접 등록합니다.',
  })
  async createDepartment(@Body() dto: CreateDepartmentDto) {
    return this.departmentsService.create(dto);
  }

  @Patch('departments/:id')
  @Roles(UserRole.SYSTEM_ADMIN)
  @ApiOperation({
    summary: '부서 수정 (관리자 전용)',
    description: '부서명, 상위 부서, 정렬 순서, 활성 상태 등을 수정합니다.',
  })
  async updateDepartment(
    @Param('id') id: string,
    @Body() dto: UpdateDepartmentDto,
  ) {
    return this.departmentsService.update(id, dto);
  }

  @Delete('departments/:id')
  @Roles(UserRole.SYSTEM_ADMIN)
  @ApiOperation({
    summary: '부서 삭제 (관리자 전용)',
    description: '하위 부서 및 소속 사용자가 없는 부서를 삭제합니다.',
  })
  async deleteDepartment(@Param('id') id: string) {
    return this.departmentsService.remove(id);
  }

  @Post('sync/ams')
  @Roles(UserRole.SYSTEM_ADMIN)
  @ApiOperation({
    summary: 'AMS 조직도/임직원 동기화 실행 (관리자 전용)',
    description:
      'AMS 조직도 데이터를 수신하여 부서 트리 및 임직원(employeeNumber 기준) 상태를 동기화합니다. 퇴사/휴직자는 사서함 비활성화 후 메일 백업으로 대응할 수 있습니다.',
  })
  async syncFromAms(@Body() dto: SyncAmsOrgDto) {
    return this.orgSyncService.syncFromAmsPayload(dto);
  }

  @Get('sync/logs')
  @Roles(UserRole.SYSTEM_ADMIN)
  @ApiOperation({
    summary: 'AMS 조직도 동기화 이력 조회 (관리자 전용)',
    description: '최근 AMS 조직도 동기화 실행 이력과 스킵/오류 사유를 조회합니다.',
  })
  async getSyncLogs(@Query('limit') limit?: string) {
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    return this.orgSyncService.getSyncLogs(Number.isNaN(parsedLimit) ? 20 : parsedLimit);
  }

  @Get('sync/settings')
  @Roles(UserRole.SYSTEM_ADMIN)
  @ApiOperation({
    summary: 'AMS 조직도 자동 동기화 설정 조회 (관리자 전용)',
  })
  async getSyncSettings() {
    return this.orgSyncService.getSyncSettings();
  }

  @Patch('sync/settings')
  @Roles(UserRole.SYSTEM_ADMIN)
  @ApiOperation({
    summary: 'AMS 조직도 자동 동기화 설정 저장 (관리자 전용)',
  })
  async updateSyncSettings(@Body() dto: UpdateAmsSyncSettingsDto) {
    return this.orgSyncService.updateSyncSettings(dto);
  }

  @Post('sync/pull')
  @Roles(UserRole.SYSTEM_ADMIN)
  @ApiOperation({
    summary: '설정된 AMS API에서 조직도 즉시 가져오기 및 동기화 실행 (관리자 전용)',
  })
  async pullFromAms() {
    return this.orgSyncService.pullAndSyncFromAms();
  }
}
