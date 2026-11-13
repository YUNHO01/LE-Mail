import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Department, User } from '../database/entities';
import { DepartmentDto } from '@lemail/shared-types';
import { CreateDepartmentDto, UpdateDepartmentDto } from './dto/department.dto';

export interface DepartmentTreeNode extends DepartmentDto {
  userCount: number;
  children: DepartmentTreeNode[];
}

@Injectable()
export class DepartmentsService {
  constructor(
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

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

    const parent = await this.resolveParent(dto.parentId);
    const dept = this.departmentRepo.create({
      name: dto.name.trim(),
      code: normalizedCode,
      parentId: parent ? parent.id : null,
      depth: parent ? parent.depth + 1 : 0,
      sortOrder: dto.sortOrder ?? 0,
      managerEmployeeId: dto.managerEmployeeId?.trim() || null,
      source: 'LOCAL',
      isActive: dto.isActive ?? true,
    });

    const saved = await this.departmentRepo.save(dept);
    saved.path = parent?.path ? `${parent.path}/${saved.id}` : `/${saved.id}`;
    const updated = await this.departmentRepo.save(saved);
    return this.toDto(updated);
  }

  async update(id: string, dto: UpdateDepartmentDto): Promise<DepartmentDto> {
    const dept = await this.departmentRepo.findOne({ where: { id } });
    if (!dept) {
      throw new NotFoundException(`부서를 찾을 수 없습니다: ${id}`);
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

    if (dto.name !== undefined) dept.name = dto.name.trim();
    if (dto.sortOrder !== undefined) dept.sortOrder = dto.sortOrder;
    if (dto.managerEmployeeId !== undefined) {
      dept.managerEmployeeId = dto.managerEmployeeId?.trim() || null;
    }
    if (dto.isActive !== undefined) dept.isActive = dto.isActive;

    let hierarchyChanged = false;
    if (dto.parentId !== undefined) {
      const nextParentId = dto.parentId?.trim() || null;
      if (nextParentId === id) {
        throw new BadRequestException('자기 자신을 상위 부서로 지정할 수 없습니다.');
      }
      if (nextParentId !== dept.parentId) {
        const parent = await this.resolveParent(nextParentId);
        if (parent && parent.path && dept.path && parent.path.startsWith(`${dept.path}/`)) {
          throw new BadRequestException('하위 부서를 상위 부서로 지정할 수 없습니다.');
        }
        dept.parentId = parent ? parent.id : null;
        dept.depth = parent ? parent.depth + 1 : 0;
        dept.path = parent?.path ? `${parent.path}/${dept.id}` : `/${dept.id}`;
        hierarchyChanged = true;
      }
    }

    const saved = await this.departmentRepo.save(dept);
    if (hierarchyChanged) {
      await this.rebuildSubtreePaths(saved);
    }
    return this.toDto(saved);
  }

  async remove(id: string): Promise<{ success: boolean; message: string }> {
    const dept = await this.departmentRepo.findOne({ where: { id } });
    if (!dept) {
      throw new NotFoundException(`부서를 찾을 수 없습니다: ${id}`);
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

  private async rebuildSubtreePaths(parent: Department): Promise<void> {
    const children = await this.departmentRepo.find({ where: { parentId: parent.id } });
    for (const child of children) {
      child.depth = parent.depth + 1;
      child.path = parent.path ? `${parent.path}/${child.id}` : `/${child.id}`;
      const savedChild = await this.departmentRepo.save(child);
      await this.rebuildSubtreePaths(savedChild);
    }
  }
}
