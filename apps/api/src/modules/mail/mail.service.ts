import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MailMessage } from '../database/entities/mail-message.entity';
import { MailAttachment } from '../database/entities/mail-attachment.entity';
import { MailQueryDto } from './dto/mail-query.dto';
import { WorkerPoolService } from '../worker-pool/worker-pool.service';
import { existsSync, unlinkSync, rmSync } from 'fs';
import { join } from 'path';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    @InjectRepository(MailMessage)
    private readonly messageRepo: Repository<MailMessage>,
    @InjectRepository(MailAttachment)
    private readonly attachmentRepo: Repository<MailAttachment>,
    private readonly workerPool: WorkerPoolService,
  ) {}

  async findAll(query: MailQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const queryBuilder = this.messageRepo
      .createQueryBuilder('msg')
      .leftJoinAndSelect('msg.recipients', 'rec')
      .leftJoinAndSelect('msg.attachments', 'att');

    if (query.mailbox) {
      queryBuilder.andWhere('rec.address = :mailbox', {
        mailbox: query.mailbox.toLowerCase().trim(),
      });
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

    if (query.direction) {
      queryBuilder.andWhere('msg.direction = :direction', {
        direction: query.direction,
      });
    }

    queryBuilder.orderBy('msg.createdAt', 'DESC');
    queryBuilder.skip(skip).take(limit);

    const [items, total] = await queryBuilder.getManyAndCount();

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
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
}
