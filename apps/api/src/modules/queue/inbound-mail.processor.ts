import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
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
import { User, MailFolder, UserMail } from '../database/entities';
import { FolderType } from '@lemail/shared-types';
import { WorkerPoolService } from '../worker-pool/worker-pool.service';
import {
  InboundMailJobData,
  INBOUND_MAIL_QUEUE_NAME,
} from './interfaces/inbound-mail.interface';
import { existsSync, mkdirSync, renameSync, unlinkSync } from 'fs';
import { join, resolve } from 'path';

const workerConcurrency = parseInt(process.env.WORKER_CONCURRENCY || '5', 10);

@Processor(INBOUND_MAIL_QUEUE_NAME, { concurrency: workerConcurrency })
export class InboundMailProcessor extends WorkerHost {
  private readonly logger = new Logger(InboundMailProcessor.name);
  private readonly spoolCleanup: boolean;
  private readonly archiveDir: string;
  private readonly quarantineDir: string;

  constructor(
    private readonly workerPool: WorkerPoolService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
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
  }

  async process(job: Job<InboundMailJobData>): Promise<void> {
    const { id, rawFilePath, from, to } = job.data;
    this.logger.log(`Processing inbound mail job ${job.id} (File: ${rawFilePath})`);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let finalRawFilePath = rawFilePath;

    try {
      // 1. Piscina Worker Threads를 통한 MIME 파싱 오프로딩
      const parsedData = await this.workerPool.parseMail(rawFilePath);

      // 2. MailMessage 엔티티 생성
      const message = queryRunner.manager.create(MailMessage, {
        id,
        direction: Direction.INBOUND,
        messageId: parsedData.messageId || null,
        sender: from || parsedData.from || 'unknown@unknown',
        subject: parsedData.subject || null,
        rawFilePath: finalRawFilePath,
        spfResult: (parsedData.spfResult as SpfResult) || SpfResult.NONE,
        dkimResult: (parsedData.dkimResult as DkimResult) || DkimResult.NONE,
        dmarcResult: (parsedData.dmarcResult as DmarcResult) || DmarcResult.NONE,
        status: MailStatus.PROCESSED,
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

      // 6. 편지함(UserMail) 매핑 (수신자의 받은편지함 또는 스팸메일함)
      const isSpam =
        parsedData.spfResult === SpfResult.FAIL ||
        parsedData.dmarcResult === DmarcResult.FAIL;
      const targetFolderType = isSpam ? FolderType.SPAM : FolderType.INBOX;

      for (const address of allToAddresses) {
        const normEmail = address.toLowerCase().trim();
        const targetUser = await queryRunner.manager.findOne(User, {
          where: { email: normEmail },
        });
        if (targetUser) {
          const folder = await queryRunner.manager.findOne(MailFolder, {
            where: { userId: targetUser.id, type: targetFolderType },
          });
          if (folder) {
            const userMail = queryRunner.manager.create(UserMail, {
              userId: targetUser.id,
              folderId: folder.id,
              messageId: id,
              isRead: false,
              isStarred: false,
            });
            await queryRunner.manager.save(userMail);
            this.logger.log(
              `Mapped mail ${id} to folder [${folder.name}] for user ${targetUser.email}`,
            );
          }
        }
      }

      // 7. 트랜잭션 커밋
      await queryRunner.commitTransaction();
      this.logger.log(`Successfully processed & persisted mail: ${id}`);
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
