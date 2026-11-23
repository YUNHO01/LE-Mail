import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { Department, SystemLicense, User } from '../database/entities';
import { DepartmentDto } from '@lemail/shared-types';
import { CreateDepartmentDto, MoveDepartmentDto, UpdateDepartmentDto } from './dto/department.dto';

export interface DepartmentTreeNode extends DepartmentDto {
  userCount: number;
  children: DepartmentTreeNode[];
}

@Injectable()
export class DepartmentsService implements OnModuleInit {
  private readonly logger = new Logger(DepartmentsService.name);

  constructor(
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(SystemLicense)
    private readonly licenseRepo: Repository<SystemLicense>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureRootDepartment();
  }

  /**
   * 최상위 루트 부서 보장:
   * - 초기 구성 시 'LEMail'로 생성
   * - 활성 라이선스가 있으면 라이선스의 회사명으로 생성/동기화
   * - 기존 parentId=null 부서가 있으면 루트 하위로 귀속
   */
  async ensureRootDepartment(): Promise<Department> {
    const activeLicense = await this.licenseRepo.findOne({
      where: { isActive: true },
      order: { createdAt: 'DESC' },
    });
    const desiredName = activeLicense?.organizationName?.trim() || 'LEMail';

    let rootDept = await this.departmentRepo.findOne({ where: { isRoot: true } });

    if (!rootDept) {
      // 기존에 code='ROOT'로 존재하는 부서가 있다면 루트로 승격
      const existingByCode = await this.departmentRepo.findOne({ where: { code: 'ROOT' } });
      if (existingByCode) {
        existingByCode.isRoot = true;
        existingByCode.parentId = null;
        existingByCode.depth = 0;
        existingByCode.sortOrder = 0;
        existingByCode.isActive = true;
        existingByCode.name = desiredName;
        existingByCode.path = `/${existingByCode.id}`;
        rootDept = await this.departmentRepo.save(existingByCode);
      } else {
        const created = this.departmentRepo.create({
          code: 'ROOT',
          parentId: null,
          name: desiredName,
          depth: 0,
          sortOrder: 0,
          source: 'LOCAL',
          isActive: true,
          isRoot: true,
        });
        const saved = await this.departmentRepo.save(created);
        saved.path = `/${saved.id}`;
        rootDept = await this.departmentRepo.save(saved);
        this.logger.log(`🏢 최상위 루트 부서를 생성했습니다: ${desiredName}`);
      }
    } else if (activeLicense?.organizationName?.trim() && rootDept.name !== desiredName) {
      rootDept.name = desiredName;
      rootDept = await this.departmentRepo.save(rootDept);
    }

    // 기존에 parentId IS NULL 이면서 isRoot = false 인 부서들을 루트 하위로 편입
    const orphanRoots = await this.departmentRepo.find({
      where: { parentId: IsNull(), isRoot: false },
    });
    if (orphanRoots.length > 0) {
      for (const orphan of orphanRoots) {
        orphan.parentId = rootDept.id;
        orphan.depth = 1;
        orphan.path = `${rootDept.path || `/${rootDept.id}`}/${orphan.id}`;
        const savedOrphan = await this.departmentRepo.save(orphan);
        await this.rebuildSubtreePaths(savedOrphan);
      }
      this.logger.log(`🔗 기존 최상위 부서 ${orphanRoots.length}개를 루트 부서(${rootDept.name}) 하위로 연결했습니다.`);
    }

    return rootDept;
  }

  toDto(dept: Department): DepartmentDto {
    return {
      id: dept.id,
      code: dept.code ?? null,
      amsDeptId: dept.amsDeptId ?? null,
      parentId: dept.parentId ?? null,
      name: dept.name,
      depth: dept.depth ?? 0,
      path: dept.path ?? null,
      sortOrder: dept.sortOrder ?? 0,
      managerEmployeeId: dept.managerEmployeeId ?? null,
      source: dept.source || 'LOCAL',
      isActive: Boolean(dept.isActive),
      isRoot: Boolean(dept.isRoot),
      lastSyncedAt: dept.lastSyncedAt ? dept.lastSyncedAt.toISOString() : null,
      createdAt: dept.createdAt.toISOString(),
      updatedAt: dept.updatedAt.toISOString(),
    };
  }

  async findAll(includeInactive = false): Promise<DepartmentDto[]> {
    const where = includeInactive ? {} : { isActive: true };
    const depts = await this.departmentRepo.find({
      where,
      order: { depth: 'ASC', sortOrder: 'ASC', name: 'ASC' },
    });
    return depts.map((d) => this.toDto(d));
  }

