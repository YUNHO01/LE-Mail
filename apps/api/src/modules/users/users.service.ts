import { existsSync, statSync } from 'fs';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, Mailbox, Domain } from '../database/entities';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { UserDto, UserRole, UserStorageUsageDto } from '@lemail/shared-types';
import { MailboxCacheService } from '../smtp-ingestion/mailbox-cache.service';
import { MailFolderService } from '../mail-folder/mail-folder.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Mailbox)
    private readonly mailboxRepository: Repository<Mailbox>,
    @InjectRepository(Domain)
    private readonly domainRepository: Repository<Domain>,
    private readonly mailboxCacheService: MailboxCacheService,
    private readonly mailFolderService: MailFolderService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  private toDto(
    user: User,
    usage?: { usedBytes: number; usedMb: number; messageCount: number },
  ): UserDto {
    const quotaMb = user.mailboxQuotaMb ?? 512;
    const usedBytes = usage?.usedBytes ?? 0;
    const usedMb = usage?.usedMb ?? 0;
    const messageCount = usage?.messageCount ?? 0;
    const usagePercent =
      quotaMb > 0 ? Math.min(100, Math.round((usedMb / quotaMb) * 1000) / 10) : 0;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      mailboxQuotaMb: quotaMb,
      usedBytes,
      usedMb,
      usagePercent,
      messageCount,
      preferredLanguage: user.preferredLanguage || 'ko',
      timezone: user.timezone || 'Asia/Seoul',
      employeeId: user.employeeId || null,
      lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  async getUserStorageUsage(userId: string): Promise<UserStorageUsageDto> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

    const quotaMb = user.mailboxQuotaMb ?? 512;
    const usageMap = await this.getBatchUserMailUsage([userId]);
    const usage = usageMap.get(userId);

    const usedBytes = usage?.usedBytes ?? 0;
    const usedMb = usage?.usedMb ?? 0;
    const messageCount = usage?.messageCount ?? 0;
    const usagePercent =
      quotaMb > 0 ? Math.min(100, Math.round((usedMb / quotaMb) * 1000) / 10) : 0;
    const freeMb = Math.max(0, Math.round((quotaMb - usedMb) * 100) / 100);

    return {
      quotaMb,
      usedBytes,
      usedMb,
      usagePercent,
      messageCount,
      freeMb,
    };
  }

  private async getBatchUserMailUsage(userIds: string[]): Promise<
    Map<string, { usedBytes: number; usedMb: number; messageCount: number }>
  > {
    const usageMap = new Map<
      string,
      { usedBytes: number; usedMb: number; messageCount: number }
    >();

    if (userIds.length === 0) return usageMap;

    try {
      // 1. user_mail 건수 및 첨부파일 용량
      const rows = await this.dataSource.query(
        `SELECT 
          um.user_id AS userId,
          COUNT(DISTINCT um.id) AS messageCount,
          COALESCE(SUM(CAST(ma.size_bytes AS UNSIGNED)), 0) AS attachmentBytes
         FROM user_mail um
         LEFT JOIN mail_attachment ma ON ma.message_id = um.message_id
         WHERE um.user_id IN (?)
         GROUP BY um.user_id`,
        [userIds],
      );

      // 2. 각 메일별 rawFilePath
      const userMessageRows: Array<{ userId: string; rawFilePath: string; messageId: string }> =
        await this.dataSource.query(
          `SELECT DISTINCT um.user_id AS userId, um.message_id AS messageId, mm.raw_file_path AS rawFilePath
           FROM user_mail um
           LEFT JOIN mail_message mm ON mm.id = um.message_id
           WHERE um.user_id IN (?)`,
          [userIds],
        );

      const userEmlBytes = new Map<string, number>();
      for (const r of userMessageRows) {
        if (r.rawFilePath && existsSync(r.rawFilePath)) {
          try {
            const sz = statSync(r.rawFilePath).size;
            userEmlBytes.set(r.userId, (userEmlBytes.get(r.userId) || 0) + sz);
          } catch {}
        }
      }

      for (const row of rows) {
        const uId = row.userId;
        const attBytes = Number(row.attachmentBytes) || 0;
        const emlBytes = userEmlBytes.get(uId) || 0;
        const totalBytes = attBytes + emlBytes;
        const usedMb = Math.round((totalBytes / (1024 * 1024)) * 100) / 100;
        const msgCount = Number(row.messageCount) || 0;

        usageMap.set(uId, {
          usedBytes: totalBytes,
          usedMb,
          messageCount: msgCount,
        });
      }
    } catch (err) {
      // 에러 발생 시 빈 맵 반환
    }

    return usageMap;
  }

  async findAll(query: UserQueryDto) {
    const { page = 1, limit = 20, search, role } = query;
    const skip = (page - 1) * limit;

    const queryBuilder = this.userRepository.createQueryBuilder('user');

    if (search) {
      queryBuilder.where(
        '(user.email LIKE :search OR user.name LIKE :search OR user.employee_id LIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (role) {
      queryBuilder.andWhere('user.role = :role', { role });
    }

    queryBuilder.orderBy('user.created_at', 'DESC');
    queryBuilder.skip(skip).take(limit);

    const [users, total] = await queryBuilder.getManyAndCount();
    const userIds = users.map((u) => u.id);
    const usageMap = await this.getBatchUserMailUsage(userIds);

    return {
      items: users.map((u) => this.toDto(u, usageMap.get(u.id))),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string): Promise<UserDto> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`사용자를 찾을 수 없습니다: ${id}`);
    }
    const usageMap = await this.getBatchUserMailUsage([id]);
    return this.toDto(user, usageMap.get(id));
  }

  async create(createUserDto: CreateUserDto): Promise<UserDto> {
    const normalizedEmail = createUserDto.email.toLowerCase().trim();

    // Check duplicate
    const existing = await this.userRepository.findOne({
      where: { email: normalizedEmail },
    });
    if (existing) {
      throw new ConflictException(`이미 등록된 이메일 계정입니다: ${normalizedEmail}`);
    }

    const domain = normalizedEmail.split('@')[1];
    if (!domain) {
      throw new BadRequestException('올바른 도메인이 포함된 이메일 주소를 입력해 주세요.');
    }

    // 도메인 활성 상태 검증
    const registeredDomain = await this.domainRepository.findOne({
      where: { name: domain },
    });
    if (!registeredDomain) {
      throw new BadRequestException(
        `등록되지 않은 도메인(@${domain})입니다. '도메인 관리' 메뉴에서 도메인을 먼저 등록해 주세요.`,
      );
    }
    if (!registeredDomain.isActive) {
      throw new BadRequestException(
        `비활성화된 도메인(@${domain})입니다. 도메인이 활성화되어 있어야 사용자를 등록할 수 있습니다.`,
      );
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(createUserDto.password, saltRounds);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let savedUser: User;
    try {
      const newUser = queryRunner.manager.create(User, {
        email: normalizedEmail,
        name: createUserDto.name,
        passwordHash,
        role: createUserDto.role || UserRole.USER,
        isActive: true,
        mailboxQuotaMb: createUserDto.mailboxQuotaMb ? Number(createUserDto.mailboxQuotaMb) : 512,
        preferredLanguage: createUserDto.preferredLanguage || 'ko',
        timezone: createUserDto.timezone || 'Asia/Seoul',
        employeeId: createUserDto.employeeId?.trim() || null,
      });
      savedUser = await queryRunner.manager.save(newUser);

      // Create or update corresponding mailbox
      let mailbox = await queryRunner.manager.findOne(Mailbox, {
        where: { email: normalizedEmail },
      });

      if (!mailbox) {
        mailbox = queryRunner.manager.create(Mailbox, {
          email: normalizedEmail,
          domain,
          isActive: true,
        });
        await queryRunner.manager.save(mailbox);
      } else if (!mailbox.isActive) {
        mailbox.isActive = true;
        await queryRunner.manager.save(mailbox);
      }

      // Initialize default mail folders (받은편지함, 보낸편지함, 임시보관함, 스팸메일함, 휴지통, 개인편지함)
      await this.mailFolderService.initDefaultFolders(
        savedUser.id,
        queryRunner.manager,
      );

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }

    // Invalidate/refresh mailbox cache for instant SMTP reception
    await this.mailboxCacheService.invalidate();

    return this.toDto(savedUser);
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<UserDto> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`사용자를 찾을 수 없습니다: ${id}`);
    }

    if (updateUserDto.name !== undefined) {
      user.name = updateUserDto.name;
    }

    if (updateUserDto.role !== undefined) {
      user.role = updateUserDto.role;
    }

    if (updateUserDto.mailboxQuotaMb !== undefined) {
      user.mailboxQuotaMb = Number(updateUserDto.mailboxQuotaMb);
    }

    if (updateUserDto.preferredLanguage !== undefined) {
      user.preferredLanguage = updateUserDto.preferredLanguage;
    }

    if (updateUserDto.timezone !== undefined) {
      user.timezone = updateUserDto.timezone;
    }

    if (updateUserDto.employeeId !== undefined) {
      user.employeeId = updateUserDto.employeeId?.trim() || null;
    }

    if (updateUserDto.password) {
      const saltRounds = 10;
      user.passwordHash = await bcrypt.hash(updateUserDto.password, saltRounds);
    }

    if (updateUserDto.isActive !== undefined) {
      user.isActive = updateUserDto.isActive;

      // Sync mailbox active state
      const mailbox = await this.mailboxRepository.findOne({
        where: { email: user.email },
      });
      if (mailbox) {
        mailbox.isActive = user.isActive;
        await this.mailboxRepository.save(mailbox);
        await this.mailboxCacheService.invalidate();
      }
    }

    const updated = await this.userRepository.save(user);
    return this.toDto(updated);
  }

  async remove(id: string, currentUserId: string): Promise<{ success: boolean; message: string }> {
    if (id === currentUserId) {
      throw new BadRequestException('자기 자신의 계정은 삭제할 수 없습니다.');
    }

    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`사용자를 찾을 수 없습니다: ${id}`);
    }

    if (user.role === UserRole.SYSTEM_ADMIN) {
      const adminCount = await this.userRepository.count({
        where: { role: UserRole.SYSTEM_ADMIN },
      });
      if (adminCount <= 1) {
        throw new ForbiddenException('마지막 시스템 관리자 계정은 삭제할 수 없습니다.');
      }
    }

    // Inactivate or delete corresponding mailbox
    const mailbox = await this.mailboxRepository.findOne({
      where: { email: user.email },
    });
    if (mailbox) {
      mailbox.isActive = false;
      await this.mailboxRepository.save(mailbox);
      await this.mailboxCacheService.invalidate();
    }

    await this.userRepository.remove(user);
    return { success: true, message: '사용자가 성공적으로 삭제되었습니다.' };
  }
}
