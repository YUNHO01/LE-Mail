import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole, FolderType } from '@lemail/shared-types';
import { QuarantineService } from './quarantine.service';

@Controller('admin/quarantine')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SYSTEM_ADMIN)
export class QuarantineController {
  constructor(private readonly quarantineService: QuarantineService) {}

  @Get()
  async getQuarantined(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
  ) {
    return this.quarantineService.getQuarantinedMails({ page, limit, search });
  }

  @Get('stats')
  async getStats() {
    return this.quarantineService.getQuarantineStats();
  }

  @Post('purge-expired')
  async purgeExpired(@Body('retentionDays') retentionDays?: number) {
    return this.quarantineService.purgeExpiredQuarantine(retentionDays || 30);
  }

  @Get(':id')
  async getDetail(@Param('id') id: string) {
    return this.quarantineService.getQuarantinedMailDetail(id);
  }

  @Post(':id/release')
  async releaseMail(
    @Param('id') id: string,
    @Body('targetFolderType') targetFolderType?: FolderType,
    @Body('addToWhitelist') addToWhitelist?: boolean,
  ) {
    return this.quarantineService.releaseMail(id, {
      targetFolderType,
      addToWhitelist: Boolean(addToWhitelist),
    });
  }

  @Delete(':id')
  async dropMail(@Param('id') id: string) {
    return this.quarantineService.dropMail(id);
  }
}
