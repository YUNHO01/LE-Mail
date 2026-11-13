import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@lemail/shared-types';
import { HolidayService } from './holiday.service';

@ApiTags('Admin Holidays')
@Controller('admin/holidays')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SYSTEM_ADMIN)
@ApiBearerAuth()
export class AdminHolidayController {
  constructor(private readonly holidayService: HolidayService) {}

  @Get()
  @ApiOperation({ summary: '연도별 공휴일 목록 조회 (관리자)' })
  async listByYear(@Query('year') year?: string) {
    const targetYear = year ? Number(year) : new Date().getFullYear();
    return this.holidayService.listByYear(targetYear);
  }

  @Get('settings')
  @ApiOperation({ summary: '공휴일 동기화 설정 및 상태 조회' })
  async getSyncSettings() {
    return this.holidayService.getSyncSettings();
  }

  @Patch('settings')
  @ApiOperation({ summary: '공휴일 동기화 설정 저장' })
  async saveSyncSettings(
    @Body()
    dto: {
      autoSyncEnabled?: boolean;
      kasiApiKey?: string;
      icsFeedUrl?: string;
    },
  ) {
    return this.holidayService.saveSyncSettings(dto);
  }

  @Post('sync')
  @ApiOperation({ summary: '한국천문연구원 특일정보 API 즉시 동기화' })
  async syncHolidays(@Body() body?: { years?: number[] }) {
    return this.holidayService.syncHolidays(body?.years);
  }

  @Post('import-ics')
  @ApiOperation({ summary: 'ICS 파일로 공휴일 일괄 가져오기 (폐쇄망용)' })
  async importIcs(@Body() body: { icsContent: string }) {
    return this.holidayService.importHolidaysFromIcs(body.icsContent);
  }

  @Post()
  @ApiOperation({ summary: '공휴일/임시공휴일 수동 등록' })
  async createHoliday(
    @Body()
    dto: {
      holidayDate: string;
      name: string;
      isSubstitute?: boolean;
      isActive?: boolean;
    },
  ) {
    return this.holidayService.createManual(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '공휴일 수정 및 활성 여부 토글' })
  async updateHoliday(
    @Param('id') id: string,
    @Body()
    dto: {
      holidayDate?: string;
      name?: string;
      isSubstitute?: boolean;
      isActive?: boolean;
    },
  ) {
    return this.holidayService.updateHoliday(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '공휴일 삭제' })
  async deleteHoliday(@Param('id') id: string) {
    return this.holidayService.deleteHoliday(id);
  }
}
