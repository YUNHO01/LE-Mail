import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { MailMessage, Direction, SpfResult, DkimResult, DmarcResult, MailStatus } from '../database/entities/mail-message.entity';
import { MailAttachment } from '../database/entities/mail-attachment.entity';
import { MailRecipient, RecipientType } from '../database/entities/mail-recipient.entity';
import { MailFolder, UserMail, User } from '../database/entities';
import { FolderType } from '@lemail/shared-types';
import { MailQueryDto } from './dto/mail-query.dto';
import { SendMailDto } from './dto/send-mail.dto';
import { SaveDraftDto } from './dto/save-draft.dto';
import { WorkerPoolService } from '../worker-pool/worker-pool.service';
import { existsSync, unlinkSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import * as nodemailer from 'nodemailer';

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
  ) {}

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
      const enrichedItems = items.map((m) => ({
        ...m,
        isRead: umMap.get(m.id)?.isRead ?? false,
        isStarred: umMap.get(m.id)?.isStarred ?? false,
      }));
      return {
        items: enrichedItems,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    }

    return {
      items,
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

    let userMail = await this.userMailRepo.findOne({
      where: { userId, messageId },
    });

    if (!userMail) {
      // 기존 매핑이 없으면 새로 생성
      userMail = this.userMailRepo.create({
        userId,
        messageId,
        folderId: targetFolder.id,
        isRead: false,
        isStarred: false,
      });
    } else {
      userMail.folderId = targetFolder.id;
    }

    const saved = await this.userMailRepo.save(userMail);
    this.logger.log(
      `Moved mail ${messageId} to folder [${targetFolder.name}] (${targetFolder.id}) for user ${userId}`,
    );
    return saved;
  }

  async markRead(userId: string, messageId: string, isRead: boolean) {
    let userMail = await this.userMailRepo.findOne({
      where: { userId, messageId },
    });
    if (!userMail) {
      // 받은편지함 찾기
      const inbox = await this.folderRepo.findOne({
        where: { userId, type: FolderType.INBOX },
      });
      userMail = this.userMailRepo.create({
        userId,
        messageId,
        folderId: inbox ? inbox.id : '',
        isRead,
        isStarred: false,
      });
    } else {
      userMail.isRead = isRead;
    }
    return this.userMailRepo.save(userMail);
  }

  async moveToTrashOrDelete(userId: string, messageId: string) {
    const trashFolder = await this.folderRepo.findOne({
      where: { userId, type: FolderType.TRASH },
    });

    const userMail = await this.userMailRepo.findOne({
      where: { userId, messageId },
    });

    // 이미 휴지통에 있거나 휴지통이 없는 경우 영구 삭제
    if (userMail && trashFolder && userMail.folderId === trashFolder.id) {
      await this.userMailRepo.delete({ id: userMail.id });
      return this.delete(messageId);
    }

    // 휴지통으로 이동
    if (trashFolder) {
      return this.moveMail(userId, messageId, trashFolder.id);
    }

    return this.delete(messageId);
  }

  async findOne(id: string) {
    const message = await this.messageRepo.findOne({
      where: { id },
      relations: { recipients: true, attachments: true },
    });

    if (!message) {
      throw new NotFoundException(`Mail message with ID ${id} not found`);
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
      } catch (err) {
        this.logger.warn(`Failed to parse body for mail ${id}: ${err.message}`);
      }
    }

    return {
      ...message,
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

  async delete(id: string): Promise<{ success: boolean }> {
    const message = await this.messageRepo.findOne({
      where: { id },
      relations: { attachments: true },
    });

    if (!message) {
      throw new NotFoundException(`Mail with ID ${id} not found`);
    }

    // 파일 정리
    if (message.rawFilePath && existsSync(message.rawFilePath)) {
      try {
        unlinkSync(message.rawFilePath);
      } catch (err) {
        this.logger.warn(`Failed to delete raw file: ${err.message}`);
      }
    }

    const attDir = join(process.cwd(), 'mail-attachments', id);
    if (existsSync(attDir)) {
      try {
        rmSync(attDir, { recursive: true, force: true });
      } catch (err) {
        this.logger.warn(`Failed to delete attachment directory: ${err.message}`);
      }
    }

    await this.messageRepo.delete(id);
    this.logger.log(`Deleted mail message: ${id}`);
    return { success: true };
  }

  async sendMail(user: User, dto: SendMailDto) {
    if (!dto.to || dto.to.length === 0) {
      throw new BadRequestException('받는 사람 이메일 주소를 1개 이상 입력해 주세요.');
    }

    const mailId = randomUUID();
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const archiveDir = join(process.cwd(), 'mail-archive', yearMonth);
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

    // 첨부파일 준비
    const attEntities: MailAttachment[] = [];
    if (dto.attachments && dto.attachments.length > 0) {
      const attDir = join(process.cwd(), 'mail-attachments', mailId);
      if (!existsSync(attDir)) {
        mkdirSync(attDir, { recursive: true });
      }

      const nodemailerAtts: any[] = [];
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
    await this.userMailRepo.save(
      this.userMailRepo.create({
        userId: user.id,
        messageId: mailId,
        folderId: sentFolder.id,
        isRead: true,
        isStarred: false,
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
        await this.userMailRepo.save(
          this.userMailRepo.create({
            userId: targetUser.id,
            messageId: mailId,
            folderId: inbox.id,
            isRead: false,
            isStarred: false,
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
      const relayEnabled = process.env.SMTP_RELAY_ENABLED === 'true';

      if (relayEnabled && process.env.SMTP_RELAY_HOST) {
        // [방식 1] 외부 SMTP 릴레이 (Gmail SMTP, AWS SES, 사내 릴레이 등)
        try {
          const relayHost = process.env.SMTP_RELAY_HOST;
          const relayPort = parseInt(process.env.SMTP_RELAY_PORT || '587', 10);
          const relaySecure = process.env.SMTP_RELAY_SECURE === 'true';
          const relayUser = process.env.SMTP_RELAY_USER;
          const relayPass = process.env.SMTP_RELAY_PASS;

          this.logger.log(
            `Relaying external mail ${mailId} via configured SMTP Relay (${relayHost}:${relayPort})...`,
          );

          const transportOptions: any = {
            host: relayHost,
            port: relayPort,
            secure: relaySecure,
            connectionTimeout: 15000,
          };

          if (relayUser && relayPass) {
            transportOptions.auth = {
              user: relayUser,
              pass: relayPass,
            };
          }

          const relayTransport = nodemailer.createTransport(transportOptions);

          const relayMailOptions: nodemailer.SendMailOptions = {
            from: `"${user.name}" <${relayUser || user.email}>`,
            to: externalTo.length > 0 ? externalTo : undefined,
            cc: externalCc.length > 0 ? externalCc : undefined,
            bcc: externalBcc.length > 0 ? externalBcc : undefined,
            subject: dto.subject || '(제목 없음)',
            text: dto.bodyText || '',
            html: dto.bodyHtml || dto.bodyText || '',
            attachments: mailOptions.attachments,
          };

          const relayResult = await relayTransport.sendMail(relayMailOptions);
          this.logger.log(
            `Successfully sent mail ${mailId} via SMTP Relay (${relayHost}). MessageId: ${relayResult.messageId}`,
          );
        } catch (err: any) {
          this.logger.error(
            `Failed to send mail ${mailId} via SMTP Relay: ${err.message}`,
          );
        }
      } else if (process.env.HARAKA_ENABLED !== 'false') {
        // [방식 2] Haraka Direct MX Outbound 발송
        try {
          const harakaHost = process.env.HARAKA_HOST || '127.0.0.1';
          const harakaPort = parseInt(process.env.HARAKA_PORT || '2526', 10);

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

          const harakaMailOptions: nodemailer.SendMailOptions = {
            from: `"${user.name}" <${user.email}>`,
            to: externalTo.length > 0 ? externalTo : undefined,
            cc: externalCc.length > 0 ? externalCc : undefined,
            bcc: externalBcc.length > 0 ? externalBcc : undefined,
            subject: dto.subject || '(제목 없음)',
            text: dto.bodyText || '',
            html: dto.bodyHtml || dto.bodyText || '',
            attachments: mailOptions.attachments,
          };

          await harakaTransport.sendMail(harakaMailOptions);
          this.logger.log(
            `Successfully submitted mail ${mailId} to Haraka for Direct MX delivery.`,
          );
        } catch (err: any) {
          this.logger.warn(
            `Failed to submit mail ${mailId} to Haraka Outbound MTA: ${err.message}`,
          );
        }
      }
    }

    this.logger.log(`Mail sent successfully: ${mailId} by ${user.email}`);
    return {
      success: true,
      mailId,
      messageId: message.messageId,
    };
  }

  async saveDraft(user: User, dto: SaveDraftDto) {
    const mailId = dto.draftId || randomUUID();
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const archiveDir = join(process.cwd(), 'mail-archive', yearMonth);
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
      userMail = this.userMailRepo.create({
        userId: user.id,
        messageId: mailId,
        folderId: draftsFolder.id,
        isRead: true,
        isStarred: false,
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
