import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Optional,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, LessThan } from 'typeorm';
import {
  MailMessage,
  MailStatus,
  SpfResult,
  DkimResult,
  DmarcResult,
} from '../database/entities/mail-message.entity';
import { MailRecipient } from '../database/entities/mail-recipient.entity';
import { MailFolder, UserMail, User } from '../database/entities';
import { SpamRule, SpamRuleType, SpamRuleTargetType } from '../database/entities/spam-rule.entity';
import { FolderType } from '@lemail/shared-types';
import { existsSync, unlinkSync } from 'fs';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { SpamConfigService } from './spam-config.service';

@Injectable()
export class QuarantineService {
  private readonly logger = new Logger(QuarantineService.name);
  private readonly redisPublisher: Redis;

  constructor(
    @InjectRepository(MailMessage)
    private readonly messageRepo: Repository<MailMessage>,
    @InjectRepository(MailRecipient)
    private readonly recipientRepo: Repository<MailRecipient>,
    @InjectRepository(SpamRule)
    private readonly spamRuleRepo: Repository<SpamRule>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(MailFolder)
    private readonly folderRepo: Repository<MailFolder>,
    @InjectRepository(UserMail)
    private readonly userMailRepo: Repository<UserMail>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    @Optional()
    private readonly spamConfigService?: SpamConfigService,
  ) {
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

  async getQuarantinedMails(query: {
    page?: number;
    limit?: number;
    search?: string;
  }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const qb = this.messageRepo
      .createQueryBuilder('msg')
      .leftJoinAndSelect('msg.recipients', 'rec')
      .where('msg.status = :status', { status: MailStatus.QUARANTINED })
      .orderBy('msg.createdAt', 'DESC');

    if (query.search && query.search.trim()) {
      const term = `%${query.search.trim()}%`;
      qb.andWhere('(msg.sender LIKE :term OR msg.subject LIKE :term)', { term });
    }

    const [items, total] = await qb.skip(skip).take(limit).getManyAndCount();

    const formatted = items.map((msg) => {
      let reasons: string[] = [];
      if (msg.spamReasons) {
        try {
          reasons = JSON.parse(msg.spamReasons);
        } catch {
          reasons = [msg.spamReasons];
        }
      }

      return {
        id: msg.id,
        sender: msg.sender,
        subject: msg.subject,
        spamScore: msg.spamScore || 0,
        spamReasons: reasons,
        spfResult: msg.spfResult,
        dkimResult: msg.dkimResult,
        dmarcResult: msg.dmarcResult,
        status: msg.status,
        recipients: (msg.recipients || []).map((r) => r.address),
        createdAt: msg.createdAt.toISOString(),
      };
    });

    return {
      items: formatted,
      total,
      page,
      limit,
    };
  }

  async getQuarantinedMailDetail(id: string) {
    const message = await this.messageRepo.findOne({
      where: { id, status: MailStatus.QUARANTINED },
      relations: { recipients: true, attachments: true },
    });

    if (!message) {
      throw new NotFoundException('격리된 메일을 찾을 수 없습니다.');
    }

    let reasons: string[] = [];
    if (message.spamReasons) {
      try {
        reasons = JSON.parse(message.spamReasons);
      } catch {
        reasons = [message.spamReasons];
      }
    }

    return {
      ...message,
      spamReasons: reasons,
      recipients: (message.recipients || []).map((r) => r.address),
    };
  }

  async releaseMail(
    id: string,
    options?: { targetFolderType?: FolderType; addToWhitelist?: boolean },
  ) {
    const message = await this.messageRepo.findOne({
      where: { id, status: MailStatus.QUARANTINED },
      relations: { recipients: true },
    });

    if (!message) {
      throw new NotFoundException('격리된 메일을 찾을 수 없습니다.');
    }

    const targetType = options?.targetFolderType || FolderType.INBOX;
    const releasedTo: string[] = [];
    const notifyEvents: Array<{ userId: string; folderId: string; uid: number }> = [];

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const recipientAddresses = (message.recipients || []).map((r) =>
        r.address.toLowerCase().trim(),
      );

      for (const address of recipientAddresses) {
        const user = await queryRunner.manager.findOne(User, {
          where: { email: address },
        });

        if (user) {
          const folder = await queryRunner.manager.findOne(MailFolder, {
            where: { userId: user.id, type: targetType },
            lock: { mode: 'pessimistic_write' },
          });

          if (folder) {
            const assignedUid = folder.uidnext || 1;
            folder.uidnext = assignedUid + 1;
            await queryRunner.manager.save(folder);

            const userMail = queryRunner.manager.create(UserMail, {
              userId: user.id,
              folderId: folder.id,
              messageId: id,
              uid: assignedUid,
              isRead: false,
              isStarred: false,
              isDeleted: false,
              isAnswered: false,
              isDraft: false,
            });
            await queryRunner.manager.save(userMail);

            releasedTo.push(user.email);
            notifyEvents.push({
              userId: user.id,
              folderId: folder.id,
              uid: assignedUid,
            });
          }
        }
      }

      // 화이트리스트 등록 옵션 선택 시
      if (options?.addToWhitelist && message.sender && message.sender.includes('@')) {
        const sender = message.sender.toLowerCase().trim();
        const existing = await queryRunner.manager.findOne(SpamRule, {
          where: {
            userId: null as any,
            type: SpamRuleType.WHITELIST,
            pattern: sender,
          },
        });

        if (!existing) {
          const rule = queryRunner.manager.create(SpamRule, {
            userId: null,
            type: SpamRuleType.WHITELIST,
            targetType: SpamRuleTargetType.EMAIL,
            pattern: sender,
            reason: '관리자 격리 해제 승인으로 전사 화이트리스트 자동 등록',
          });
          await queryRunner.manager.save(rule);
        }
      }

      // 상태 변경
      message.status = MailStatus.PROCESSED;
      await queryRunner.manager.save(message);

      await queryRunner.commitTransaction();
      this.logger.log(
        `Quarantined mail ${id} released to: ${releasedTo.join(', ')}`,
      );

      // Redis 알림 발행
      for (const ev of notifyEvents) {
        try {
          if (this.redisPublisher.status !== 'ready') {
            await this.redisPublisher.connect();
          }
          await this.redisPublisher.publish(
            `mailbox:events:${ev.userId}`,
            JSON.stringify({
              type: 'NEW_MAIL',
              userId: ev.userId,
              folderId: ev.folderId,
              uid: ev.uid,
              messageId: id,
            }),
          );
        } catch {}
      }

      return {
        success: true,
        message: `${releasedTo.length}명의 수신자에게 메일이 성공적으로 전달되었습니다.`,
        releasedTo,
      };
    } catch (err: any) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to release mail ${id}: ${err.message}`);
      throw new BadRequestException(`메일 릴리즈 실패: ${err.message}`);
    } finally {
      await queryRunner.release();
    }
  }

  async dropMail(id: string) {
    const message = await this.messageRepo.findOne({
      where: { id, status: MailStatus.QUARANTINED },
    });

    if (!message) {
      throw new NotFoundException('격리된 메일을 찾을 수 없습니다.');
    }

    if (message.rawFilePath && existsSync(message.rawFilePath)) {
      try {
        unlinkSync(message.rawFilePath);
      } catch (err: any) {
        this.logger.warn(`Failed to delete raw file for ${id}: ${err.message}`);
      }
    }

    await this.messageRepo.remove(message);
    this.logger.log(`Quarantined mail ${id} permanently dropped and removed`);

    return {
      success: true,
      message: '격리된 메일이 영구 삭제되었습니다.',
    };
  }

  async getQuarantineStats() {
    const totalQuarantined = await this.messageRepo.count({
      where: { status: MailStatus.QUARANTINED },
    });

    const highRiskCount = await this.messageRepo
      .createQueryBuilder('msg')
      .where('msg.status = :status AND msg.spamScore >= 12.0', {
        status: MailStatus.QUARANTINED,
      })
      .getCount();

    return {
      totalQuarantined,
      highRiskCount,
    };
  }

  /**
   * 지정 기간(기본 정책 설정값, 기본 30일)이 경과한 격리 메일 일괄 영구 삭제 (보존 주기 관리)
   */
  async purgeExpiredQuarantine(days?: number): Promise<{ purgedCount: number; message: string }> {
    const configDays = this.spamConfigService?.getConfig()?.quarantineRetentionDays;
    const retentionDays = days ?? configDays ?? 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const expiredMails = await this.messageRepo.find({
      where: {
        status: MailStatus.QUARANTINED,
        createdAt: LessThan(cutoffDate),
      },
    });

    let purgedCount = 0;
    for (const mail of expiredMails) {
      if (mail.rawFilePath && existsSync(mail.rawFilePath)) {
        try {
          unlinkSync(mail.rawFilePath);
        } catch {}
      }
      await this.messageRepo.remove(mail);
      purgedCount++;
    }

    this.logger.log(`Purged ${purgedCount} expired quarantined mails older than ${retentionDays} days`);
    return {
      purgedCount,
      message: `${retentionDays}일 보존 기간이 만료된 격리 메일 ${purgedCount}건이 자동 삭제되었습니다.`,
    };
  }
}