  async getTree(includeInactive = false): Promise<DepartmentTreeNode[]> {
    const depts = await this.findAll(includeInactive);
    const counts = await this.userRepo
      .createQueryBuilder('u')
      .select('u.department_id AS departmentId, COUNT(u.id) AS cnt')
      .where('u.is_active = true AND u.department_id IS NOT NULL')
      .groupBy('u.department_id')
      .getRawMany<{ departmentId: string; cnt: string }>();

    const countMap = new Map<string, number>();
    for (const row of counts) {
      countMap.set(row.departmentId, Number(row.cnt) || 0);
    }

    const nodeMap = new Map<string, DepartmentTreeNode>();
    for (const d of depts) {
      nodeMap.set(d.id, {
        ...d,
        userCount: countMap.get(d.id) || 0,
        children: [],
      });
    }

    const roots: DepartmentTreeNode[] = [];
    for (const node of nodeMap.values()) {
      if (node.parentId && nodeMap.has(node.parentId)) {
        nodeMap.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  async create(dto: CreateDepartmentDto): Promise<DepartmentDto> {
    const normalizedCode = dto.code?.trim() || null;
    if (normalizedCode) {
      const existing = await this.departmentRepo.findOne({ where: { code: normalizedCode } });
      if (existing) {
        throw new ConflictException(`이미 사용 중인 부서 코드입니다: ${normalizedCode}`);
      }
    }

    let parent = await this.resolveParent(dto.parentId);
    if (!parent) {
      parent = await this.ensureRootDepartment();
    }

    let nextSortOrder = dto.sortOrder;
    if (nextSortOrder === undefined) {
      const siblingCount = await this.departmentRepo.count({ where: { parentId: parent.id } });
      nextSortOrder = siblingCount;
    }

    const dept = this.departmentRepo.create({
      name: dto.name.trim(),
      code: normalizedCode,
      parentId: parent.id,
      depth: parent.depth + 1,
      sortOrder: nextSortOrder,
      managerEmployeeId: dto.managerEmployeeId?.trim() || null,
      source: 'LOCAL',
      isActive: dto.isActive ?? true,
      isRoot: false,
    });

    const saved = await this.departmentRepo.save(dept);
    saved.path = parent.path ? `${parent.path}/${saved.id}` : `/${saved.id}`;
    const updated = await this.departmentRepo.save(saved);
    return this.toDto(updated);
  }

  async update(id: string, dto: UpdateDepartmentDto): Promise<DepartmentDto> {
    const dept = await this.departmentRepo.findOne({ where: { id } });
    if (!dept) {
      throw new NotFoundException(`부서를 찾을 수 없습니다: ${id}`);
    }

    if (dept.isRoot) {
      if (dto.name !== undefined && dto.name.trim() !== dept.name) {
        throw new BadRequestException('최상위 부서명은 라이선스 회사명과 연동되어 직접 변경할 수 없습니다.');
      }
      if (dto.parentId !== undefined && (dto.parentId?.trim() || null) !== null) {
        throw new BadRequestException('최상위 부서는 다른 부서 하위로 이동할 수 없습니다.');
      }
      if (dto.isActive === false) {
        throw new BadRequestException('최상위 부서는 비활성화할 수 없습니다.');
      }
    }

    if (dto.code !== undefined) {
      const normalizedCode = dto.code?.trim() || null;
      if (normalizedCode && normalizedCode !== dept.code) {
        const dup = await this.departmentRepo.findOne({ where: { code: normalizedCode } });
        if (dup) {
          throw new ConflictException(`이미 사용 중인 부서 코드입니다: ${normalizedCode}`);
        }
      }
      dept.code = normalizedCode;
    }

    if (!dept.isRoot && dto.name !== undefined) dept.name = dto.name.trim();
    if (dto.sortOrder !== undefined) dept.sortOrder = dto.sortOrder;
    if (dto.managerEmployeeId !== undefined) {
      dept.managerEmployeeId = dto.managerEmployeeId?.trim() || null;
    }
    if (!dept.isRoot && dto.isActive !== undefined) dept.isActive = dto.isActive;

    let hierarchyChanged = false;
    if (!dept.isRoot && dto.parentId !== undefined) {
      const nextParentId = dto.parentId?.trim() || null;
      if (nextParentId === id) {
        throw new BadRequestException('자기 자신을 상위 부서로 지정할 수 없습니다.');
      }
      if (nextParentId !== dept.parentId) {
        let parent = await this.resolveParent(nextParentId);
        if (!parent) {
          parent = await this.ensureRootDepartment();
        }
        if (parent.path && dept.path && parent.path.startsWith(`${dept.path}/`)) {
          throw new BadRequestException('하위 부서를 상위 부서로 지정할 수 없습니다.');
        }
        dept.parentId = parent.id;
        dept.depth = parent.depth + 1;
        dept.path = parent.path ? `${parent.path}/${dept.id}` : `/${dept.id}`;
        hierarchyChanged = true;
      }
    }

    const saved = await this.departmentRepo.save(dept);
    if (hierarchyChanged) {
      await this.rebuildSubtreePaths(saved);
    }
    return this.toDto(saved);
  }

  async move(id: string, dto: MoveDepartmentDto): Promise<DepartmentDto> {
    return this.departmentRepo.manager.transaction(async (manager: EntityManager) => {
      const deptRepo = manager.getRepository(Department);
      const dept = await deptRepo.findOne({ where: { id } });
      if (!dept) {
        throw new NotFoundException(`부서를 찾을 수 없습니다: ${id}`);
      }
      if (dept.isRoot) {
        throw new BadRequestException('최상위 부서는 이동하거나 순서를 변경할 수 없습니다.');
      }

      const oldParentId = dept.parentId;
      let targetParentId =
        dto.targetParentId === undefined ? oldParentId : dto.targetParentId?.trim() || null;

      if (!targetParentId) {
        const root = await deptRepo.findOne({ where: { isRoot: true } });
        targetParentId = root ? root.id : null;
      }

      if (targetParentId === id) {
        throw new BadRequestException('자기 자신을 상위 부서로 이동할 수 없습니다.');
      }

      let targetParent: Department | null = null;
      if (targetParentId) {
        targetParent = await deptRepo.findOne({ where: { id: targetParentId } });
        if (!targetParent) {
          throw new NotFoundException(`대상 상위 부서를 찾을 수 없습니다: ${targetParentId}`);
        }
        if (targetParent.path && dept.path && targetParent.path.startsWith(`${dept.path}/`)) {
          throw new BadRequestException('하위 부서로 이동할 수 없습니다.');
        }
      }

      const parentChanged = targetParentId !== oldParentId;
      if (parentChanged) {
        dept.parentId = targetParentId;
        dept.depth = targetParent ? targetParent.depth + 1 : 0;
        dept.path = targetParent?.path ? `${targetParent.path}/${dept.id}` : `/${dept.id}`;
      }

      // 대상 상위 부서의 기존 형제 목록 조회 (본인 제외)
      const targetSiblings = await deptRepo.find({
        where: { parentId: targetParentId ? targetParentId : IsNull() },
        order: { sortOrder: 'ASC', name: 'ASC' },
      });
      const filteredSiblings = targetSiblings.filter((s) => s.id !== dept.id);

      const insertIndex =
        dto.targetIndex !== undefined
          ? Math.max(0, Math.min(dto.targetIndex, filteredSiblings.length))
          : filteredSiblings.length;

      filteredSiblings.splice(insertIndex, 0, dept);

      for (let i = 0; i < filteredSiblings.length; i++) {
        filteredSiblings[i].sortOrder = i;
        await deptRepo.save(filteredSiblings[i]);
      }

      // 부모가 변경되었으면 이전 부모의 남은 형제들 sortOrder 정규화 + 하위 트리 path 재계산
      if (parentChanged) {
        const oldSiblings = await deptRepo.find({
          where: { parentId: oldParentId ? oldParentId : IsNull() },
          order: { sortOrder: 'ASC', name: 'ASC' },
        });
        for (let i = 0; i < oldSiblings.length; i++) {
          if (oldSiblings[i].sortOrder !== i) {
            oldSiblings[i].sortOrder = i;
            await deptRepo.save(oldSiblings[i]);
          }
        }
        await this.rebuildSubtreePaths(dept, deptRepo);
      }

      const reloaded = await deptRepo.findOne({ where: { id: dept.id } });
      return this.toDto(reloaded || dept);
    });
  }

  async remove(id: string): Promise<{ success: boolean; message: string }> {
    const dept = await this.departmentRepo.findOne({ where: { id } });
    if (!dept) {
      throw new NotFoundException(`부서를 찾을 수 없습니다: ${id}`);
    }
    if (dept.isRoot) {
      throw new BadRequestException('최상위 부서는 삭제할 수 없습니다.');
    }

    const childCount = await this.departmentRepo.count({ where: { parentId: id } });
    if (childCount > 0) {
      throw new BadRequestException('하위 부서가 존재하여 삭제할 수 없습니다. 하위 부서를 먼저 이동 또는 삭제해 주세요.');
    }

    const memberCount = await this.userRepo.count({ where: { departmentId: id } });
    if (memberCount > 0) {
      throw new BadRequestException('소속 사용자가 존재하여 삭제할 수 없습니다. 사용자를 다른 부서로 이동하거나 부서를 비활성화해 주세요.');
    }

    await this.departmentRepo.remove(dept);
    return { success: true, message: '부서가 삭제되었습니다.' };
  }

  private async resolveParent(parentId?: string | null): Promise<Department | null> {
    const normalized = parentId?.trim() || null;
    if (!normalized) return null;
    const parent = await this.departmentRepo.findOne({ where: { id: normalized } });
    if (!parent) {
      throw new NotFoundException(`상위 부서를 찾을 수 없습니다: ${normalized}`);
    }
    return parent;
  }

  private async rebuildSubtreePaths(parent: Department, repo: Repository<Department> = this.departmentRepo): Promise<void> {
    const children = await repo.find({ where: { parentId: parent.id } });
    for (const child of children) {
      child.depth = parent.depth + 1;
      child.path = parent.path ? `${parent.path}/${child.id}` : `/${child.id}`;
      const savedChild = await repo.save(child);
      await this.rebuildSubtreePaths(savedChild, repo);
    }
  }
}
