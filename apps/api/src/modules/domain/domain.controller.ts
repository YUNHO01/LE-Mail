import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@lemail/shared-types';
import { DomainService } from './domain.service';
import { DomainHealthService } from './domain-health.service';
import { CreateDomainDto } from './dto/create-domain.dto';
import { UpdateDomainDto } from './dto/update-domain.dto';
import { DomainQueryDto } from './dto/domain-query.dto';

@ApiTags('Domains')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('domains')
export class DomainController {
  constructor(
    private readonly domainService: DomainService,
    private readonly healthService: DomainHealthService,
  ) {}

  @Get()
  @Roles(UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: '도메인 목록 조회 (관리자 전용)' })
  @ApiResponse({ status: 200, description: '도메인 목록 및 통계 반환' })
  findAll(@Query() query: DomainQueryDto) {
    return this.domainService.findAll(query);
  }

  @Get('active')
  @ApiOperation({ summary: '활성화된 도메인 목록 조회 (인증 사용자용)' })
  @ApiResponse({ status: 200, description: '활성 도메인 목록' })
  findActive() {
    return this.domainService.findActiveDomains();
  }

  @Get(':id')
  @Roles(UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: '도메인 단일 상세 조회 (관리자 전용)' })
  @ApiParam({ name: 'id', description: '도메인 고유 ID' })
  @ApiResponse({ status: 200, description: '도메인 상세 정보' })
  @ApiResponse({ status: 404, description: '도메인을 찾을 수 없음' })
  findOne(@Param('id') id: string) {
    return this.domainService.findOne(id);
  }

  @Post()
  @Roles(UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: '신규 도메인 등록 (관리자 전용)' })
  @ApiResponse({ status: 201, description: '도메인 생성 완료' })
  @ApiResponse({ status: 409, description: '이미 존재하는 도메인 또는 유효하지 않은 도메인' })
  create(@Body() dto: CreateDomainDto) {
    return this.domainService.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: '도메인 정보 수정 (관리자 전용)' })
  @ApiParam({ name: 'id', description: '도메인 고유 ID' })
  @ApiResponse({ status: 200, description: '수정 완료' })
  update(@Param('id') id: string, @Body() dto: UpdateDomainDto) {
    return this.domainService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: '도메인 삭제 (관리자 전용)' })
  @ApiParam({ name: 'id', description: '도메인 고유 ID' })
  @ApiResponse({ status: 200, description: '삭제 완료' })
  @ApiResponse({ status: 409, description: '사서함이 속해있거나 기본 도메인인 경우 삭제 불가' })
  remove(@Param('id') id: string) {
    return this.domainService.remove(id);
  }

  @Post(':id/generate-dkim')
  @Roles(UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: '도메인 아웃바운드 발신용 DKIM 키 쌍 생성 (관리자 전용)' })
  @ApiParam({ name: 'id', description: '도메인 고유 ID' })
  @ApiResponse({ status: 200, description: 'DKIM 키 생성 및 DNS 레코드 반환' })
  generateDkim(@Param('id') id: string, @Body() body?: { selector?: string }) {
    return this.domainService.generateDkimKey(id, body?.selector || 'default');
  }

  @Get(':id/dkim')
  @Roles(UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: '도메인의 DKIM DNS 레코드 정보 조회 (관리자 전용)' })
  @ApiParam({ name: 'id', description: '도메인 고유 ID' })
  @ApiResponse({ status: 200, description: 'DKIM DNS 레코드 정보 반환' })
  getDkim(@Param('id') id: string) {
    return this.domainService.getDkimDnsInfo(id);
  }

  @Get(':id/health-check')
  @Roles(UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: '도메인의 DNS 보안 4종(MX/SPF/DKIM/DMARC) 및 RBL 평판 실시간 진단 (관리자 전용)' })
  @ApiParam({ name: 'id', description: '도메인 고유 ID' })
  @ApiResponse({ status: 200, description: '실시간 DNS 보안 진단 리포트 반환' })
  checkHealth(@Param('id') id: string) {
    return this.healthService.checkDomainHealth(id);
  }
}
