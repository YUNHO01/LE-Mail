import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { MailMessage, Direction, SpfResult, DkimResult, DmarcResult, MailStatus } from '../database/entities/mail-message.entity';
import { MailAttachment } from '../database/entities/mail-attachment.entity';
import { MailRecipient, RecipientType } from '../database/entities/mail-recipient.entity';
import { MailFolder, UserMail, User } from '../database/entities';
import { FolderType, RetryMailResponseDto, BulkRetryResponseDto } from '@lemail/shared-types';
import { MailQueryDto } from './dto/mail-query.dto';
import { SendMailDto } from './dto/send-mail.dto';
import { SaveDraftDto } from './dto/save-draft.dto';
import { WorkerPoolService } from '../worker-pool/worker-pool.service';
import { existsSync, unlinkSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { randomUUID } from 'crypto';
import * as nodemailer from 'nodemailer';
import * as libmime from 'libmime';
import { SettingsService } from '../settings/settings.service';
import { OutboundRateLimitService } from '../spam/outbound-rate-limit.service';
import { DkimSignService, DkimNodemailerConfig } from '../spam/dkim-sign.service';
import { AccountDefenseService } from '../spam/account-defense.service';
import { SecureMailService } from './services/secure-mail.service';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    @InjectRepository(MailMessage)
    private readonly messageRepo: Repository<MailMessage>,
    @InjectRepository(MailAttachment)
    private readonly attachmentRepo: Repository<MailAttachment>,
    @InjectRepository(MailRecipient)
    private readonly recipientRepo: Repository<MailRecipient>,
    @InjectRepository(MailFolder)
    private readonly folderRepo: Repository<MailFolder>,
    @InjectRepository(UserMail)
    private readonly userMailRepo: Repository<UserMail>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly workerPool: WorkerPoolService,
    private readonly settingsService: SettingsService,
    @Inject(forwardRef(() => OutboundRateLimitService))
    private readonly rateLimitService: OutboundRateLimitService,
    @Inject(forwardRef(() => DkimSignService))
    private readonly dkimSignService: DkimSignService,
    @Inject(forwardRef(() => AccountDefenseService))
    private readonly accountDefenseService: AccountDefenseService,
    private readonly secureMailService: SecureMailService,
  ) {}

  decodeMimeWords(str: string | null | undefined): string {
    if (!str) return '';
    if (!str.includes('=?')) return str;
    try {
      return libmime.decodeWords(str);
    } catch {
      return str;
    }
  }

  async findAll(query: MailQueryDto, currentUserId?: string) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const queryBuilder = this.messageRepo
      .createQueryBuilder('msg')
      .leftJoinAndSelect('msg.recipients', 'rec')
      .leftJoinAndSelect('msg.attachments', 'att');

    // 특정 폴더 ID 필터링
    if (query.folderId) {
      queryBuilder.innerJoin(
        UserMail,
        'um',
        'um.messageId = msg.id AND um.folderId = :folderId',
        { folderId: query.folderId },
      );
    } else if (query.mailbox) {
      const mb = query.mailbox.toLowerCase().trim();
      if (query.direction === Direction.OUTBOUND) {
        queryBuilder.andWhere('LOWER(msg.sender) LIKE :mailboxLike', {
          mailboxLike: `%${mb}%`,
        });
      } else if (query.direction === Direction.INBOUND) {
        queryBuilder.andWhere('LOWER(rec.address) = :mailbox', {
          mailbox: mb,
        });
      } else {
        queryBuilder.andWhere(
          '(LOWER(rec.address) = :mailbox OR LOWER(msg.sender) LIKE :mailboxLike)',
          {
            mailbox: mb,
            mailboxLike: `%${mb}%`,
          },
        );
      }
    }

    if (query.search) {
      queryBuilder.andWhere(
        '(msg.subject LIKE :search OR msg.sender LIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    if (query.status) {
      queryBuilder.andWhere('msg.status = :status', { status: query.status });
    }

    if (query.direction && !query.folderId) {
      queryBuilder.andWhere('msg.direction = :direction', {
        direction: query.direction,
      });
    }

    queryBuilder.orderBy('msg.createdAt', 'DESC');
    queryBuilder.skip(skip).take(limit);

    const [items, total] = await queryBuilder.getManyAndCount();

    if (query.folderId && items.length > 0) {
      const messageIds = items.map((m) => m.id);
      const userMails = await this.userMailRepo.find({
        where: { folderId: query.folderId, messageId: In(messageIds) },
      });
      const umMap = new Map(userMails.map((um) => [um.messageId, um]));
      const enrichedItems = items.map((m) => {
        const um = umMap.get(m.id);
        return {
          ...m,
          subject: this.decodeMimeWords(m.subject),
          uid: um?.uid,
          isRead: um?.isRead ?? false,
          isStarred: um?.isStarred ?? false,
          isDeleted: um?.isDeleted ?? false,
          isAnswered: um?.isAnswered ?? false,
          isDraft: um?.isDraft ?? false,
        };
      });
      return {
        items: enrichedItems,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    }

    const decodedItems = items.map((m) => ({
      ...m,
      subject: this.decodeMimeWords(m.subject),
    }));

    return {
      items: decodedItems,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async moveMail(userId: string, messageId: string, targetFolderId: string) {
    const targetFolder = await this.folderRepo.findOne({
      where: { id: targetFolderId, userId },
    });
    if (!targetFolder) {
      throw new NotFoundException('대상 편지함을 찾을 수 없습니다.');
    }

    const userMails = await this.userMailRepo.find({
      where: { userId, messageId },
    });

    const nextUid = targetFolder.uidnext || 1;
    targetFolder.uidnext = nextUid + 1;
    await this.folderRepo.save(targetFolder);

    if (userMails.length === 0) {
      // 기존 매핑이 없으면 새로 생성
      const userMail = this.userMailRepo.create({
        userId,
        messageId,
        folderId: targetFolder.id,
        uid: nextUid,
        isRead: false,
        isStarred: false,
        isDeleted: false,
        isAnswered: false,
        isDraft: false,
      });
      const saved = await this.userMailRepo.save(userMail);
      this.logger.log(
        `Created and moved mail ${messageId} to folder [${targetFolder.name}] (${targetFolder.id}, UID: ${nextUid}) for user ${userId}`,
      );
      return saved;
    } else {
      for (const um of userMails) {
        um.folderId = targetFolder.id;
        um.uid = nextUid;
      }
      const saved = await this.userMailRepo.save(userMails);
      this.logger.log(
        `Moved mail ${messageId} to folder [${targetFolder.name}] (${targetFolder.id}, UID: ${nextUid}) for user ${userId}`,
      );
      return saved[0];
    }
  }

  async bulkMove(
    userId: string,
    messageIds: string[],
    targetFolderId: string,
  ) {
    const results: any[] = [];
    for (const messageId of messageIds) {
      const res = await this.moveMail(userId, messageId, targetFolderId);
      results.push(res);
    }
    return { success: true, count: results.length, details: results };
  }

  async markRead(
    userId: string,
    messageId: string,
    isRead: boolean,
    folderId?: string,
  ) {
    const whereClause: any = { userId, messageId };
    if (folderId) {
      whereClause.folderId = folderId;
    }

    const userMails = await this.userMailRepo.find({
      where: whereClause,
    });

    if (userMails.length === 0) {
      // 받은편지함 찾기
      const inbox = await this.folderRepo.findOne({
        where: { userId, type: FolderType.INBOX },
      });
      const nextUid = inbox ? (inbox.uidnext || 1) : 1;
      if (inbox) {
        inbox.uidnext = nextUid + 1;
        await this.folderRepo.save(inbox);
      }
      const newMail = this.userMailRepo.create({
        userId,
        messageId,
        folderId: folderId || (inbox ? inbox.id : ''),
        uid: nextUid,
        isRead,
        isStarred: false,
        isDeleted: false,
        isAnswered: false,
        isDraft: false,
      });
      return this.userMailRepo.save(newMail);
    } else {
      for (const um of userMails) {
        um.isRead = isRead;
      }
      await this.userMailRepo.save(userMails);
      return userMails[0];
    }
  }

  async moveToTrashOrDelete(userId: string, messageId: string, folderId?: string) {
    return this.deleteUserMail(userId, messageId, folderId);
  }

  /**
   * 사용자 메일 삭제 처리:
   * 1. 일반 메일함에 있는 경우 -> 휴지통(TRASH)으로 이동 (본인만 이동)
   * 2. 이미 휴지통에 있거나 permanent=true인 경우 -> 본인의 user_mail 레코드 완전 삭제
   * 3. 삭제 시 다른 사용자의 참조(user_mail)가 아직 남아있으면 파일 및 메일 유지
   * 4. 마지막 참조자가 삭제 시 실제 원본 EML 및 첨부파일 디렉토리 완전 삭제(Purge)
   */
  async deleteUserMail(
    userId: string,
    messageId: string,
    folderId?: string,
    permanent: boolean = false,
  ) {
    // 1. 해당 사용자의 휴지통 폴더 확보 (없으면 자동 생성)
    let trashFolder = await this.folderRepo.findOne({
      where: { userId, type: FolderType.TRASH },
    });
    if (!trashFolder) {
      trashFolder = await this.folderRepo.save(
        this.folderRepo.create({
          id: randomUUID(),
          userId,
          name: '휴지통',
          type: FolderType.TRASH,
          isSystem: true,
          sortOrder: 5,
        }),
      );
    }

    // 2. 사용자의 해당 메일 매핑(user_mail) 조회
    const whereClause: any = { userId, messageId };
    if (folderId) {
      whereClause.folderId = folderId;
    }
    const userMails = await this.userMailRepo.find({
      where: whereClause,
    });

    if (!userMails || userMails.length === 0) {
      const message = await this.messageRepo.findOne({ where: { id: messageId } });
      if (!message) {
        throw new NotFoundException(`메일(ID: ${messageId})을 찾을 수 없습니다.`);
      }
      // 사용자의 매핑이 없으나 메일이 남아있는 경우, 다른 사용자의 참조가 없으면 정리
      const remaining = await this.userMailRepo.count({ where: { messageId } });
      if (remaining === 0) {
        await this.purgeMail(messageId);
      }
      return { success: true, action: 'not_in_user_mailbox' };
    }

    // 3. 현재 메일이 휴지통에 있는지 확인
    const allInTrash = userMails.every((um) => um.folderId === trashFolder.id);

    // [완전삭제가 아니며, 휴지통이 아닐 때] -> 휴지통으로 이동
    if (!permanent && !allInTrash) {
      for (const um of userMails) {
        um.folderId = trashFolder.id;
      }
      await this.userMailRepo.save(userMails);
      this.logger.log(
        `[Delete] Moved mail ${messageId} to trash for user ${userId}`,
      );
      return { success: true, action: 'moved_to_trash' };
    }

    // [완전삭제이거나 이미 휴지통에 있는 경우]: 본인 사서함(user_mail)에서만 완전 삭제
    const idsToDelete = userMails.map((um) => um.id);
    await this.userMailRepo.delete({ id: In(idsToDelete) });
    this.logger.log(
      `[Delete] Permanently removed user_mail for user ${userId}, mail ${messageId} (permanent=${permanent})`,
    );

    // [요구사항 3] 다른 사용자가 아직 참조하고 있는지 확인
    const remainingReferences = await this.userMailRepo.count({
      where: { messageId },
    });

    if (remainingReferences > 0) {
      this.logger.log(
        `[Delete] Mail ${messageId} still referenced by ${remainingReferences} other user(s). Retaining files and MailMessage.`,
      );
      return {
        success: true,
        action: 'permanently_deleted_for_user',
        remainingReferences,
      };
    }

    // [요구사항 4] 마지막 참조자가 삭제 시: 실제 물리 파일 및 MailMessage 삭제
    this.logger.log(
      `[Delete] Mail ${messageId} has 0 remaining references. Purging raw files, attachments, and MailMessage entity.`,
    );
    await this.purgeMail(messageId);

    return {
      success: true,
      action: 'purged_completely',
      remainingReferences: 0,
    };
  }

  async bulkDelete(
    userId: string,
    messageIds: string[],
    folderId?: string,
    permanent: boolean = false,
  ) {
    const results: any[] = [];
    for (const messageId of messageIds) {
      const res = await this.deleteUserMail(userId, messageId, folderId, permanent);
      results.push(res);
    }
    return { success: true, count: results.length, details: results };
  }

  async findOne(id: string, userId?: string, folderId?: string) {
    const message = await this.messageRepo.findOne({
      where: { id },
      relations: { recipients: true, attachments: true },
    });

    if (!message) {
      throw new NotFoundException(`Mail message with ID ${id} not found`);
    }

    let isRead = false;
    let isStarred = false;
    let currentFolderId: string | undefined = undefined;

    // 로그인한 사용자의 사서함 메일인 경우 조회 시 자동으로 읽음(isRead = true) 처리
    if (userId) {
      const whereClause: any = { userId, messageId: id };
      if (folderId) {
        whereClause.folderId = folderId;
      }

      const userMails = await this.userMailRepo.find({
        where: whereClause,
      });

      if (userMails.length > 0) {
        currentFolderId = userMails[0].folderId;
        let changed = false;
        for (const um of userMails) {
          if (!um.isRead) {
            um.isRead = true;
            changed = true;
          }
        }
        if (changed) {
          await this.userMailRepo.save(userMails);
        }
        isRead = true;
        isStarred = userMails.some((um) => um.isStarred);
      }
    }

    let parsedContent: { text: string | null; html: string | null } = {
      text: null,
      html: null,
    };

    // 원본 EML 파일이 스풀 또는 아카이브에 존재할 경우 본문 HTML/Text 로드
    if (message.rawFilePath && existsSync(message.rawFilePath)) {
      try {
        const parsed = await this.workerPool.parseMail(message.rawFilePath);
        parsedContent = {
          text: parsed.text,
          html: parsed.html,
        };
        if (parsed.subject) {
          message.subject = parsed.subject;
        }
      } catch (err) {
        this.logger.warn(`Failed to parse body for mail ${id}: ${err.message}`);
      }
    }

    return {
      ...message,
      subject: this.decodeMimeWords(message.subject),
      isRead,
      isStarred,
      folderId: currentFolderId,
      body: parsedContent,
    };
  }

  async getRawFilePath(id: string): Promise<string> {
    const message = await this.messageRepo.findOne({ where: { id } });
    if (!message || !message.rawFilePath || !existsSync(message.rawFilePath)) {
      throw new NotFoundException(`Raw EML file not found for message ${id}`);
    }
    return message.rawFilePath;
  }

  async getAttachment(
    messageId: string,
    attachmentId: string,
  ): Promise<{ path: string; filename: string; contentType: string }> {
    const attachment = await this.attachmentRepo.findOne({
      where: { id: attachmentId, messageId },
    });

    if (!attachment || !existsSync(attachment.storagePath)) {
      throw new NotFoundException(`Attachment ${attachmentId} not found on disk`);
    }

    return {
      path: attachment.storagePath,
      filename: attachment.filename,
      contentType: attachment.contentType,
    };
  }

  async purgeMail(id: string): Promise<{ success: boolean }> {
    const message = await this.messageRepo.findOne({
      where: { id },
      relations: { attachments: true },
    });

    if (!message) {
      return { success: true };
    }

    // 1. 원본 EML 파일 정리
    if (message.rawFilePath && existsSync(message.rawFilePath)) {
      try {
        unlinkSync(message.rawFilePath);
        this.logger.log(`[Purge] Removed raw EML file: ${message.rawFilePath}`);
      } catch (err: any) {
        this.logger.warn(`Failed to delete raw file: ${err.message}`);
      }
    }

    // 2. 첨부파일 디렉토리 정리 (년/월/일 구조 및 기존 구조 모두 지원)
    if (message.attachments && message.attachments.length > 0) {
      for (const att of message.attachments) {
        if (att.storagePath && existsSync(att.storagePath)) {
          try {
            unlinkSync(att.storagePath);
          } catch (err: any) {
            this.logger.warn(`Failed to delete attachment file: ${err.message}`);
          }
        }
      }
      const samplePath = message.attachments[0]?.storagePath;
      if (samplePath) {
        const attFolder = dirname(samplePath);
        if (existsSync(attFolder)) {
          try {
            rmSync(attFolder, { recursive: true, force: true });
            this.logger.log(`[Purge] Removed attachment folder: ${attFolder}`);
          } catch (err: any) {
            this.logger.warn(`Failed to delete attachment folder: ${err.message}`);
          }
        }
      }
    }

    const legacyAttDir = join(process.cwd(), 'mail-attachments', id);
    if (existsSync(legacyAttDir)) {
      try {
        rmSync(legacyAttDir, { recursive: true, force: true });
      } catch (err: any) {
        this.logger.warn(`Failed to delete legacy attachment directory: ${err.message}`);
      }
    }

    await this.messageRepo.delete(id);
    this.logger.log(`[Purge] Completely deleted MailMessage entity: ${id}`);
    return { success: true };
  }

  async delete(id: string): Promise<{ success: boolean }> {
    return this.purgeMail(id);
  }

  async sendMail(user: User, dto: SendMailDto) {
    if (!dto.to || dto.to.length === 0) {
      throw new BadRequestException('받는 사람 이메일 주소를 1개 이상 입력해 주세요.');
    }

    // 0-1. 비정상 대량 발송/탈취 계정 자동 잠금(Account Defense) 확인
    const lockStatus = await this.accountDefenseService.isAccountLocked(user.id);
    if (lockStatus.locked) {
      throw new ForbiddenException(
        `비정상 대량 발송 또는 어뷰징 징후가 감지되어 계정이 임시 보호 잠금되었습니다. 사유: ${lockStatus.reason || '보안 위반'} (시스템 관리자에게 문의하세요)`,
      );
    }

    // 0-2. 계정별 아웃바운드 발송 Rate Limiting (분당 30통 / 일일 500통 한도 초과 차단)
    const totalRecipients =
      (dto.to?.length || 0) + (dto.cc?.length || 0) + (dto.bcc?.length || 0);
    try {
      await this.rateLimitService.checkAndIncrement(user.id, totalRecipients);
    } catch (err: any) {
      await this.accountDefenseService.recordViolation(
        user.id,
        `Outbound rate limit exceeded: ${err.message}`,
      );
      throw err;
    }

    const mailId = randomUUID();
    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const archiveBaseDir = resolve(
      process.cwd(),
      process.env.MAIL_ARCHIVE_DIR || 'mail-archive',
    );
    const archiveDir = join(archiveBaseDir, year, month, day);
    if (!existsSync(archiveDir)) {
      mkdirSync(archiveDir, { recursive: true });
    }
    const emlPath = join(archiveDir, `${mailId}.eml`);

    // Nodemailer 스트림 트랜스포터로 RFC822 EML 생성
    const transporter = nodemailer.createTransport({
      streamTransport: true,
      buffer: true,
      newline: 'windows',
    });

    const mailOptions: nodemailer.SendMailOptions = {
      from: `"${user.name}" <${user.email}>`,
      to: dto.to,
      cc: dto.cc && dto.cc.length > 0 ? dto.cc : undefined,
      bcc: dto.bcc && dto.bcc.length > 0 ? dto.bcc : undefined,
      subject: dto.subject || '(제목 없음)',
      text: dto.bodyText || '',
      html: dto.bodyHtml || dto.bodyText || '',
    };

    // 발신 도메인 DKIM 서명 설정 조회 및 적용 (암호학적 서명 헤더 생성)
    const senderDomain = user.email.includes('@')
      ? user.email.split('@')[1].toLowerCase().trim()
      : '';
    const dkimConfig = await this.dkimSignService.getDkimConfigForDomain(senderDomain);
    if (dkimConfig) {
      mailOptions.dkim = dkimConfig;
    }

    // 보안 메일(비밀번호 설정 및 PDF/ZIP 암호화) 발송 여부 판단
    const isSecureMail = Boolean(
      dto.isSecure && dto.securityPassword && dto.securityPassword.trim().length >= 4,
    );
    const securityPassword = isSecureMail ? dto.securityPassword!.trim() : null;

    const attBaseDir = resolve(
      process.cwd(),
      process.env.MAIL_ATTACHMENT_DIR || 'mail-attachments',
    );
    const attDir = join(attBaseDir, year, month, day, mailId);
    if (!existsSync(attDir)) {
      mkdirSync(attDir, { recursive: true });
    }

    const attEntities: MailAttachment[] = [];
    const nodemailerAtts: any[] = [];

    if (isSecureMail && securityPassword) {
      this.logger.log(`[SecureMail] Processing secure encrypted mail for ${mailId} by ${user.email}`);

      const sanitizedSubject = (dto.subject || '본문문서')
        .replace(/[/\\?%*:|"<>]/g, '_')
        .trim()
        .slice(0, 50);
      const pdfFilename = `[보안메일]_${sanitizedSubject || '본문문서'}.pdf`;
      const zipFilename = `[보안메일]_첨부파일.zip`;
      const hasOriginalAttachments = Boolean(dto.attachments && dto.attachments.length > 0);

      // 1. 본문 암호화 PDF 생성 (비밀번호 설정)
      const encryptedPdfBuf = await this.secureMailService.generateEncryptedPdf({
        subject: dto.subject || '(제목 없음)',
        sender: user.email,
        senderName: user.name,
        recipients: dto.to,
        cc: dto.cc,
        bodyHtml: dto.bodyHtml || '',
        bodyText: dto.bodyText || '',
        date: now,
        password: securityPassword,
      });

      const pdfFilePath = join(attDir, pdfFilename);
      writeFileSync(pdfFilePath, encryptedPdfBuf);

      nodemailerAtts.push({
        filename: pdfFilename,
        contentType: 'application/pdf',
        content: encryptedPdfBuf,
      });

      attEntities.push(
        this.attachmentRepo.create({
          id: randomUUID(),
          messageId: mailId,
          filename: pdfFilename,
          contentType: 'application/pdf',
          sizeBytes: String(encryptedPdfBuf.length),
          storagePath: pdfFilePath,
        }),
      );

      // 2. 기존 첨부파일이 존재하는 경우: 안 A에 따라 동일 비밀번호 암호화 ZIP 생성
      if (hasOriginalAttachments && dto.attachments) {
        const originalFiles: Array<{ filename: string; buffer: Buffer }> = [];
        for (const att of dto.attachments) {
          if (att.contentBase64) {
            originalFiles.push({
              filename: att.filename,
              buffer: Buffer.from(att.contentBase64, 'base64'),
            });
          }
        }

        if (originalFiles.length > 0) {
          const encryptedZipBuf = await this.secureMailService.generateEncryptedZip({
            files: originalFiles,
            password: securityPassword,
          });

          const zipFilePath = join(attDir, zipFilename);
          writeFileSync(zipFilePath, encryptedZipBuf);

          nodemailerAtts.push({
            filename: zipFilename,
            contentType: 'application/zip',
            content: encryptedZipBuf,
          });

          attEntities.push(
            this.attachmentRepo.create({
              id: randomUUID(),
              messageId: mailId,
              filename: zipFilename,
              contentType: 'application/zip',
              sizeBytes: String(encryptedZipBuf.length),
              storagePath: zipFilePath,
            }),
          );
        }
      }

      // 3. 보안 메일 안내 본문(이미지 및 열람 안내 포함)으로 메일 내용 대체
      const secureNotice = this.secureMailService.generateSecureMailNotificationHtml({
        subject: dto.subject || '(제목 없음)',
        sender: user.email,
        senderName: user.name,
        recipients: dto.to,
        date: now,
        hasAttachments: hasOriginalAttachments,
        pdfFilename,
        zipFilename: hasOriginalAttachments ? zipFilename : undefined,
      });

      const secureSubject = dto.subject?.startsWith('[보안메일]')
        ? dto.subject
        : `[보안메일] ${dto.subject || '(제목 없음)'}`;

      dto.subject = secureSubject;
      mailOptions.subject = secureSubject;
      mailOptions.html = secureNotice.html;
      mailOptions.text = secureNotice.text;

      // 보안 뱃지 인라인 이미지 (Outlook 호환 CID 첨부)
      nodemailerAtts.push(secureNotice.inlineAttachment);
      mailOptions.attachments = nodemailerAtts;
    } else {
      // 일반 메일 첨부파일 처리
      if (dto.attachments && dto.attachments.length > 0) {
        for (const att of dto.attachments) {
          const attId = att.id || randomUUID();
          const filePath = join(attDir, att.filename);

          if (att.contentBase64) {
            const fileBuf = Buffer.from(att.contentBase64, 'base64');
            writeFileSync(filePath, fileBuf);
            nodemailerAtts.push({
              filename: att.filename,
              contentType: att.contentType,
              content: fileBuf,
            });
          }

          const entity = this.attachmentRepo.create({
            id: attId,
            messageId: mailId,
            filename: att.filename,
            contentType: att.contentType,
            sizeBytes: String(att.sizeBytes || 0),
            storagePath: filePath,
          });
          attEntities.push(entity);
        }
        mailOptions.attachments = nodemailerAtts;
      }
    }

    // EML 파일 생성 및 저장
    const info = await transporter.sendMail(mailOptions);
    const emlBuffer = info.message as Buffer;
    writeFileSync(emlPath, emlBuffer);

    // 1. MailMessage 생성
    const message = this.messageRepo.create({
      id: mailId,
      direction: Direction.OUTBOUND,
      messageId: info.messageId || `<${mailId}@lemail.local>`,
      sender: user.email,
      subject: dto.subject || '(제목 없음)',
      rawFilePath: emlPath,
      spfResult: SpfResult.PASS,
      dkimResult: DkimResult.PASS,
      dmarcResult: DmarcResult.PASS,
      status: MailStatus.PROCESSED,
    });
    await this.messageRepo.save(message);

    // 2. MailRecipient 생성
    const recipients: MailRecipient[] = [];
    for (const addr of dto.to) {
      recipients.push(
        this.recipientRepo.create({
          messageId: mailId,
          type: RecipientType.TO,
          address: addr.trim(),
        }),
      );
    }
    if (dto.cc) {
      for (const addr of dto.cc) {
        recipients.push(
          this.recipientRepo.create({
            messageId: mailId,
            type: RecipientType.CC,
            address: addr.trim(),
          }),
        );
      }
    }
    if (dto.bcc) {
      for (const addr of dto.bcc) {
        recipients.push(
          this.recipientRepo.create({
            messageId: mailId,
            type: RecipientType.BCC,
            address: addr.trim(),
          }),
        );
      }
    }
    await this.recipientRepo.save(recipients);

    // 3. 첨부파일 DB 저장
    if (attEntities.length > 0) {
      await this.attachmentRepo.save(attEntities);
    }

    // 4. 발신자 SENT(보낸편지함) 매핑
    let sentFolder = await this.folderRepo.findOne({
      where: { userId: user.id, type: FolderType.SENT },
    });
    if (!sentFolder) {
      sentFolder = await this.folderRepo.save(
        this.folderRepo.create({
          id: randomUUID(),
          userId: user.id,
          name: '보낸편지함',
          type: FolderType.SENT,
          isSystem: true,
          sortOrder: 2,
        }),
      );
    }
    const sentUid = sentFolder.uidnext || 1;
    sentFolder.uidnext = sentUid + 1;
    await this.folderRepo.save(sentFolder);

    await this.userMailRepo.save(
      this.userMailRepo.create({
        userId: user.id,
        messageId: mailId,
        folderId: sentFolder.id,
        uid: sentUid,
        isRead: true,
        isStarred: false,
        isDeleted: false,
        isAnswered: false,
        isDraft: false,
      }),
    );

    // 5. 로컬 수신자 계정이 존재하면 받은편지함(INBOX) 자동 전달
    const allAddrs = [...dto.to, ...(dto.cc || []), ...(dto.bcc || [])].map((a) =>
      a.trim().toLowerCase(),
    );
    const uniqueAddrs = Array.from(new Set(allAddrs));
    let localUsers: User[] = [];
    if (uniqueAddrs.length > 0) {
      localUsers = await this.userRepo.find({
        where: { email: In(uniqueAddrs) },
      });
      for (const targetUser of localUsers) {
        let inbox = await this.folderRepo.findOne({
          where: { userId: targetUser.id, type: FolderType.INBOX },
        });
        if (!inbox) {
          inbox = await this.folderRepo.save(
            this.folderRepo.create({
              id: randomUUID(),
              userId: targetUser.id,
              name: '받은편지함',
              type: FolderType.INBOX,
              isSystem: true,
              sortOrder: 1,
            }),
          );
        }
        const inboxUid = inbox.uidnext || 1;
        inbox.uidnext = inboxUid + 1;
        await this.folderRepo.save(inbox);

        await this.userMailRepo.save(
          this.userMailRepo.create({
            userId: targetUser.id,
            messageId: mailId,
            folderId: inbox.id,
            uid: inboxUid,
            isRead: false,
            isStarred: false,
            isDeleted: false,
            isAnswered: false,
            isDraft: false,
          }),
        );
      }
    }

    // 6. 외부 수신자가 포함되어 있는 경우: SMTP 릴레이 또는 Haraka Outbound 처리
    const localEmails = new Set(localUsers.map((u) => u.email.toLowerCase()));
    const externalTo = dto.to.filter((addr) => !localEmails.has(addr.trim().toLowerCase()));
    const externalCc = (dto.cc || []).filter(
      (addr) => !localEmails.has(addr.trim().toLowerCase()),
    );
    const externalBcc = (dto.bcc || []).filter(
      (addr) => !localEmails.has(addr.trim().toLowerCase()),
    );

    const hasExternalRecipients =
      externalTo.length > 0 || externalCc.length > 0 || externalBcc.length > 0;

    if (hasExternalRecipients) {
      const delivery = await this.deliverOutbound({
        mailId,
        sender: user.email,
        senderName: user.name,
        externalTo,
        externalCc,
        externalBcc,
        subject: dto.subject,
        bodyText: dto.bodyText,
        bodyHtml: dto.bodyHtml,
        attachments: mailOptions.attachments,
        rawFilePath: emlPath,
        dkimConfig,
      });

      if (!delivery.success) {
        message.status = MailStatus.FAILED;
        message.failureReason = delivery.error || '외부 발송 실패';
        await this.messageRepo.save(message);

        this.logger.warn(
          `Mail outbound delivery failed: ${mailId} (${delivery.error})`,
        );
        return {
          success: false,
          mailId,
          messageId: message.messageId,
          failureReason: delivery.error,
        };
      }
    }

    message.status = MailStatus.PROCESSED;
    message.failureReason = null;
    await this.messageRepo.save(message);

    this.logger.log(`Mail sent successfully: ${mailId} by ${user.email}`);
    return {
      success: true,
      mailId,
      messageId: message.messageId,
    };
  }

  /**
   * 외부 SMTP 릴레이 또는 Haraka MTA를 통한 공통 발송 처리기
   */
  private async deliverOutbound(params: {
    mailId: string;
    sender: string;
    senderName?: string;
    externalTo: string[];
    externalCc?: string[];
    externalBcc?: string[];
    subject?: string;
    bodyText?: string;
    bodyHtml?: string;
    attachments?: any[];
    rawFilePath?: string;
    dkimConfig?: DkimNodemailerConfig | null;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const {
      mailId,
      sender,
      senderName,
      externalTo,
      externalCc = [],
      externalBcc = [],
      subject,
      bodyText,
      bodyHtml,
      attachments,
      rawFilePath,
      dkimConfig,
    } = params;

    const allExternal = Array.from(
      new Set([...externalTo, ...externalCc, ...externalBcc]),
    );
    if (allExternal.length === 0) {
      return { success: true };
    }

    const relayConfig = await this.settingsService.getRelayConfig();
    const relayEnabled = relayConfig.relayEnabled;

    // 원본 EML 파일이 존재하면 무결성 유지를 위해 raw 스트림/파일 전송 우선 활용
    let mailOptions: nodemailer.SendMailOptions;
    if (rawFilePath && existsSync(rawFilePath)) {
      mailOptions = {
        envelope: {
          from: sender,
          to: allExternal,
        },
        raw: { path: rawFilePath },
      };
    } else {
      mailOptions = {
        from: senderName ? `"${senderName}" <${sender}>` : sender,
        to: externalTo.length > 0 ? externalTo : undefined,
        cc: externalCc.length > 0 ? externalCc : undefined,
        bcc: externalBcc.length > 0 ? externalBcc : undefined,
        subject: subject || '(제목 없음)',
        text: bodyText || '',
        html: bodyHtml || bodyText || '',
        attachments,
        dkim: dkimConfig || undefined,
      };
    }

    if (relayEnabled && relayConfig.relayHost) {
      // [방식 1] 외부 SMTP 릴레이 (Gmail SMTP, 사내/외부 SMTP 등)
      try {
        const relayHost = relayConfig.relayHost;
        const relayPort = relayConfig.relayPort;
        const relaySecure = relayConfig.relaySecure;
        const relayUser = relayConfig.relayUser;
        const relayPass = relayConfig.relayPass;
        // 사설/자체서명 SSL 인증서 허용 지원 (기본값 false로 유연하게 처리)
        const rejectUnauthorized = relayConfig.relayRejectUnauthorized;

        this.logger.log(
          `Relaying external mail ${mailId} via configured SMTP Relay (${relayHost}:${relayPort})...`,
        );

        const transportOptions: any = {
          host: relayHost,
          port: relayPort,
          secure: relaySecure,
          connectionTimeout: 15000,
          tls: {
            rejectUnauthorized,
          },
        };

        if (relayUser && relayPass) {
          transportOptions.auth = {
            user: relayUser,
            pass: relayPass,
          };
        }

        // 릴레이 발송 시 봉투 발신자(envelope.from)를 인증 계정으로 보정하여
        // 상위 메일 서버의 발신자 위조 거부(553 Sender address rejected) 방지
        const effectiveEnvelopeFrom = relayUser || sender;

        let relayMailOptions: nodemailer.SendMailOptions;
        if (rawFilePath && existsSync(rawFilePath)) {
          relayMailOptions = {
            envelope: {
              from: effectiveEnvelopeFrom,
              to: allExternal,
            },
            raw: { path: rawFilePath },
          };
        } else {
          relayMailOptions = {
            from: relayUser
              ? `"${senderName || sender}" <${relayUser}>`
              : (senderName ? `"${senderName}" <${sender}>` : sender),
            envelope: {
              from: effectiveEnvelopeFrom,
              to: allExternal,
            },
            to: externalTo.length > 0 ? externalTo : undefined,
            cc: externalCc.length > 0 ? externalCc : undefined,
            bcc: externalBcc.length > 0 ? externalBcc : undefined,
            subject: subject || '(제목 없음)',
            text: bodyText || '',
            html: bodyHtml || bodyText || '',
            attachments,
          };
        }

        const relayTransport = nodemailer.createTransport(transportOptions);
        const relayResult = await relayTransport.sendMail(relayMailOptions);
        this.logger.log(
          `Successfully sent mail ${mailId} via SMTP Relay (${relayHost}). MessageId: ${relayResult.messageId}`,
        );
        return { success: true, messageId: relayResult.messageId };
      } catch (err: any) {
        this.logger.error(
          `Failed to send mail ${mailId} via SMTP Relay: ${err.message}`,
        );
        return { success: false, error: `SMTP Relay 오류: ${err.message}` };
      }
    } else if (relayConfig.harakaEnabled) {
      // [방식 2] Haraka Direct MX Outbound 발송
      try {
        const harakaHost = relayConfig.harakaHost;
        const harakaPort = relayConfig.harakaPort;

        this.logger.log(
          `Relaying external mail ${mailId} to Haraka Outbound MTA (${harakaHost}:${harakaPort})...`,
        );

        const harakaTransport = nodemailer.createTransport({
          host: harakaHost,
          port: harakaPort,
          secure: false,
          ignoreTLS: true,
          connectionTimeout: 10000,
        });

        const harakaResult = await harakaTransport.sendMail(mailOptions);
        this.logger.log(
          `Successfully submitted mail ${mailId} to Haraka for Direct MX delivery. MessageId: ${harakaResult.messageId}`,
        );
        return { success: true, messageId: harakaResult.messageId };
      } catch (err: any) {
        this.logger.warn(
          `Failed to submit mail ${mailId} to Haraka Outbound MTA: ${err.message}`,
        );
        return { success: false, error: `Haraka MTA 오류: ${err.message}` };
      }
    } else {
      return { success: true };
    }
  }

  /**
   * 발송 실패 메일 단건 재발송 (관리자 및 권한 보유자)
   */
  async retrySendMail(id: string, currentUser?: User): Promise<RetryMailResponseDto> {
    const message = await this.messageRepo.findOne({
      where: { id },
      relations: { recipients: true, attachments: true },
    });

    if (!message) {
      throw new NotFoundException(`메일(ID: ${id})을 찾을 수 없습니다.`);
    }

    if (message.direction !== Direction.OUTBOUND) {
      throw new BadRequestException('발송(OUTBOUND) 메일만 재발송할 수 있습니다.');
    }

    // 로컬 계정 제외 외부 수신자 확인
    const toAddrs = (message.recipients || [])
      .filter((r) => r.type === RecipientType.TO)
      .map((r) => r.address);
    const ccAddrs = (message.recipients || [])
      .filter((r) => r.type === RecipientType.CC)
      .map((r) => r.address);
    const bccAddrs = (message.recipients || [])
      .filter((r) => r.type === RecipientType.BCC)
      .map((r) => r.address);

    const allAddrs = [...toAddrs, ...ccAddrs, ...bccAddrs].map((a) =>
      a.toLowerCase().trim(),
    );
    let localEmails = new Set<string>();
    if (allAddrs.length > 0) {
      const localUsers = await this.userRepo.find({
        where: { email: In(Array.from(new Set(allAddrs))) },
      });
      localEmails = new Set(localUsers.map((u) => u.email.toLowerCase()));
    }

    const externalTo = toAddrs.filter((a) => !localEmails.has(a.toLowerCase().trim()));
    const externalCc = ccAddrs.filter((a) => !localEmails.has(a.toLowerCase().trim()));
    const externalBcc = bccAddrs.filter((a) => !localEmails.has(a.toLowerCase().trim()));

    const delivery = await this.deliverOutbound({
      mailId: message.id,
      sender: message.sender,
      externalTo,
      externalCc,
      externalBcc,
      subject: message.subject || '',
      rawFilePath: message.rawFilePath,
    });

    if (!delivery.success) {
      message.status = MailStatus.FAILED;
      message.failureReason = delivery.error || '재발송 실패';
      await this.messageRepo.save(message);

      return {
        success: false,
        mailId: message.id,
        messageId: message.messageId,
        status: MailStatus.FAILED,
        failureReason: delivery.error,
      };
    }

    message.status = MailStatus.PROCESSED;
    message.failureReason = null;
    await this.messageRepo.save(message);

    this.logger.log(`Mail ${message.id} retried successfully.`);
    return {
      success: true,
      mailId: message.id,
      messageId: message.messageId,
      status: MailStatus.PROCESSED,
      failureReason: null,
    };
  }

  /**
   * 발송 실패 메일 일괄 재발송
   */
  async bulkRetrySendMail(
    ids: string[],
    currentUser?: User,
  ): Promise<BulkRetryResponseDto> {
    const results: { mailId: string; success: boolean; failureReason?: string | null }[] = [];
    let succeeded = 0;
    let failed = 0;

    for (const id of ids) {
      try {
        const res = await this.retrySendMail(id, currentUser);
        if (res.success) {
          succeeded++;
          results.push({ mailId: id, success: true });
        } else {
          failed++;
          results.push({ mailId: id, success: false, failureReason: res.failureReason });
        }
      } catch (err: any) {
        failed++;
        results.push({ mailId: id, success: false, failureReason: err.message });
      }
    }

    return {
      total: ids.length,
      succeeded,
      failed,
      results,
    };
  }

  async saveDraft(user: User, dto: SaveDraftDto) {
    const mailId = dto.draftId || randomUUID();
    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const archiveBaseDir = resolve(
      process.cwd(),
      process.env.MAIL_ARCHIVE_DIR || 'mail-archive',
    );
    const archiveDir = join(archiveBaseDir, year, month, day);
    if (!existsSync(archiveDir)) {
      mkdirSync(archiveDir, { recursive: true });
    }
    const emlPath = join(archiveDir, `${mailId}.eml`);

    const transporter = nodemailer.createTransport({
      streamTransport: true,
      buffer: true,
      newline: 'windows',
    });

    const mailOptions: nodemailer.SendMailOptions = {
      from: `"${user.name}" <${user.email}>`,
      to: dto.to && dto.to.length > 0 ? dto.to : [user.email],
      cc: dto.cc && dto.cc.length > 0 ? dto.cc : undefined,
      bcc: dto.bcc && dto.bcc.length > 0 ? dto.bcc : undefined,
      subject: dto.subject || '(임시저장 메일)',
      text: dto.bodyText || '',
      html: dto.bodyHtml || dto.bodyText || '',
    };

    const info = await transporter.sendMail(mailOptions);
    const emlBuffer = info.message as Buffer;
    writeFileSync(emlPath, emlBuffer);

    // 기존 임시저장 메일 있는지 확인
    let message = await this.messageRepo.findOne({ where: { id: mailId } });
    if (message) {
      message.subject = dto.subject || '(임시저장 메일)';
      message.rawFilePath = emlPath;
      await this.messageRepo.save(message);
    } else {
      message = this.messageRepo.create({
        id: mailId,
        direction: Direction.OUTBOUND,
        messageId: `<draft-${mailId}@lemail.local>`,
        sender: user.email,
        subject: dto.subject || '(임시저장 메일)',
        rawFilePath: emlPath,
        spfResult: SpfResult.NONE,
        dkimResult: DkimResult.NONE,
        dmarcResult: DmarcResult.NONE,
        status: MailStatus.QUEUED,
      });
      await this.messageRepo.save(message);
    }

    // DRAFTS(임시보관함) 폴더 매핑
    let draftsFolder = await this.folderRepo.findOne({
      where: { userId: user.id, type: FolderType.DRAFTS },
    });
    if (!draftsFolder) {
      draftsFolder = await this.folderRepo.save(
        this.folderRepo.create({
          id: randomUUID(),
          userId: user.id,
          name: '임시보관함',
          type: FolderType.DRAFTS,
          isSystem: true,
          sortOrder: 3,
        }),
      );
    }

    let userMail = await this.userMailRepo.findOne({
      where: { userId: user.id, messageId: mailId },
    });
    if (!userMail) {
      const draftUid = draftsFolder.uidnext || 1;
      draftsFolder.uidnext = draftUid + 1;
      await this.folderRepo.save(draftsFolder);

      userMail = this.userMailRepo.create({
        userId: user.id,
        messageId: mailId,
        folderId: draftsFolder.id,
        uid: draftUid,
        isRead: true,
        isStarred: false,
        isDeleted: false,
        isAnswered: false,
        isDraft: true,
      });
      await this.userMailRepo.save(userMail);
    }

    this.logger.log(`Draft saved: ${mailId} for user ${user.email}`);
    return {
      success: true,
      mailId,
      draftId: mailId,
    };
  }
}
