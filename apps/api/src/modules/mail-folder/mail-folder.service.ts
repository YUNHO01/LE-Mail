import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { MailFolder, UserMail, User } from '../database/entities';
import { CreateMailFolderDto } from './dto/create-mail-folder.dto';
import { UpdateMailFolderDto } from './dto/update-mail-folder.dto';
import { FolderType, MailFolderDto } from '@lemail/shared-types';

export const DEFAULT_SYSTEM_FOLDERS = [
  { name: '받은편지함', type: FolderType.INBOX, sortOrder: 1, isSystem: true },
  { name: '보낸편지함', type: FolderType.SENT, sortOrder: 2, isSystem: true },
  { name: '임시보관함', type: FolderType.DRAFTS, sortOrder: 3, isSystem: true },
  { name: '스팸메일함', type: FolderType.SPAM, sortOrder: 4, isSystem: true },
  { name: '휴지통', type: FolderType.TRASH, sortOrder: 5, isSystem: true },
  { name: '개인편지함', type: FolderType.CUSTOM, sortOrder: 6, isSystem: true },
];

@Injectable()
export class MailFolderService {
  private readonly logger = new Logger(MailFolderService.name);

  constructor(
    @InjectRepository(MailFolder)
    private readonly folderRepo: Repository<MailFolder>,
    @InjectRepository(UserMail)
    private readonly userMailRepo: Repository<UserMail>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /**
   * 사용자 기본 편지함(6종) 초기화
   */
  async initDefaultFolders(
    userId: string,
    manager?: EntityManager,
  ): Promise<MailFolder[]> {
    const repo = manager ? manager.getRepository(MailFolder) : this.folderRepo;

    const existingFolders = await repo.find({
      where: { userId },
    });
    const existingTypes = new Set(existingFolders.map((f) => f.type));

    const createdList: MailFolder[] = [];
    for (const def of DEFAULT_SYSTEM_FOLDERS) {
      if (def.isSystem && existingTypes.has(def.type)) {
        continue;
      }
      const folder = repo.create({
        userId,
        parentId: null,
        name: def.name,
        type: def.type,
        sortOrder: def.sortOrder,
        isSystem: def.isSystem,
      });
      const saved = await repo.save(folder);
      createdList.push(saved);
    }

    if (createdList.length > 0) {
      this.logger.log(
        `Initialized ${createdList.length} default folders for user ${userId}`,
      );
    }
    return createdList;
  }

  /**
   * 모든 사용자 대상 기본 편지함 보장 (마이그레이션용)
   */
  async ensureDefaultFoldersForAllUsers(): Promise<number> {
    const users = await this.userRepo.find();
    let totalCreated = 0;
    for (const u of users) {
      const created = await this.initDefaultFolders(u.id);
      totalCreated += created.length;
    }
    return totalCreated;
  }

  /**
   * 편지함 트리 조회 (메일 개수 및 안 읽은 개수 포함)
   */
  async getFolderTree(userId: string): Promise<MailFolderDto[]> {
    // 1. 해당 유저의 모든 편지함 로드
    const folders = await this.folderRepo.find({
      where: { userId },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });

    if (folders.length === 0) {
      // 만약 아직 생성되지 않은 사용자라면 기본 편지함 생성 후 재조회
      await this.initDefaultFolders(userId);
      return this.getFolderTree(userId);
    }

    // 2. 각 편지함별 totalCount, unreadCount 집계
    const countsRaw = await this.userMailRepo
      .createQueryBuilder('um')
      .select('um.folderId', 'folderId')
      .addSelect('COUNT(um.id)', 'total')
      .addSelect('SUM(CASE WHEN um.isRead = false THEN 1 ELSE 0 END)', 'unread')
      .where('um.userId = :userId', { userId })
      .groupBy('um.folderId')
      .getRawMany();

    const countsMap = new Map<string, { total: number; unread: number }>();
    for (const c of countsRaw) {
      countsMap.set(c.folderId, {
        total: Number(c.total) || 0,
        unread: Number(c.unread) || 0,
      });
    }

    // 3. 트리 구성 (Adjacency List -> Tree structure)
    const folderDtoMap = new Map<string, MailFolderDto>();
    for (const f of folders) {
      const counts = countsMap.get(f.id) || { total: 0, unread: 0 };
      folderDtoMap.set(f.id, {
        id: f.id,
        userId: f.userId,
        parentId: f.parentId,
        name: f.name,
        type: f.type,
        sortOrder: f.sortOrder,
        isSystem: f.isSystem,
        createdAt: f.createdAt.toISOString(),
        updatedAt: f.updatedAt.toISOString(),
        unreadCount: counts.unread,
        totalCount: counts.total,
        children: [],
      });
    }

    const roots: MailFolderDto[] = [];
    for (const f of folders) {
      const currentDto = folderDtoMap.get(f.id)!;
      if (f.parentId && folderDtoMap.has(f.parentId)) {
        const parentDto = folderDtoMap.get(f.parentId)!;
        parentDto.children = parentDto.children || [];
        parentDto.children.push(currentDto);
      } else {
        roots.push(currentDto);
      }
    }

    return roots;
  }

  /**
   * 특정 편지함 단건 조회
   */
  async getFolderById(userId: string, folderId: string): Promise<MailFolder> {
    const folder = await this.folderRepo.findOne({
      where: { id: folderId, userId },
    });
    if (!folder) {
      throw new NotFoundException(`편지함을 찾을 수 없습니다: ${folderId}`);
    }
    return folder;
  }

  /**
   * 시스템 편지함 조회 (타입별)
   */
  async getSystemFolder(userId: string, type: FolderType): Promise<MailFolder> {
    let folder = await this.folderRepo.findOne({
      where: { userId, type },
    });
    if (!folder) {
      await this.initDefaultFolders(userId);
      folder = await this.folderRepo.findOne({
        where: { userId, type },
      });
      if (!folder) {
        throw new NotFoundException(`${type} 편지함을 찾을 수 없습니다.`);
      }
    }
    return folder;
  }

  /**
   * 하위 편지함 생성
   */
  async createFolder(
    userId: string,
    dto: CreateMailFolderDto,
  ): Promise<MailFolderDto> {
    let parentFolder: MailFolder | null = null;

    if (dto.parentId) {
      parentFolder = await this.folderRepo.findOne({
        where: { id: dto.parentId, userId },
      });
      if (!parentFolder) {
        throw new NotFoundException('지정한 상위 편지함이 존재하지 않습니다.');
      }
    } else {
      // parentId가 지정되지 않은 경우, '개인편지함(CUSTOM)' 루트를 상위 편지함으로 자동 지정
      parentFolder = await this.folderRepo.findOne({
        where: { userId, type: FolderType.CUSTOM, isSystem: true },
      });
    }

    const newFolder = this.folderRepo.create({
      userId,
      parentId: parentFolder ? parentFolder.id : null,
      name: dto.name.trim(),
      type: FolderType.CUSTOM,
      sortOrder: dto.sortOrder !== undefined ? dto.sortOrder : 0,
      isSystem: false,
    });

    const saved = await this.folderRepo.save(newFolder);
    this.logger.log(
      `Created custom folder [${saved.name}] (parent: ${saved.parentId}) for user ${userId}`,
    );

    return {
      id: saved.id,
      userId: saved.userId,
      parentId: saved.parentId,
      name: saved.name,
      type: saved.type,
      sortOrder: saved.sortOrder,
      isSystem: saved.isSystem,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString(),
      unreadCount: 0,
      totalCount: 0,
      children: [],
    };
  }

  /**
   * 편지함 수정 (이름 변경, 정렬순서, 부모 이동)
   */
  async updateFolder(
    userId: string,
    folderId: string,
    dto: UpdateMailFolderDto,
  ): Promise<MailFolderDto> {
    const folder = await this.getFolderById(userId, folderId);

    // 시스템 기본 편지함 보호
    if (folder.isSystem) {
      if (dto.name && dto.name !== folder.name) {
        throw new BadRequestException('시스템 기본 편지함의 이름은 변경할 수 없습니다.');
      }
      if (dto.parentId !== undefined && dto.parentId !== folder.parentId) {
        throw new BadRequestException('시스템 기본 편지함의 위치는 이동할 수 없습니다.');
      }
    }

    if (dto.name !== undefined) {
      folder.name = dto.name.trim();
    }

    if (dto.sortOrder !== undefined) {
      folder.sortOrder = dto.sortOrder;
    }

    if (dto.parentId !== undefined) {
      if (dto.parentId === folder.id) {
        throw new BadRequestException('자기 자신을 상위 편지함으로 지정할 수 없습니다.');
      }
      if (dto.parentId) {
        // 순환 참조(Circular Reference) 방지 검증: dto.parentId가 현재 폴더의 자손인지 확인
        const isDescendant = await this.checkIsDescendant(userId, folder.id, dto.parentId);
        if (isDescendant) {
          throw new BadRequestException('하위 편지함의 하위로는 이동할 수 없습니다.');
        }

        const targetParent = await this.folderRepo.findOne({
          where: { id: dto.parentId, userId },
        });
        if (!targetParent) {
          throw new NotFoundException('대상 상위 편지함을 찾을 수 없습니다.');
        }
        folder.parentId = dto.parentId;
      } else {
        folder.parentId = null;
      }
    }

    const updated = await this.folderRepo.save(folder);

    return {
      id: updated.id,
      userId: updated.userId,
      parentId: updated.parentId,
      name: updated.name,
      type: updated.type,
      sortOrder: updated.sortOrder,
      isSystem: updated.isSystem,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  /**
   * 편지함 삭제
   */
  async deleteFolder(
    userId: string,
    folderId: string,
  ): Promise<{ success: boolean; message: string }> {
    const folder = await this.getFolderById(userId, folderId);

    if (folder.isSystem) {
      throw new BadRequestException('시스템 기본 편지함은 삭제할 수 없습니다.');
    }

    // 휴지통 편지함 찾기
    const trashFolder = await this.getSystemFolder(userId, FolderType.TRASH);

    // 이 폴더 및 모든 하위 폴더의 ID 목록 수집
    const allFolderIds = await this.collectAllDescendantFolderIds(userId, folder.id);
    allFolderIds.push(folder.id);

    // 해당 폴더들에 속한 메일들을 휴지통으로 이동
    await this.userMailRepo
      .createQueryBuilder()
      .update(UserMail)
      .set({ folderId: trashFolder.id })
      .where('userId = :userId AND folderId IN (:...folderIds)', {
        userId,
        folderIds: allFolderIds,
      })
      .execute();

    // 폴더 삭제 (ON DELETE CASCADE로 하위 폴더들도 삭제됨)
    await this.folderRepo.remove(folder);
    this.logger.log(`Deleted folder [${folder.name}] and moved mails to Trash for user ${userId}`);

    return { success: true, message: '편지함이 삭제되었습니다.' };
  }

  /**
   * targetId가 parentCandidateId의 자손인지 재귀 검사 (순환 참조 방지)
   */
  private async checkIsDescendant(
    userId: string,
    ancestorId: string,
    targetId: string,
  ): Promise<boolean> {
    const allDescendants = await this.collectAllDescendantFolderIds(userId, ancestorId);
    return allDescendants.includes(targetId);
  }

  /**
   * 특정 폴더의 모든 하위 폴더 ID 수집
   */
  private async collectAllDescendantFolderIds(
    userId: string,
    rootFolderId: string,
  ): Promise<string[]> {
    const allFolders = await this.folderRepo.find({ where: { userId } });
    const descendants: string[] = [];

    const findChildren = (currentId: string) => {
      const children = allFolders.filter((f) => f.parentId === currentId);
      for (const child of children) {
        descendants.push(child.id);
        findChildren(child.id);
      }
    };

    findChildren(rootFolderId);
    return descendants;
  }
}
