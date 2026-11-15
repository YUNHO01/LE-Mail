import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import {
  CreateIntegrationApiKeyResponse,
  IntegrationApiKeyItem,
  McpApiKeyScope,
} from '@lemail/shared-types';
import { IntegrationApiKey, User } from '../database/entities';
import { CreateApiKeyDto } from './dto/api-key.dto';

@Injectable()
export class ApiKeyService {
  constructor(
    @InjectRepository(IntegrationApiKey)
    private readonly apiKeyRepository: Repository<IntegrationApiKey>,
    private readonly jwtService: JwtService,
  ) {}

  private hashKey(rawKey: string): string {
    return crypto.createHash('sha256').update(rawKey.trim()).digest('hex');
  }

  private toItem(entity: IntegrationApiKey): IntegrationApiKeyItem {
    return {
      id: entity.id,
      userId: entity.userId,
      name: entity.name,
      description: entity.description,
      keyPrefix: entity.keyPrefix,
      scopes: Array.isArray(entity.scopes) ? entity.scopes : [],
      isActive: entity.isActive,
      expiresAt: entity.expiresAt ? entity.expiresAt.toISOString() : null,
      lastUsedAt: entity.lastUsedAt ? entity.lastUsedAt.toISOString() : null,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }

  /**
   * 개인 MCP 연동 API Key 발급 (원본 키는 발급 직후 1회만 반환)
   */
  async createApiKey(
    userId: string,
    dto: CreateApiKeyDto,
  ): Promise<CreateIntegrationApiKeyResponse> {
    let parsedExpiresAt: Date | null = null;
    if (dto.expiresAt) {
      parsedExpiresAt = new Date(dto.expiresAt);
      if (Number.isNaN(parsedExpiresAt.getTime()) || parsedExpiresAt.getTime() <= Date.now()) {
        throw new BadRequestException('만료 일시는 현재 시각 이후여야 합니다.');
      }
    }

    const uniqueScopes = Array.from(new Set(dto.scopes));
    const rawKey = `lem_${crypto.randomBytes(32).toString('hex')}`;
    const keyPrefix = rawKey.slice(0, 12);
    const keyHash = this.hashKey(rawKey);

    const entity = this.apiKeyRepository.create({
      userId,
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      keyPrefix,
      keyHash,
      scopes: uniqueScopes,
      isActive: true,
      expiresAt: parsedExpiresAt,
      lastUsedAt: null,
    });

    const saved = await this.apiKeyRepository.save(entity);
    return {
      ...this.toItem(saved),
      rawKey,
    };
  }

  /**
   * 내 API Key 목록 조회
   */
  async listApiKeys(userId: string): Promise<IntegrationApiKeyItem[]> {
    const keys = await this.apiKeyRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return keys.map((k) => this.toItem(k));
  }

  /**
   * 내 API Key 활성/비활성 전환
   */
  async toggleApiKey(userId: string, keyId: string): Promise<IntegrationApiKeyItem> {
    const entity = await this.apiKeyRepository.findOne({
      where: { id: keyId, userId },
    });
    if (!entity) {
      throw new NotFoundException('요청한 API Key를 찾을 수 없습니다.');
    }

    entity.isActive = !entity.isActive;
    const saved = await this.apiKeyRepository.save(entity);
    return this.toItem(saved);
  }

  /**
   * 내 API Key 영구 폐기(삭제)
   */
  async deleteApiKey(userId: string, keyId: string): Promise<{ success: boolean }> {
    const entity = await this.apiKeyRepository.findOne({
      where: { id: keyId, userId },
    });
    if (!entity) {
      throw new NotFoundException('요청한 API Key를 찾을 수 없습니다.');
    }

    await this.apiKeyRepository.remove(entity);
    return { success: true };
  }

  /**
   * API Key 검증 및 사용자 컨텍스트/스코프 반환
   */
  async validateApiKey(
    rawKey: string,
    requiredScope?: McpApiKeyScope,
  ): Promise<{ user: User; scopes: McpApiKeyScope[]; apiKey: IntegrationApiKey }> {
    if (!rawKey || typeof rawKey !== 'string' || !rawKey.trim()) {
      throw new UnauthorizedException('API Key가 전달되지 않았습니다.');
    }

    const keyHash = this.hashKey(rawKey);
    const keyEntity = await this.apiKeyRepository.findOne({
      where: { keyHash },
      relations: { user: true },
    });

    if (!keyEntity || !keyEntity.isActive) {
      throw new UnauthorizedException('유효하지 않거나 비활성화된 API Key입니다.');
    }

    if (keyEntity.expiresAt && keyEntity.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('만료된 API Key입니다.');
    }

    if (!keyEntity.user || !keyEntity.user.isActive) {
      throw new UnauthorizedException('비활성화된 사용자 계정의 API Key입니다.');
    }

    const scopes = Array.isArray(keyEntity.scopes) ? keyEntity.scopes : [];
    if (requiredScope && !scopes.includes(requiredScope)) {
      throw new ForbiddenException(`필요한 권한 스코프(${requiredScope})가 없습니다.`);
    }

    await this.apiKeyRepository.update(keyEntity.id, { lastUsedAt: new Date() });

    return {
      user: keyEntity.user,
      scopes,
      apiKey: keyEntity,
    };
  }

  /**
   * API Key를 검증하여 JWT 액세스 토큰 및 스코프 정보로 교환 (Stdio MCP 클라이언트용)
   */
  async exchangeApiKey(rawKey: string) {
    const { user, scopes } = await this.validateApiKey(rawKey);
    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      accessToken,
      scopes,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }
}
