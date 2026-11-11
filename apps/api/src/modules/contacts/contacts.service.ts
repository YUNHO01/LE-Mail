import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, In, IsNull } from 'typeorm';
import { Contact, ContactGroup, User } from '../database/entities';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { ContactsImportExportService } from './contacts-import-export.service';
import { DuplicateContactAction, ContactSearchResultDto, ImportContactsResultDto, UserRole, UserDto } from '@lemail/shared-types';

@Injectable()
export class ContactsService {
  constructor(
    @InjectRepository(Contact)
    private readonly contactRepo: Repository<Contact>,
    @InjectRepository(ContactGroup)
    private readonly groupRepo: Repository<ContactGroup>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly importExportService: ContactsImportExportService,
  ) {}

  /**
   * 주소록 목록 조회
   */
  async getContacts(
    userId: string,
    query: {
      search?: string;
      groupId?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const qb = this.contactRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect(ContactGroup, 'g', 'c.group_id = g.id')
      .select([
        'c.id AS id',
        'c.userId AS userId',
        'c.groupId AS groupId',
        'g.name AS groupName',
        'c.name AS name',
        'c.email AS email',
        'c.phone AS phone',
        'c.company AS company',
        'c.department AS department',
        'c.position AS position',
        'c.companyPhone AS companyPhone',
        'c.companyFax AS companyFax',
        'c.mobileCountryCode AS mobileCountryCode',
        'c.birthday AS birthday',
        'c.postalCode AS postalCode',
        'c.address AS address',
        'c.websiteUrl AS websiteUrl',
        'c.memo AS memo',
        'c.isStarred AS isStarred',
        'c.createdAt AS createdAt',
        'c.updatedAt AS updatedAt',
      ])
      .where('c.user_id = :userId', { userId });

    if (query.groupId) {
      if (query.groupId === 'starred') {
        qb.andWhere('c.is_starred = true');
      } else if (query.groupId === 'ungrouped') {
        qb.andWhere('c.group_id IS NULL');
      } else if (query.groupId !== 'all') {
        qb.andWhere('c.group_id = :groupId', { groupId: query.groupId });
      }
    }

    if (query.search) {
      const s = `%${query.search.trim()}%`;
      qb.andWhere(
        '(c.name LIKE :s OR c.email LIKE :s OR c.phone LIKE :s OR c.company LIKE :s OR c.department LIKE :s)',
        { s },
      );
    }

    qb.orderBy('c.is_starred', 'DESC')
      .addOrderBy('c.name', 'ASC')
      .offset(skip)
      .limit(limit);

    const [rawItems, total] = await Promise.all([
      qb.getRawMany(),
      qb.getCount(),
    ]);

    const items = rawItems.map((r) => ({
      id: r.id,
      userId: r.userId,
      groupId: r.groupId,
      groupName: r.groupName || null,
      name: r.name,
      email: r.email,
      phone: r.phone,
      company: r.company,
      department: r.department,
      position: r.position,
      companyPhone: r.companyPhone,
      companyFax: r.companyFax,
      mobileCountryCode: r.mobileCountryCode,
      birthday: r.birthday,
      postalCode: r.postalCode,
      address: r.address,
      websiteUrl: r.websiteUrl,
      memo: r.memo,
      isStarred: Boolean(r.isStarred),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * 사내 임직원 주소록 조회 (일반 사용자 USER 권한인 활성 사용자만 조회)
   */
  async getCompanyUsers(): Promise<UserDto[]> {
    const users = await this.userRepo.find({
      where: {
        role: UserRole.USER,
        isActive: true,
      },
      order: {
        name: 'ASC',
      },
    });

    return users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      isActive: u.isActive,
      mailboxQuotaMb: u.mailboxQuotaMb,
      preferredLanguage: u.preferredLanguage,
      timezone: u.timezone,
      employeeId: u.employeeId,
      lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
      useSignature: u.useSignature,
      createdAt: u.createdAt.toISOString(),
      updatedAt: u.updatedAt.toISOString(),
    }));
  }

  /**
   * 단일 연락처 조회
   */
  async getContactById(userId: string, id: string) {
    const contact = await this.contactRepo.findOne({
      where: { id, userId },
    });
    if (!contact) {
      throw new NotFoundException('연락처를 찾을 수 없습니다.');
    }
    return contact;
  }

  /**
   * 연락처 등록
   */
  async createContact(userId: string, dto: CreateContactDto) {
    const contact = this.contactRepo.create({
      ...dto,
      userId,
    });
    return this.contactRepo.save(contact);
  }

  /**
   * 연락처 수정
   */
  async updateContact(userId: string, id: string, dto: UpdateContactDto) {
    const contact = await this.getContactById(userId, id);
    Object.assign(contact, dto);
    return this.contactRepo.save(contact);
  }

  /**
   * 연락처 삭제
   */
  async deleteContact(userId: string, id: string) {
    const contact = await this.getContactById(userId, id);
    await this.contactRepo.remove(contact);
    return { success: true, id };
  }

  /**
   * 다중 연락처 삭제
   */
  async bulkDeleteContacts(userId: string, ids: string[]) {
    if (!ids || ids.length === 0) return { success: true, count: 0 };
    const res = await this.contactRepo
      .createQueryBuilder()
      .delete()
      .from(Contact)
      .where('user_id = :userId AND id IN (:...ids)', { userId, ids })
      .execute();
    return { success: true, count: res.affected || 0 };
  }

  /**
   * 중요 연락처 토글
   */
  async toggleStar(userId: string, id: string) {
    const contact = await this.getContactById(userId, id);
    contact.isStarred = !contact.isStarred;
    return this.contactRepo.save(contact);
  }

  /**
   * 메일 작성 시 수신자 자동완성 검색 (개인 주소록 + 사내 등록 사용자 통합)
   */
  async searchContactsAndUsers(userId: string, keyword: string): Promise<ContactSearchResultDto[]> {
    const term = (keyword || '').trim();
    if (!term) return [];

    const searchPattern = `%${term}%`;

    // 1. 개인 주소록 검색 (이메일이 존재하는 연락처만)
    const contacts = await this.contactRepo
      .createQueryBuilder('c')
      .where('c.user_id = :userId AND c.email IS NOT NULL AND c.email != ""', { userId })
      .andWhere('(c.name LIKE :term OR c.email LIKE :term OR c.company LIKE :term)', {
        term: searchPattern,
      })
      .orderBy('c.is_starred', 'DESC')
      .addOrderBy('c.name', 'ASC')
      .limit(10)
      .getMany();

    // 2. 사내 사용자(User) 검색
    const users = await this.userRepo
      .createQueryBuilder('u')
      .where('u.is_active = true')
      .andWhere('(u.name LIKE :term OR u.email LIKE :term)', { term: searchPattern })
      .orderBy('u.name', 'ASC')
      .limit(10)
      .getMany();

    const results: ContactSearchResultDto[] = [];
    const seenEmails = new Set<string>();

    // 사내 사용자 우선 or 주소록 우선 통합
    for (const u of users) {
      if (!seenEmails.has(u.email.toLowerCase())) {
        seenEmails.add(u.email.toLowerCase());
        results.push({
          id: u.id,
          name: u.name,
          email: u.email,
          company: '사내 임직원',
          department: null,
          position: null,
          phone: null,
          source: 'SYSTEM_USER',
        });
      }
    }

    for (const c of contacts) {
      if (c.email && !seenEmails.has(c.email.toLowerCase())) {
        seenEmails.add(c.email.toLowerCase());
        results.push({
          id: c.id,
          name: c.name,
          email: c.email,
          phone: c.phone,
          company: c.company,
          department: c.department,
          position: c.position,
          source: 'CONTACT',
        });
      }
    }

    return results.slice(0, 15);
  }

  /**
   * 그룹 목록 조회 (그룹별 연락처 건수 집계 포함)
   */
  async getGroups(userId: string) {
    const groups = await this.groupRepo.find({
      where: { userId },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });

    const counts = await this.contactRepo
      .createQueryBuilder('c')
      .select('c.group_id AS groupId, COUNT(c.id) AS count')
      .where('c.user_id = :userId', { userId })
      .andWhere('c.group_id IS NOT NULL')
      .groupBy('c.group_id')
      .getRawMany();

    const countMap = new Map<string, number>();
    for (const row of counts) {
      countMap.set(row.groupId, Number(row.count));
    }

    return groups.map((g) => ({
      ...g,
      contactCount: countMap.get(g.id) || 0,
    }));
  }

  async createGroup(userId: string, dto: CreateGroupDto) {
    const group = this.groupRepo.create({
      ...dto,
      userId,
    });
    return this.groupRepo.save(group);
  }

  async updateGroup(userId: string, id: string, dto: UpdateGroupDto) {
    const group = await this.groupRepo.findOne({ where: { id, userId } });
    if (!group) throw new NotFoundException('그룹을 찾을 수 없습니다.');
    Object.assign(group, dto);
    return this.groupRepo.save(group);
  }

  async deleteGroup(userId: string, id: string) {
    const group = await this.groupRepo.findOne({ where: { id, userId } });
    if (!group) throw new NotFoundException('그룹을 찾을 수 없습니다.');
    // 그룹에 속한 연락처들은 미지정으로 전환
    await this.contactRepo.update({ groupId: id, userId }, { groupId: null });
    await this.groupRepo.remove(group);
    return { success: true, id };
  }

  /**
   * 외부 주소록 가져오기
   */
  async importContacts(
    userId: string,
    params: {
      fileContent: string;
      filename: string;
      duplicateAction?: DuplicateContactAction;
    },
  ): Promise<ImportContactsResultDto> {
    let buffer: Buffer;
    if (params.fileContent.includes(';base64,')) {
      const b64 = params.fileContent.split(';base64,').pop() || '';
      buffer = Buffer.from(b64, 'base64');
    } else {
      const ext = params.filename?.split('.').pop()?.toLowerCase();
      if (
        (ext === 'xlsx' || ext === 'xls') &&
        /^[A-Za-z0-9+/=\r\n]+$/.test(params.fileContent.trim())
      ) {
        try {
          buffer = Buffer.from(params.fileContent.trim(), 'base64');
        } catch {
          buffer = Buffer.from(params.fileContent, 'utf-8');
        }
      } else {
        buffer = Buffer.from(params.fileContent, 'utf-8');
      }
    }

    const parsedContacts = this.importExportService.parseImportFile(
      buffer,
      params.filename,
    );

    const duplicateAction = params.duplicateAction || 'SKIP';
    const result: ImportContactsResultDto = {
      total: parsedContacts.length,
      imported: 0,
      skipped: 0,
      errors: [],
    };

    if (parsedContacts.length === 0) {
      return result;
    }

    for (const c of parsedContacts) {
      try {
        let existing: Contact | null = null;
        if (c.email) {
          existing = await this.contactRepo.findOne({
            where: { userId, email: c.email },
          });
        } else if (c.phone) {
          existing = await this.contactRepo.findOne({
            where: { userId, name: c.name, phone: c.phone },
          });
        } else {
          existing = await this.contactRepo.findOne({
            where: { userId, name: c.name },
          });
        }

        if (existing) {
          if (duplicateAction === 'SKIP') {
            result.skipped++;
            continue;
          } else if (duplicateAction === 'OVERWRITE') {
            Object.assign(existing, c);
            await this.contactRepo.save(existing);
            result.imported++;
            continue;
          }
          // KEEP_BOTH: 중복되어도 새 레코드로 삽입
        }

        const newContact = this.contactRepo.create({
          ...c,
          userId,
        });
        await this.contactRepo.save(newContact);
        result.imported++;
      } catch (err: any) {
        result.errors.push(`${c.name || c.email || c.phone}: ${err.message}`);
      }
    }

    return result;
  }

  /**
   * 주소록 내보내기 파일 생성 (Excel .xlsx, CSV, vCard 지원)
   */
  async exportContacts(
    userId: string,
    format: 'xlsx' | 'csv' | 'vcf',
    groupId?: string,
  ): Promise<{ data: Buffer | string; filename: string; mimeType: string }> {
    const qb = this.contactRepo.createQueryBuilder('c').where('c.user_id = :userId', { userId });

    if (groupId) {
      if (groupId === 'starred') {
        qb.andWhere('c.is_starred = true');
      } else if (groupId === 'ungrouped') {
        qb.andWhere('c.group_id IS NULL');
      } else if (groupId !== 'all') {
        qb.andWhere('c.group_id = :groupId', { groupId });
      }
    }

    qb.orderBy('c.name', 'ASC');
    const contacts = await qb.getMany();

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    if (format === 'xlsx') {
      const data = this.importExportService.exportToExcel(contacts);
      return {
        data,
        filename: `contacts_${dateStr}.xlsx`,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    } else if (format === 'vcf') {
      const data = this.importExportService.exportToVCard(contacts);
      return {
        data,
        filename: `contacts_${dateStr}.vcf`,
        mimeType: 'text/vcard; charset=utf-8',
      };
    } else {
      const data = this.importExportService.exportToCsv(contacts);
      return {
        data,
        filename: `contacts_${dateStr}.csv`,
        mimeType: 'text/csv; charset=utf-8',
      };
    }
  }
}
