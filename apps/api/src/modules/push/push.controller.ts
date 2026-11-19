import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PushService } from './push.service';
import {
  RegisterPushSubscriptionDto,
  UpdatePushSettingsDto,
} from './dto/push.dto';

@ApiTags('Web Push Notifications')
@Controller('push')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Get('vapid-public-key')
  @ApiOperation({
    summary: 'VAPID 공개키 조회',
    description: '브라우저 PushManager 구독에 필요한 서버 VAPID 공개키를 반환합니다.',
  })
  @ApiResponse({ status: 200, description: 'VAPID 공개키 반환' })
  getVapidPublicKey() {
    return { publicKey: this.pushService.getVapidPublicKey() };
  }

  @Get('subscriptions')
  @ApiOperation({
    summary: '내 Web Push 설정 및 등록 기기 목록 조회',
    description: '사용자의 알림 활성화 설정과 등록된 브라우저/PWA 기기 목록을 조회합니다.',
  })
  getSubscriptions(@CurrentUser() user: any) {
    return this.pushService.getSettingsAndSubscriptions(user.id);
  }

  @Post('subscriptions')
  @ApiOperation({
    summary: 'Web Push 구독 등록/갱신',
    description: '브라우저에서 발급받은 PushSubscription 정보를 저장합니다.',
  })
  registerSubscription(
    @CurrentUser() user: any,
    @Body() dto: RegisterPushSubscriptionDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.pushService.registerSubscription(user.id, dto, userAgent);
  }

  @Delete('subscriptions/:id')
  @ApiOperation({
    summary: 'Web Push 구독 해제',
    description: '특정 기기의 Web Push 구독을 삭제합니다.',
  })
  removeSubscription(@CurrentUser() user: any, @Param('id') id: string) {
    return this.pushService.removeSubscription(user.id, id);
  }

  @Patch('settings')
  @ApiOperation({
    summary: 'Web Push 알림 설정 변경',
    description: '계정 전역 푸시 알림 활성화 및 미리보기 표시 여부를 변경합니다.',
  })
  updateSettings(
    @CurrentUser() user: any,
    @Body() dto: UpdatePushSettingsDto,
  ) {
    return this.pushService.updateSettings(user.id, dto);
  }

  @Post('test')
  @ApiOperation({
    summary: '테스트 Web Push 알림 발송',
    description: '현재 계정에 등록된 모든 구독 기기로 테스트 알림을 발송합니다.',
  })
  sendTestNotification(@CurrentUser() user: any) {
    return this.pushService.sendTestNotification(user.id);
  }
}
