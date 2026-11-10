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
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../database/entities/user.entity';
import { SpamService } from './spam.service';
import { SpamAnalyticsService } from './spam-analytics.service';
import { AccountDefenseService } from './account-defense.service';
import { DmarcReportService } from './dmarc-report.service';
import { SpamConfigService, SpamPolicyConfig } from './spam-config.service';
import { BayesianSpamService } from './bayesian-spam.service';
import { CreateSpamRuleDto } from './dto/create-spam-rule.dto';
import { UserRole } from '@lemail/shared-types';

@Controller('spam')
@UseGuards(JwtAuthGuard)
export class SpamController {
  constructor(
    private readonly spamService: SpamService,
    private readonly analyticsService: SpamAnalyticsService,
    private readonly accountDefenseService: AccountDefenseService,
    private readonly dmarcReportService: DmarcReportService,
    private readonly spamConfigService: SpamConfigService,
    private readonly bayesianSpamService: BayesianSpamService,
  ) {}

  @Get('analytics')
  async getAnalytics(@Query('range') range?: 'today' | '7d' | '30d') {
    return this.analyticsService.getAnalytics(range || '7d');
  }

  @Get('config')
  async getConfig(@CurrentUser() user: User) {
    return this.spamConfigService.getConfig();
  }

  @Patch('config')
  async updateConfig(
    @CurrentUser() user: User,
    @Body() patch: Partial<SpamPolicyConfig>,
  ) {
    if (user.role !== UserRole.SYSTEM_ADMIN) {
      throw new ForbiddenException('시스템 관리자만 스팸 정책 설정을 변경할 수 있습니다.');
    }
    return this.spamConfigService.updateConfig(patch);
  }

  @Get('security-incidents')
  async getSecurityIncidents(@CurrentUser() user: User) {
    if (user.role !== UserRole.SYSTEM_ADMIN) {
      const lockStatus = await this.accountDefenseService.isAccountLocked(user.id);
      return [
        {
          userId: user.id,
          isLocked: lockStatus.locked,
          reason: lockStatus.locked ? lockStatus.reason : '정상',
        },
      ];
    }
    return this.accountDefenseService.getSecurityIncidents();
  }

  @Post('security-incidents/:userId/unlock')
  async unlockAccount(
    @CurrentUser() user: User,
    @Param('userId') targetUserId: string,
  ) {
    if (user.role !== UserRole.SYSTEM_ADMIN) {
      throw new ForbiddenException('시스템 관리자만 계정 잠금을 해제할 수 있습니다.');
    }
    const success = await this.accountDefenseService.unlockAccount(targetUserId);
    return { success, userId: targetUserId, message: '계정 잠금이 정상적으로 해제되었습니다.' };
  }

  @Post('dmarc-reports/parse')
  async parseDmarcReport(@CurrentUser() user: User, @Body('xml') xml: string) {
    return this.dmarcReportService.parseDmarcXml(xml || '');
  }

  @Get('bayesian/stats')
  async getBayesianStats(@CurrentUser() user: User) {
    return this.bayesianSpamService.getStats();
  }

  @Get('rules')
  async getRules(@CurrentUser() user: User) {
    return this.spamService.getRules(user.id);
  }

  @Post('rules')
  async createRule(
    @CurrentUser() user: User,
    @Body() dto: CreateSpamRuleDto,
    @Body('isGlobal') isGlobal?: boolean,
  ) {
    const allowGlobal = isGlobal && user.role === UserRole.SYSTEM_ADMIN;
    return this.spamService.createRule(user.id, dto, allowGlobal);
  }

  @Delete('rules/:id')
  async deleteRule(@CurrentUser() user: User, @Param('id') id: string) {
    const isAdmin = user.role === UserRole.SYSTEM_ADMIN;
    return this.spamService.deleteRule(user.id, id, isAdmin);
  }

  @Post('report/:messageId')
  async reportSpam(
    @CurrentUser() user: User,
    @Param('messageId') messageId: string,
  ) {
    return this.spamService.reportSpam(user.id, messageId);
  }

  @Post('unreport/:messageId')
  async unreportSpam(
    @CurrentUser() user: User,
    @Param('messageId') messageId: string,
  ) {
    return this.spamService.unreportSpam(user.id, messageId);
  }
}
