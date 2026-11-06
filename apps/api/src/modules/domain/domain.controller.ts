import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { DomainService } from './domain.service';
import { CreateDomainDto } from './dto/create-domain.dto';
import { UpdateDomainDto } from './dto/update-domain.dto';
import { DomainQueryDto } from './dto/domain-query.dto';

@ApiTags('Domains')
@Controller('domains')
export class DomainController {
  constructor(private readonly domainService: DomainService) {}

  @Get()
  @ApiOperation({ summary: '도메인 목록 조회 (페이징, 검색, 필터)' })
  @ApiResponse({ status: 200, description: '도메인 목록 및 통계 반환' })
  findAll(@Query() query: DomainQueryDto) {
    return this.domainService.findAll(query);
  }

  @Get('active')
  @ApiOperation({ summary: '활성화된 도메인 목록 조회 (사서함/유저 등록용)' })
  @ApiResponse({ status: 200, description: '활성 도메인 목록' })
  findActive() {
    return this.domainService.findActiveDomains();
  }

  @Get(':id')
  @ApiOperation({ summary: '도메인 단일 상세 조회' })
  @ApiParam({ name: 'id', description: '도메인 고유 ID' })
  @ApiResponse({ status: 200, description: '도메인 상세 정보' })
  @ApiResponse({ status: 404, description: '도메인을 찾을 수 없음' })
  findOne(@Param('id') id: string) {
    return this.domainService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: '신규 도메인 등록' })
  @ApiResponse({ status: 201, description: '도메인 생성 완료' })
  @ApiResponse({ status: 409, description: '이미 존재하는 도메인 또는 유효하지 않은 도메인' })
  create(@Body() dto: CreateDomainDto) {
    return this.domainService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '도메인 정보 수정 (활성화 상태, 기본 도메인 설정 등)' })
  @ApiParam({ name: 'id', description: '도메인 고유 ID' })
  @ApiResponse({ status: 200, description: '수정 완료' })
  update(@Param('id') id: string, @Body() dto: UpdateDomainDto) {
    return this.domainService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '도메인 삭제' })
  @ApiParam({ name: 'id', description: '도메인 고유 ID' })
  @ApiResponse({ status: 200, description: '삭제 완료' })
  @ApiResponse({ status: 409, description: '사서함이 속해있거나 기본 도메인인 경우 삭제 불가' })
  remove(@Param('id') id: string) {
    return this.domainService.remove(id);
  }
}
