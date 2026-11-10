import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import Redis from 'ioredis';
import {
  MailMessage,
  MailStatus,
  Direction,
  SpfResult,
  DkimResult,
  DmarcResult,
} from '../database/entities/mail-message.entity';
import {
  MailRecipient,
  RecipientType,
} from '../database/entities/mail-recipient.entity';
import { MailAttachment } from '../database/entities/mail-attachment.entity';
import {
  User,
  MailFolder,
  UserMail,
  SpamRule,
  SpamRuleType,
} from '../database/entities';
import { FolderType } from '@lemail/shared-types';
import { WorkerPoolService } from '../worker-pool/worker-pool.service';
import { SpamScoreService } from '../spam/spam-score.service';
import { AttachmentSecurityService } from '../spam/attachment-security.service';
import { BayesianSpamService } from '../spam/bayesian-spam.service';
import {
  InboundMailJobData,
  INBOUND_MAIL_QUEUE_NAME,
} from './interfaces/inbound-mail.interface';
import { existsSync, mkdirSync, renameSync, unlinkSync } from 'fs';
import { join, resolve } from 'path';

const workerConcurrency = parseInt(process.env.WORKER_CONCURRENCY || '5', 10);

@Processor(INBOUND_MAIL_QUEUE_NAME, { concurrency: workerConcurrency })
export class InboundMailProcessor extends WorkerHost implements OnModuleDestroy {
  private readonly logger = new Logger(InboundMailProcessor.name);
  private readonly spoolCleanup: boolean;
  private readonly archiveDir: string;
  private readonly quarantineDir: string;
  private readonly redisPublisher: Redis;

