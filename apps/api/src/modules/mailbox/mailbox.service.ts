import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Mailbox } from '../database/entities/mailbox.entity';
import { CreateMailboxDto } from './dto/create-mailbox.dto';
import { UpdateMailboxDto } from './dto/update-mailbox.dto';
import { MailboxQueryDto } from './dto/mailbox-query.dto';
import { MailboxCacheService } from '../smtp-ingestion/mailbox-cache.service';

@Injectable()
export class MailboxService {
  private readonly logger = new Logger(MailboxService.name);

  constructor(
    @InjectRepository(Mailbox)
    private readonly mailboxRepo: Repository<Mailbox>,
    private readonly mailboxCache: MailboxCacheService,
  ) {}

  async findAll(query: MailboxQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const queryBuilder = this.mailboxRepo.createQueryBuilder('mb');

    if (query.domain) {
      queryBuilder.andWhere('mb.domain = :domain', { domain: query.domain });
    }

    if (query.search) {
      queryBuilder.andWhere('mb.email LIKE :search', {
        search: `%${query.search}%`,
      });
    }

    if (query.isActive !== undefined) {
      const activeBool = String(query.isActive) === 'true';
      queryBuilder.andWhere('mb.isActive = :isActive', { isActive: activeBool });
    }

    queryBuilder.orderBy('mb.createdAt', 'DESC');
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

  async findOne(id: string): Promise<Mailbox> {
    const mailbox = await this.mailboxRepo.findOne({ where: { id } });
    if (!mailbox) {
      throw new NotFoundException(`Mailbox with ID ${id} not found`);
    }
    return mailbox;
  }

  async create(dto: CreateMailboxDto): Promise<Mailbox> {
    const normalizedEmail = dto.email.toLowerCase().trim();
    const existing = await this.mailboxRepo.findOne({
      where: { email: normalizedEmail },
    });
    if (existing) {
      throw new ConflictException(`Email ${normalizedEmail} already exists`);
    }

    const domain = dto.domain || normalizedEmail.split('@')[1];
    if (!domain) {
      throw new ConflictException('Invalid email address domain');
    }

    const mailbox = this.mailboxRepo.create({
      email: normalizedEmail,
      domain,
      isActive: dto.isActive !== undefined ? dto.isActive : true,
    });

    const saved = await this.mailboxRepo.save(mailbox);
    await this.mailboxCache.invalidate(); // 캐시 갱신
    this.logger.log(`Created mailbox: ${saved.email}`);
    return saved;
  }

  async update(id: string, dto: UpdateMailboxDto): Promise<Mailbox> {
    const mailbox = await this.findOne(id);

    if (dto.isActive !== undefined) {
      mailbox.isActive = dto.isActive;
    }

    const saved = await this.mailboxRepo.save(mailbox);
    await this.mailboxCache.invalidate(); // 캐시 갱신
    this.logger.log(`Updated mailbox: ${saved.email} (isActive: ${saved.isActive})`);
    return saved;
  }

  async delete(id: string): Promise<{ success: boolean }> {
    const mailbox = await this.findOne(id);
    await this.mailboxRepo.delete(id);
    await this.mailboxCache.invalidate(); // 캐시 갱신
    this.logger.log(`Deleted mailbox: ${mailbox.email}`);
    return { success: true };
  }

  async getStatistics() {
    const total = await this.mailboxRepo.count();
    const active = await this.mailboxRepo.count({ where: { isActive: true } });
    const domainsCount = await this.mailboxRepo
      .createQueryBuilder('mb')
      .select('COUNT(DISTINCT mb.domain)', 'count')
      .getRawOne();

    return {
      totalMailboxes: total,
      activeMailboxes: active,
      inactiveMailboxes: total - active,
      totalDomains: Number(domainsCount?.count || 0),
    };
  }
}
