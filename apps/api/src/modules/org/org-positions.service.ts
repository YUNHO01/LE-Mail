import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { RankPresetType } from '@lemail/shared-types';
import { OrgRank, OrgTitle } from '../database/entities';
import {
  CreateOrgRankDto,
  CreateOrgTitleDto,
  UpdateOrgRankDto,
  UpdateOrgTitleDto,
} from './dto/positions.dto';

interface RankPresetSeed {
  level: number;
  name: string;
  code: string;
  description: string;
}

const RANK_PRESETS: Record<RankPresetType, RankPresetSeed[]> = {
  GENERAL: [
    { level: 10, name: '사원', code: 'GEN_10', description: '일반기업 기본 직급' },
    { level: 20, name: '주임', code: 'GEN_20', description: '일반기업 직급' },
    { level: 30, name: '대리', code: 'GEN_30', description: '일반기업 직급' },
    { level: 40, name: '과장', code: 'GEN_40', description: '일반기업 관리 직급' },
    { level: 50, name: '차장', code: 'GEN_50', description: '일반기업 관리 직급' },
    { level: 60, name: '부장', code: 'GEN_60', description: '일반기업 관리 직급' },
    { level: 70, name: '이사', code: 'GEN_70', description: '일반기업 임원 직급' },
    { level: 80, name: '상무', code: 'GEN_80', description: '일반기업 임원 직급' },
    { level: 90, name: '전무', code: 'GEN_90', description: '일반기업 임원 직급' },
    { level: 100, name: '부사장', code: 'GEN_100', description: '일반기업 임원 직급' },
    { level: 110, name: '사장', code: 'GEN_110', description: '일반기업 대표 직급' },
  ],
  PUBLIC_RESEARCH: [
    { level: 10, name: '연구원', code: 'PUB_10', description: '공공·연구기관 기본 직급' },
    { level: 20, name: '전임연구원', code: 'PUB_20', description: '공공·연구기관 직급' },
    { level: 30, name: '선임연구원', code: 'PUB_30', description: '공공·연구기관 직급' },
    { level: 40, name: '책임연구원', code: 'PUB_40', description: '공공·연구기관 직급' },
    { level: 50, name: '수석연구원', code: 'PUB_50', description: '공공·연구기관 직급' },
    { level: 60, name: '연구위원', code: 'PUB_60', description: '공공·연구기관 고위 직급' },
    { level: 70, name: '원장', code: 'PUB_70', description: '공공·연구기관 기관장' },
  ],
  MANUFACTURING: [
    { level: 10, name: '사원', code: 'MFG_10', description: '제조·생산 기본 직급' },
    { level: 20, name: '조장', code: 'MFG_20', description: '제조·생산 현장 직급' },
    { level: 30, name: '반장', code: 'MFG_30', description: '제조·생산 현장 직급' },
    { level: 40, name: '직장', code: 'MFG_40', description: '제조·생산 현장 관리자' },
    { level: 50, name: '계장', code: 'MFG_50', description: '제조·생산 직급' },
    { level: 60, name: '과장', code: 'MFG_60', description: '제조·생산 관리 직급' },
    { level: 70, name: '차장', code: 'MFG_70', description: '제조·생산 관리 직급' },
    { level: 80, name: '부장', code: 'MFG_80', description: '제조·생산 관리 직급' },
    { level: 90, name: '공장장', code: 'MFG_90', description: '제조·생산 사업장 총괄' },
    { level: 100, name: '임원', code: 'MFG_100', description: '제조·생산 임원 직급' },
  ],
};

@Injectable()
export class OrgPositionsService {
  constructor(
    @InjectRepository(OrgRank)
    private readonly rankRepo: Repository<OrgRank>,
    @InjectRepository(OrgTitle)
    private readonly titleRepo: Repository<OrgTitle>,
  ) {}

  // ==================== 직급 (Ranks) ====================

  async findAllRanks(): Promise<OrgRank[]> {
    return this.rankRepo.find({
      order: { level: 'ASC', name: 'ASC' },
    });
  }

  async createRank(dto: CreateOrgRankDto): Promise<OrgRank> {
    const code = dto.code.trim();
    const name = dto.name.trim();
    if (!code || !name) {
      throw new BadRequestException('직위명과 직위코드를 입력해 주세요.');
    }

    const existing = await this.rankRepo.findOne({ where: { code } });
    if (existing) {
      throw new ConflictException(`이미 존재하는 직위코드입니다: ${code}`);
    }

    const entity = this.rankRepo.create({
      level: dto.level,
      name,
      code,
      description: dto.description?.trim() || null,
    });
    return this.rankRepo.save(entity);
  }

