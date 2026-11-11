import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@lemail/shared-types';
import { MonitoringService } from './monitoring.service';

@ApiTags('Monitoring')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SYSTEM_ADMIN)
@Controller('admin/monitoring')
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

  @Get('queue')
  @ApiOperation({ summary: 'BullMQ 메일 큐 작업 현황 조회 (관리자 전용)' })
  @ApiResponse({ status: 200, description: '대기열, 활성, 완료, 실패 작업 수' })
  getQueueStats() {
    return this.monitoringService.getQueueStats();
  }

  @Get('overview')
  @ApiOperation({ summary: '시스템 리소스, 큐, 메일 통계 통합 대시보드 개요 (관리자 전용)' })
  @ApiResponse({ status: 200, description: '전체 시스템 개요 반환' })
  getSystemOverview() {
    return this.monitoringService.getSystemOverview();
  }
}
