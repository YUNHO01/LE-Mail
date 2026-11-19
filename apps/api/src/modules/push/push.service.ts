import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import Redis from 'ioredis';
import * as webPush from 'web-push';
import {
  FolderType,
  PushSettingsResponse,
  PushSubscriptionItem,
  SettingCategory,
  WebPushNotificationPayload,
} from '@lemail/shared-types';
import {
  Domain,
  MailFolder,
  MailMessage,
  PushSubscription,
  SystemSetting,
  User,
} from '../database/entities';
import { CryptoService } from '../../common/crypto/crypto.service';
import {
  RegisterPushSubscriptionDto,
  UpdatePushSettingsDto,
} from './dto/push.dto';

interface MailboxRedisEvent {
  type: string;
  userId?: string;
  folderId?: string;
  uid?: number;
  messageId?: string;
}

const SETTING_VAPID_PUBLIC_KEY = 'VAPID_PUBLIC_KEY';
const SETTING_VAPID_PRIVATE_KEY = 'VAPID_PRIVATE_KEY';
const SETTING_VAPID_SUBJECT = 'VAPID_SUBJECT';

@Injectable()
export class PushService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PushService.name);
  private redisSubscriber: Redis | null = null;
  private redisPublisher: Redis | null = null;
  private vapidPublicKey = '';
  private vapidConfigured = false;

  constructor(
    @InjectRepository(PushSubscription)
    private readonly subRepo: Repository<PushSubscription>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(MailFolder)
    private readonly folderRepo: Repository<MailFolder>,
    @InjectRepository(MailMessage)
    private readonly messageRepo: Repository<MailMessage>,
    @InjectRepository(SystemSetting)
    private readonly settingRepo: Repository<SystemSetting>,
    @InjectRepository(Domain)
    private readonly domainRepo: Repository<Domain>,
    private readonly cryptoService: CryptoService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureVapidKeys();
    await this.startRedisSubscriber();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redisSubscriber) {
      await this.redisSubscriber.quit().catch(() => {});
      this.redisSubscriber = null;
    }
    if (this.redisPublisher) {
      await this.redisPublisher.quit().catch(() => {});
      this.redisPublisher = null;
    }
  }

  /**
   * DB(SystemSetting)에서 VAPID 키를 로드하거나, 없으면 자동 생성 후 암호화 저장
   */
  private async ensureVapidKeys(): Promise<void> {
    try {
      const [pubSetting, privSetting, subjectSetting] = await Promise.all([
        this.settingRepo.findOne({ where: { key: SETTING_VAPID_PUBLIC_KEY } }),
        this.settingRepo.findOne({ where: { key: SETTING_VAPID_PRIVATE_KEY } }),
        this.settingRepo.findOne({ where: { key: SETTING_VAPID_SUBJECT } }),
      ]);

      let publicKey = pubSetting?.value?.trim() || '';
      let privateKey = privSetting?.value
        ? this.cryptoService.decrypt(privSetting.value).trim()
        : '';
      let subject = subjectSetting?.value?.trim() || '';

      if (!publicKey || !privateKey) {
        const generated = webPush.generateVAPIDKeys();
        publicKey = generated.publicKey;
        privateKey = generated.privateKey;

        await this.upsertSystemSetting(
          SETTING_VAPID_PUBLIC_KEY,
          publicKey,
          false,
          'Web Push VAPID 공개키',
        );
        await this.upsertSystemSetting(
          SETTING_VAPID_PRIVATE_KEY,
          this.cryptoService.encrypt(privateKey),
          true,
          'Web Push VAPID 개인키 (AES-256-GCM 암호화)',
        );
        this.logger.log('Generated and persisted new VAPID key pair in SystemSetting.');
      }

      if (!subject) {
        const defaultDomain = await this.domainRepo.findOne({
          where: { isDefault: true },
        });
        const domainName = defaultDomain?.name || 'localhost.localdomain';
        subject = `mailto:admin@${domainName}`;
        await this.upsertSystemSetting(
          SETTING_VAPID_SUBJECT,
          subject,
          false,
          'Web Push VAPID Subject (mailto: 또는 https://)',
        );
      }

      webPush.setVapidDetails(subject, publicKey, privateKey);
      this.vapidPublicKey = publicKey;
      this.vapidConfigured = true;
      this.logger.log('Web Push VAPID details configured.');
    } catch (err: any) {
      this.logger.error(`Failed to initialize VAPID keys: ${err.message}`, err.stack);
    }
  }

  private async upsertSystemSetting(
    key: string,
    value: string,
    isSecret: boolean,
    description: string,
  ): Promise<void> {
    const existing = await this.settingRepo.findOne({ where: { key } });
    if (existing) {
      existing.value = value;
      existing.isSecret = isSecret;
      existing.description = description;
      await this.settingRepo.save(existing);
      return;
    }

    const created = this.settingRepo.create({
      key,
      value,
      category: SettingCategory.AUTH,
      valueType: 'string',
      isSecret,
      description,
    });
    await this.settingRepo.save(created);
  }

  private async startRedisSubscriber(): Promise<void> {
    const redisHost = this.configService.get<string>('redis.host') || '127.0.0.1';
    const redisPort = this.configService.get<number>('redis.port') || 6379;
    const redisPassword = this.configService.get<string>('redis.password') || undefined;

    this.redisSubscriber = new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      retryStrategy: (times) => Math.min(times * 500, 5000),
    });

    this.redisSubscriber.on('error', (err) => {
      this.logger.warn(`Push Redis subscriber error: ${err.message}`);
    });

    this.redisSubscriber.on('pmessage', (_pattern, channel, message) => {
      this.handleMailboxEvent(channel, message).catch((err) => {
        this.logger.warn(`Failed to process push event: ${err.message}`);
      });
    });

    await this.redisSubscriber.psubscribe('mailbox:events:*');
    this.logger.log('Subscribed to Redis pattern [mailbox:events:*] for Web Push.');
  }

  /**
   * 로컬 메일 발송 등 API 내부 경로에서 새 메일 도착 이벤트를 Redis Pub/Sub으로 발행
   * (IMAP IDLE 및 Web Push 동시 트리거)
   */
  async publishNewMailEvent(event: {
    userId: string;
    folderId: string;
    uid: number;
    messageId: string;
  }): Promise<void> {
    try {
      if (!this.redisPublisher) {
        const redisHost = this.configService.get<string>('redis.host') || '127.0.0.1';
        const redisPort = this.configService.get<number>('redis.port') || 6379;
        const redisPassword = this.configService.get<string>('redis.password') || undefined;
        this.redisPublisher = new Redis({
          host: redisHost,
          port: redisPort,
          password: redisPassword,
          lazyConnect: true,
          maxRetriesPerRequest: 1,
        });
      }
      if (this.redisPublisher.status !== 'ready') {
        await this.redisPublisher.connect();
      }
      await this.redisPublisher.publish(
        `mailbox:events:${event.userId}`,
        JSON.stringify({
          type: 'NEW_MAIL',
          userId: event.userId,
          folderId: event.folderId,
          uid: event.uid,
          messageId: event.messageId,
        }),
      );
    } catch (err: any) {
      this.logger.warn(`Failed to publish new mail event to Redis: ${err.message}`);
    }
  }

  private async handleMailboxEvent(channel: string, rawMessage: string): Promise<void> {
    if (!this.vapidConfigured) return;

    let payload: MailboxRedisEvent;
    try {
      payload = JSON.parse(rawMessage);
    } catch {
      return;
    }

    if (payload.type !== 'NEW_MAIL') return;

    const userId = payload.userId || channel.replace('mailbox:events:', '');
    if (!userId) return;

    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: { id: true, isActive: true, pushEnabled: true, pushPreviewEnabled: true },
    });
    if (!user || !user.isActive || !user.pushEnabled) return;

    const subscriptions = await this.subRepo.find({ where: { userId } });
    if (subscriptions.length === 0) return;

    // 스팸함으로 분류된 메일은 푸시 알림 제외
    if (payload.folderId) {
      const folder = await this.folderRepo.findOne({
        where: { id: payload.folderId },
        select: { id: true, type: true },
      });
      if (folder?.type === FolderType.SPAM) {
        return;
      }
    }

    let title = '새 메일 도착';
    let body = '새로운 메일이 도착했습니다.';

    if (user.pushPreviewEnabled && payload.messageId) {
      const mail = await this.messageRepo.findOne({
        where: { id: payload.messageId },
        select: { id: true, sender: true, subject: true },
      });
      if (mail) {
        title = mail.sender ? `${mail.sender}` : '새 메일 도착';
        body = mail.subject?.trim() || '(제목 없음)';
      }
    }

    const pushPayload: WebPushNotificationPayload = {
      title,
      body,
      messageId: payload.messageId,
      folderId: payload.folderId,
      url: payload.messageId ? `/mail/view/${payload.messageId}` : '/mail/inbox',
      tag: payload.messageId ? `lemail-${payload.messageId}` : 'lemail-new-mail',
    };

    await this.dispatchToSubscriptions(subscriptions, pushPayload);
  }

  private async dispatchToSubscriptions(
    subscriptions: PushSubscription[],
    payload: WebPushNotificationPayload,
  ): Promise<{ sent: number; failed: number }> {
    const serialized = JSON.stringify(payload);
    let sent = 0;
    let failed = 0;

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webPush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth,
              },
            },
            serialized,
            { TTL: 60 * 60 * 12 },
          );
          sent += 1;
          await this.subRepo.update(sub.id, { lastUsedAt: new Date() });
        } catch (err: any) {
          failed += 1;
          const statusCode = err?.statusCode;
          // 만료되었거나 브라우저에서 해제된 구독은 자동 정리
          if (statusCode === 404 || statusCode === 410) {
            await this.subRepo.delete(sub.id).catch(() => {});
            this.logger.log(`Removed expired push subscription: ${sub.id} (${statusCode})`);
          } else {
            this.logger.warn(
              `Web Push delivery failed for subscription ${sub.id}: ${err?.message || err}`,
            );
          }
        }
      }),
    );

    return { sent, failed };
  }

  getVapidPublicKey(): string {
    return this.vapidPublicKey;
  }

  private hashEndpoint(endpoint: string): string {
    return crypto.createHash('sha256').update(endpoint).digest('hex');
  }

  async registerSubscription(
    userId: string,
    dto: RegisterPushSubscriptionDto,
    userAgent?: string,
  ): Promise<PushSubscriptionItem> {
    const endpointHash = this.hashEndpoint(dto.endpoint);
    const ua = userAgent ? userAgent.slice(0, 255) : null;
    const label = dto.deviceLabel?.trim() || this.inferDeviceLabel(ua);

    let sub = await this.subRepo.findOne({ where: { endpointHash } });
    if (sub) {
      sub.userId = userId;
      sub.endpoint = dto.endpoint;
      sub.p256dh = dto.keys.p256dh;
      sub.auth = dto.keys.auth;
      sub.userAgent = ua;
      sub.deviceLabel = label;
    } else {
      sub = this.subRepo.create({
        userId,
        endpoint: dto.endpoint,
        endpointHash,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
        userAgent: ua,
        deviceLabel: label,
      });
    }

    const saved = await this.subRepo.save(sub);
    return this.toSubscriptionItem(saved);
  }

  async removeSubscription(userId: string, id: string): Promise<{ success: boolean }> {
    const sub = await this.subRepo.findOne({ where: { id, userId } });
    if (!sub) {
      throw new NotFoundException('등록된 푸시 구독을 찾을 수 없습니다.');
    }
    await this.subRepo.delete(sub.id);
    return { success: true };
  }

  async getSettingsAndSubscriptions(userId: string): Promise<PushSettingsResponse> {
    const [user, subs] = await Promise.all([
      this.userRepo.findOne({
        where: { id: userId },
        select: { id: true, pushEnabled: true, pushPreviewEnabled: true },
      }),
      this.subRepo.find({
        where: { userId },
        order: { createdAt: 'DESC' },
      }),
    ]);

    return {
      pushEnabled: user?.pushEnabled ?? true,
      pushPreviewEnabled: user?.pushPreviewEnabled ?? true,
      subscriptions: subs.map((s) => this.toSubscriptionItem(s)),
    };
  }

  async updateSettings(
    userId: string,
    dto: UpdatePushSettingsDto,
  ): Promise<PushSettingsResponse> {
    const updates: Partial<User> = {};
    if (typeof dto.pushEnabled === 'boolean') {
      updates.pushEnabled = dto.pushEnabled;
    }
    if (typeof dto.pushPreviewEnabled === 'boolean') {
      updates.pushPreviewEnabled = dto.pushPreviewEnabled;
    }
    if (Object.keys(updates).length > 0) {
      await this.userRepo.update({ id: userId }, updates);
    }
    return this.getSettingsAndSubscriptions(userId);
  }

  async sendTestNotification(
    userId: string,
  ): Promise<{ sent: number; failed: number }> {
    const subs = await this.subRepo.find({ where: { userId } });
    if (subs.length === 0) {
      return { sent: 0, failed: 0 };
    }

    return this.dispatchToSubscriptions(subs, {
      title: 'LEMail 테스트 알림',
      body: '새 메일 수신 시 이 기기로 Web Push 알림이 정상 발송됩니다.',
      url: '/mail/inbox',
      tag: 'lemail-test-notification',
    });
  }

  private toSubscriptionItem(sub: PushSubscription): PushSubscriptionItem {
    return {
      id: sub.id,
      endpoint: sub.endpoint,
      deviceLabel: sub.deviceLabel,
      userAgent: sub.userAgent,
      lastUsedAt: sub.lastUsedAt ? sub.lastUsedAt.toISOString() : null,
      createdAt: sub.createdAt.toISOString(),
    };
  }

  private inferDeviceLabel(ua: string | null): string {
    if (!ua) return '웹 브라우저';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS 기기';
    if (/Android/i.test(ua)) return 'Android 기기';
    if (/Edg\//i.test(ua)) return 'Microsoft Edge';
    if (/Chrome\//i.test(ua)) return 'Google Chrome';
    if (/Firefox\//i.test(ua)) return 'Mozilla Firefox';
    if (/Safari\//i.test(ua)) return 'Safari';
    return '웹 브라우저';
  }
}
