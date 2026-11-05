import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { MonitoringService } from './monitoring.service';

@ApiTags('Monitoring')
@Controller('admin/monitoring')
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

  @Get('queue')
  @ApiOperation({ summary: 'BullMQ 메일 큐 작업 현황 조회' })
  @ApiResponse({ status: 200, description: '대기열, 활성, 완료, 실패 작업 수' })
  getQueueStats() {
    return this.monitoringService.getQueueStats();
  }

  @Get('overview')
  @ApiOperation({ summary: '시스템 리소스, 큐, 메일 통계 통합 대시보드 개요' })
  @ApiResponse({ status: 200, description: '전체 시스템 개요 반환' })
  getSystemOverview() {
    return this.monitoringService.getSystemOverview();
  }
}