  constructor(
    private readonly workerPool: WorkerPoolService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly spamScoreService: SpamScoreService,
    private readonly attachmentSecurityService: AttachmentSecurityService,
    private readonly bayesianSpamService: BayesianSpamService,
  ) {
    super();
    this.spoolCleanup =
      this.configService.get<boolean>('smtp.spoolCleanup') ?? false;
    this.archiveDir = resolve(
      process.cwd(),
      this.configService.get<string>('smtp.archiveDir') || './mail-archive',
    );
    this.quarantineDir = resolve(
      process.cwd(),
      join(this.configService.get<string>('smtp.spoolDir') || './mail-spool', 'quarantine'),
    );

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

  async onModuleDestroy() {
    if (this.redisPublisher) {
      await this.redisPublisher.quit().catch(() => {});
    }
  }

  async process(job: Job<InboundMailJobData>): Promise<void> {
    const { id, rawFilePath, from, to, clientIp } = job.data;
    this.logger.log(`Processing inbound mail job ${job.id} (File: ${rawFilePath})`);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let finalRawFilePath = rawFilePath;

    try {
      // 1. Piscina Worker Threads를 통한 MIME 파싱 및 실제 SPF/DKIM/DMARC 검증 오프로딩
      const parsedData = await this.workerPool.parseMail(rawFilePath, {
        clientIp,
        sender: from,
      });

      // 2. 첨부파일 보안 검사 (위험 확장자, 매크로 오피스 문서, 이중 확장자, ClamAV 백신 실시간 검사)
      const attachmentThreat = await this.attachmentSecurityService.scanAttachments(
        parsedData.attachments || [],
      );

      // 3. 베이지안 스팸 확률 분류 (Naive Bayes 머신러닝 학습 모델)
      const bayesResult = await this.bayesianSpamService.classify({
        subject: parsedData.subject,
        text: parsedData.text,
        html: parsedData.html,
      });

      // 4. 스팸 스코어링 엔진 평가 (헤더 인증 + 본문 피싱/스팸 키워드 + 베이지안 점수 + 첨부파일 악성코드 종합)
      const effectiveSender = (from || parsedData.from || 'unknown@unknown')
        .toLowerCase()
        .trim();
      const spamEval = this.spamScoreService.evaluateMail({
        subject: parsedData.subject,
        text: parsedData.text,
        html: parsedData.html,
        from: effectiveSender,
        spfResult: parsedData.spfResult as SpfResult,
        dkimResult: parsedData.dkimResult as DkimResult,
        dmarcResult: parsedData.dmarcResult as DmarcResult,
        attachmentThreatScore: attachmentThreat.score,
        attachmentThreatReasons: attachmentThreat.reasons,
        bayesianScore: bayesResult.score,
        bayesianReason: bayesResult.reason,
      });

      // 4. MailMessage 엔티티 생성
      const message = queryRunner.manager.create(MailMessage, {
        id,
        direction: Direction.INBOUND,
        messageId: parsedData.messageId || null,
        sender: effectiveSender,
        subject: parsedData.subject || null,
        rawFilePath: finalRawFilePath,
        spfResult: (parsedData.spfResult as SpfResult) || SpfResult.NONE,
        dkimResult: (parsedData.dkimResult as DkimResult) || DkimResult.NONE,
        dmarcResult: (parsedData.dmarcResult as DmarcResult) || DmarcResult.NONE,
        spamScore: spamEval.score,
        spamReasons:
          spamEval.reasons.length > 0 ? JSON.stringify(spamEval.reasons) : null,
        status:
          spamEval.action === 'QUARANTINE'
            ? MailStatus.QUARANTINED
            : MailStatus.PROCESSED,
      });
      await queryRunner.manager.save(message);

      // 3. 수신자 (TO, CC, BCC) 엔티티 생성
      const recipientsToSave: MailRecipient[] = [];

      // Envelope TO 우선 등록
      const allToAddresses = new Set<string>([...to, ...(parsedData.to || [])]);
      for (const address of allToAddresses) {
        recipientsToSave.push(
          queryRunner.manager.create(MailRecipient, {
            messageId: id,
            type: RecipientType.TO,
            address,
          }),
        );
      }

      // CC 등록
      for (const address of parsedData.cc || []) {
        recipientsToSave.push(
          queryRunner.manager.create(MailRecipient, {
            messageId: id,
            type: RecipientType.CC,
            address,
          }),
        );
      }

      // BCC 등록
      for (const address of parsedData.bcc || []) {
        recipientsToSave.push(
          queryRunner.manager.create(MailRecipient, {
            messageId: id,
            type: RecipientType.BCC,
            address,
          }),
        );
      }

      if (recipientsToSave.length > 0) {
        await queryRunner.manager.save(recipientsToSave);
      }

      // 4. 첨부파일 저장 및 MailAttachment 엔티티 생성
      if (parsedData.attachments && parsedData.attachments.length > 0) {
        const attachmentsToSave: MailAttachment[] = [];
        for (const att of parsedData.attachments) {
          let storagePath = '';
          if (att.contentBase64) {
            storagePath = await this.workerPool.saveAttachment(
              id,
              att.filename,
              att.contentBase64,
            );
          }

          attachmentsToSave.push(
            queryRunner.manager.create(MailAttachment, {
              messageId: id,
              filename: att.filename,
              contentType: att.contentType,
              sizeBytes: String(att.size),
              storagePath,
            }),
          );
        }
        await queryRunner.manager.save(attachmentsToSave);
      }

      // 5. 스풀 파일 수명 주기 처리 (Lifecycle Management)
      if (this.spoolCleanup) {
        if (existsSync(rawFilePath)) {
          unlinkSync(rawFilePath);
          this.logger.log(`[Lifecycle] Removed raw spool file: ${rawFilePath}`);
        }
      } else if (this.archiveDir) {
        if (existsSync(rawFilePath)) {
          const now = new Date();
          const year = String(now.getFullYear());
          const month = String(now.getMonth() + 1).padStart(2, '0');
          const day = String(now.getDate()).padStart(2, '0');
          const targetDir = join(this.archiveDir, year, month, day);
          if (!existsSync(targetDir)) {
            mkdirSync(targetDir, { recursive: true });
          }
          finalRawFilePath = join(targetDir, `${id}.eml`);
          renameSync(rawFilePath, finalRawFilePath);
          // 아카이브 경로로 엔티티 rawFilePath 갱신
          await queryRunner.manager.update(MailMessage, { id }, { rawFilePath: finalRawFilePath });
          this.logger.log(`[Lifecycle] Archived spool file to: ${finalRawFilePath}`);
        }
      }

      // 6. 편지함(UserMail) 매핑 (수신자의 개인별 스팸/정상 규칙 또는 SPF/DMARC 인증 결과에 따른 분류)
      const notifyEvents: Array<{ userId: string; folderId: string; uid: number }> = [];
      const senderDomain = effectiveSender.includes('@') ? effectiveSender.split('@')[1] : '';

      for (const address of allToAddresses) {
        const normEmail = address.toLowerCase().trim();
        const targetUser = await queryRunner.manager.findOne(User, {
          where: { email: normEmail },
        });
        if (targetUser) {
          // 6-1. 사용자/글로벌 화이트리스트 및 블랙리스트 판별
          let targetFolderType: FolderType = FolderType.INBOX;

          // 화이트리스트 체크 (사용자 지정 or 전사 공통)
          const whitelistRule = await queryRunner.manager
            .createQueryBuilder(SpamRule, 'rule')
            .where('(rule.userId = :userId OR rule.userId IS NULL)', { userId: targetUser.id })
            .andWhere('rule.type = :ruleType', { ruleType: SpamRuleType.WHITELIST })
            .andWhere(
              '(LOWER(rule.pattern) = :sender OR LOWER(rule.pattern) = :domain OR LOWER(rule.pattern) = :atDomain)',
              {
                sender: effectiveSender,
                domain: senderDomain,
                atDomain: `@${senderDomain}`,
              },
            )
            .getOne();

          // 블랙리스트 체크 (사용자 지정 or 전사 공통)
          const blacklistRule = await queryRunner.manager
            .createQueryBuilder(SpamRule, 'rule')
            .where('(rule.userId = :userId OR rule.userId IS NULL)', { userId: targetUser.id })
            .andWhere('rule.type = :ruleType', { ruleType: SpamRuleType.BLACKLIST })
            .andWhere(
              '(LOWER(rule.pattern) = :sender OR LOWER(rule.pattern) = :domain OR LOWER(rule.pattern) = :atDomain)',
              {
                sender: effectiveSender,
                domain: senderDomain,
                atDomain: `@${senderDomain}`,
              },
            )
            .getOne();

          if (whitelistRule) {
            targetFolderType = FolderType.INBOX;
          } else if (blacklistRule) {
            targetFolderType = FolderType.SPAM;
          } else if (spamEval.action === 'QUARANTINE') {
            this.logger.warn(
              `[Quarantine] Mail ${id} (Score: ${spamEval.score}) quarantined for user ${targetUser.email}. Delivery suspended for admin review. Reasons: ${spamEval.reasons.join(', ')}`,
            );
            // 고위험 스팸/피싱 메일은 사용자 편지함에 매핑하지 않고 관리자 격리 상태 유지
            continue;
          } else {
            // 스팸 점수(5~9.9점) 또는 SPF/DMARC 인증 실패 시 SPAM 편지함 분류
            const isSpam =
              spamEval.action === 'SPAM' ||
              parsedData.spfResult === SpfResult.FAIL ||
              parsedData.dmarcResult === DmarcResult.FAIL;
            targetFolderType = isSpam ? FolderType.SPAM : FolderType.INBOX;
          }

          const folder = await queryRunner.manager.findOne(MailFolder, {
            where: { userId: targetUser.id, type: targetFolderType },
            lock: { mode: 'pessimistic_write' },
          });
          if (folder) {
            const assignedUid = folder.uidnext || 1;
            folder.uidnext = assignedUid + 1;
            await queryRunner.manager.save(folder);

            const userMail = queryRunner.manager.create(UserMail, {
              userId: targetUser.id,
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
            this.logger.log(
              `Mapped mail ${id} (UID: ${assignedUid}) to folder [${folder.name}] for user ${targetUser.email}`,
            );

            notifyEvents.push({
              userId: targetUser.id,
              folderId: folder.id,
              uid: assignedUid,
            });
          }
        }
      }

      // 7. 트랜잭션 커밋
      await queryRunner.commitTransaction();
      this.logger.log(`Successfully processed & persisted mail: ${id}`);

      // 8. Redis Pub/Sub 이벤트 발행 (IMAP IDLE 및 실시간 알림 연동)
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
        } catch (pubErr: any) {
          this.logger.warn(`Failed to publish new mail event to Redis: ${pubErr.message}`);
        }
      }
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Failed to process mail ${id}: ${error.message}`,
        error.stack,
      );

      // 격리 디렉터리(Quarantine)로 실패 EML 이동
      if (existsSync(rawFilePath)) {
        try {
          if (!existsSync(this.quarantineDir)) {
            mkdirSync(this.quarantineDir, { recursive: true });
          }
          const quarantinedPath = join(this.quarantineDir, `${id}.eml`);
          renameSync(rawFilePath, quarantinedPath);
          finalRawFilePath = quarantinedPath;
          this.logger.warn(`[Lifecycle] Quarantined failed raw EML to: ${quarantinedPath}`);
        } catch (quarantineErr) {
          this.logger.error(`Failed to quarantine file: ${quarantineErr.message}`);
        }
      }

      // 실패 상태로 별도 기록
      try {
        await this.dataSource.getRepository(MailMessage).upsert(
          {
            id,
            direction: Direction.INBOUND,
            sender: from || 'unknown',
            rawFilePath: finalRawFilePath,
            status: MailStatus.FAILED,
          },
          ['id'],
        );
      } catch (upsertError) {
        this.logger.error(`Failed to record FAILED status for ${id}: ${upsertError.message}`);
      }

      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<InboundMailJobData>, error: Error) {
    this.logger.error(
      `Job ${job.id} failed after attempt ${job.attemptsMade}: ${error.message}`,
    );
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<InboundMailJobData>) {
    this.logger.log(`Job ${job.id} completed successfully`);
  }
}
