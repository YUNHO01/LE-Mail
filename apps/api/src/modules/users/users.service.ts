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
import { User, Mailbox } from '../database/entities';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { UserDto, UserRole } from '@lemail/shared-types';
import { MailboxCacheService } from '../smtp-ingestion/mailbox-cache.service';
import { MailFolderService } from '../mail-folder/mail-folder.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Mailbox)
    private readonly mailboxRepository: Repository<Mailbox>,
    private readonly mailboxCacheService: MailboxCacheService,
    private readonly mailFolderService: MailFolderService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  private toDto(user: User): UserDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  async findAll(query: UserQueryDto) {
    const { page = 1, limit = 20, search, role } = query;
    const skip = (page - 1) * limit;

    const queryBuilder = this.userRepository.createQueryBuilder('user');

    if (search) {
      queryBuilder.where(
        '(user.email LIKE :search OR user.name LIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (role) {
      queryBuilder.andWhere('user.role = :role', { role });
    }

    queryBuilder.orderBy('user.created_at', 'DESC');
    queryBuilder.skip(skip).take(limit);

    const [users, total] = await queryBuilder.getManyAndCount();

    return {
      items: users.map((u) => this.toDto(u)),
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
    return this.toDto(user);
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
