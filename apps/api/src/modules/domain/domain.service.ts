import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Domain } from '../database/entities/domain.entity';
import { Mailbox } from '../database/entities/mailbox.entity';
import { CreateDomainDto } from './dto/create-domain.dto';
import { UpdateDomainDto } from './dto/update-domain.dto';
import { DomainQueryDto } from './dto/domain-query.dto';
import { MailboxCacheService } from '../smtp-ingestion/mailbox-cache.service';

@Injectable()
export class DomainService {
  private readonly logger = new Logger(DomainService.name);

  constructor(
    @InjectRepository(Domain)
    private readonly domainRepo: Repository<Domain>,
    @InjectRepository(Mailbox)
    private readonly mailboxRepo: Repository<Mailbox>,
    private readonly mailboxCache: MailboxCacheService,
  ) {}

  async findAll(query: DomainQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const queryBuilder = this.domainRepo.createQueryBuilder('domain');

    if (query.search) {
      queryBuilder.andWhere(
        '(domain.name LIKE :search OR domain.description LIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    if (query.isActive !== undefined) {
      const activeBool = String(query.isActive) === 'true';
      queryBuilder.andWhere('domain.isActive = :isActive', {
        isActive: activeBool,
      });
    }

    queryBuilder.orderBy('domain.isDefault', 'DESC');
    queryBuilder.addOrderBy('domain.createdAt', 'DESC');
    queryBuilder.skip(skip).take(limit);

    const [domains, total] = await queryBuilder.getManyAndCount();

    // 각 도메인별 속한 사서함 개수 조회
    const items = await Promise.all(
      domains.map(async (d) => {
        const mailboxCount = await this.mailboxRepo.count({
          where: { domain: d.name },
        });
        return {
          ...d,
          mailboxCount,
        };
      }),
    );

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findActiveDomains(): Promise<Domain[]> {
    return this.domainRepo.find({
      where: { isActive: true },
      order: { isDefault: 'DESC', name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Domain> {
    const domain = await this.domainRepo.findOne({ where: { id } });
    if (!domain) {
      throw new NotFoundException(`Domain with ID ${id} not found`);
    }
    return domain;
  }

  async findByName(name: string): Promise<Domain | null> {
    const normalizedName = name.toLowerCase().trim();
    return this.domainRepo.findOne({ where: { name: normalizedName } });
  }

  async create(dto: CreateDomainDto): Promise<Domain> {
    const normalizedName = dto.name.toLowerCase().trim();

    // 도메인 유효성 간단 체크 (호스트명 형식)
    const domainRegex = /^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,5}$/i;
    if (!domainRegex.test(normalizedName)) {
      throw new ConflictException(
        `올바른 도메인 형식이 아닙니다 (예: example.com): ${normalizedName}`,
      );
    }

    const existing = await this.domainRepo.findOne({
      where: { name: normalizedName },
    });
    if (existing) {
      throw new ConflictException(`이미 등록된 도메인입니다: ${normalizedName}`);
    }

    // 만약 첫 도메인이거나 isDefault: true로 요청한 경우
    const count = await this.domainRepo.count();
    const shouldBeDefault = count === 0 ? true : !!dto.isDefault;

    if (shouldBeDefault) {
      await this.domainRepo.update({}, { isDefault: false });
    }

    const domain = this.domainRepo.create({
      name: normalizedName,
      description: dto.description || null,
      isDefault: shouldBeDefault,
      isActive: dto.isActive !== undefined ? dto.isActive : true,
    });

    const saved = await this.domainRepo.save(domain);
    await this.mailboxCache.refreshCache();
    this.logger.log(`Created domain: ${saved.name}`);
    return saved;
  }

  async update(id: string, dto: UpdateDomainDto): Promise<Domain> {
    const domain = await this.findOne(id);

    if (dto.isDefault !== undefined && dto.isDefault) {
      await this.domainRepo.update({}, { isDefault: false });
      domain.isDefault = true;
    }

    if (dto.isActive !== undefined) {
      domain.isActive = dto.isActive;
    }

    if (dto.description !== undefined) {
      domain.description = dto.description;
    }

    const updated = await this.domainRepo.save(domain);
    await this.mailboxCache.refreshCache();
    this.logger.log(`Updated domain: ${updated.name}`);
    return updated;
  }

  async remove(id: string): Promise<void> {
    const domain = await this.findOne(id);

    // 해당 도메인을 사용 중인 사서함이 있는지 확인
    const mailboxCount = await this.mailboxRepo.count({
      where: { domain: domain.name },
    });

    if (mailboxCount > 0) {
      throw new ConflictException(
        `해당 도메인(${domain.name})에 등록된 사서함이 ${mailboxCount}개 존재하여 삭제할 수 없습니다. 사서함을 먼저 삭제하거나 도메인을 비활성화하세요.`,
      );
    }

    if (domain.isDefault) {
      throw new ConflictException('기본 대표 도메인은 삭제할 수 없습니다.');
    }

    await this.domainRepo.delete(id);
    await this.mailboxCache.refreshCache();
    this.logger.log(`Deleted domain: ${domain.name}`);
  }
}