  async updateRank(id: string, dto: UpdateOrgRankDto): Promise<OrgRank> {
    const rank = await this.rankRepo.findOne({ where: { id } });
    if (!rank) {
      throw new NotFoundException('직급 정보를 찾을 수 없습니다.');
    }

    if (dto.code !== undefined) {
      const nextCode = dto.code.trim();
      if (!nextCode) {
        throw new BadRequestException('직위코드는 비워둘 수 없습니다.');
      }
      if (nextCode !== rank.code) {
        const dup = await this.rankRepo.findOne({ where: { code: nextCode } });
        if (dup) {
          throw new ConflictException(`이미 존재하는 직위코드입니다: ${nextCode}`);
        }
      }
      rank.code = nextCode;
    }

    if (dto.name !== undefined) {
      const nextName = dto.name.trim();
      if (!nextName) {
        throw new BadRequestException('직위명은 비워둘 수 없습니다.');
      }
      rank.name = nextName;
    }

    if (dto.level !== undefined) {
      rank.level = dto.level;
    }

    if (dto.description !== undefined) {
      rank.description = dto.description?.trim() || null;
    }

    return this.rankRepo.save(rank);
  }

  async bulkDeleteRanks(ids: string[]): Promise<{ deletedCount: number }> {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    if (uniqueIds.length === 0) {
      return { deletedCount: 0 };
    }
    const result = await this.rankRepo.delete({ id: In(uniqueIds) });
    return { deletedCount: result.affected ?? 0 };
  }

  async applyRankPreset(
    preset: RankPresetType,
  ): Promise<{ addedCount: number; skippedCount: number; items: OrgRank[] }> {
    const seeds = RANK_PRESETS[preset];
    if (!seeds) {
      throw new BadRequestException('지원하지 않는 업종 템플릿입니다.');
    }

    const existing = await this.rankRepo.find();
    const existingCodes = new Set(existing.map((r) => r.code.toLowerCase()));
    const existingNames = new Set(existing.map((r) => r.name.trim()));

    const toInsert: OrgRank[] = [];
    let skippedCount = 0;

    for (const seed of seeds) {
      if (existingCodes.has(seed.code.toLowerCase()) || existingNames.has(seed.name)) {
        skippedCount += 1;
        continue;
      }
      toInsert.push(
        this.rankRepo.create({
          level: seed.level,
          name: seed.name,
          code: seed.code,
          description: seed.description,
        }),
      );
      existingCodes.add(seed.code.toLowerCase());
      existingNames.add(seed.name);
    }

    if (toInsert.length > 0) {
      await this.rankRepo.save(toInsert);
    }

    const items = await this.findAllRanks();
    return {
      addedCount: toInsert.length,
      skippedCount,
      items,
    };
  }

  // ==================== 직책 (Titles) ====================

  async findAllTitles(): Promise<OrgTitle[]> {
    return this.titleRepo.find({
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  async createTitle(dto: CreateOrgTitleDto): Promise<OrgTitle> {
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('직책명을 입력해 주세요.');
    }

    const entity = this.titleRepo.create({
      sortOrder: dto.sortOrder,
      name,
      description: dto.description?.trim() || null,
    });
    return this.titleRepo.save(entity);
  }

  async updateTitle(id: string, dto: UpdateOrgTitleDto): Promise<OrgTitle> {
    const title = await this.titleRepo.findOne({ where: { id } });
    if (!title) {
      throw new NotFoundException('직책 정보를 찾을 수 없습니다.');
    }

    if (dto.name !== undefined) {
      const nextName = dto.name.trim();
      if (!nextName) {
        throw new BadRequestException('직책명은 비워둘 수 없습니다.');
      }
      title.name = nextName;
    }

    if (dto.sortOrder !== undefined) {
      title.sortOrder = dto.sortOrder;
    }

    if (dto.description !== undefined) {
      title.description = dto.description?.trim() || null;
    }

    return this.titleRepo.save(title);
  }

  async bulkDeleteTitles(ids: string[]): Promise<{ deletedCount: number }> {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    if (uniqueIds.length === 0) {
      return { deletedCount: 0 };
    }
    const result = await this.titleRepo.delete({ id: In(uniqueIds) });
    return { deletedCount: result.affected ?? 0 };
  }
}
