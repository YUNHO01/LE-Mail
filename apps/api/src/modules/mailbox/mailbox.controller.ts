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
import { MailboxService } from './mailbox.service';
import { CreateMailboxDto } from './dto/create-mailbox.dto';
import { UpdateMailboxDto } from './dto/update-mailbox.dto';
import { MailboxQueryDto } from './dto/mailbox-query.dto';

@ApiTags('Mailboxes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SYSTEM_ADMIN)
@Controller('mailboxes')
export class MailboxController {
  constructor(private readonly mailboxService: MailboxService) {}

  @Get('statistics')
  @ApiOperation({ summary: '사서함 및 도메인 통계 조회 (관리자 전용)' })
  @ApiResponse({ status: 200, description: '통계 정보 반환' })
  getStatistics() {
    return this.mailboxService.getStatistics();
  }

  @Get()
  @ApiOperation({ summary: '사서함 목록 조회 (관리자 전용)' })
  @ApiResponse({ status: 200, description: '사서함 목록 및 페이징 정보' })
  findAll(@Query() query: MailboxQueryDto) {
    return this.mailboxService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: '사서함 단일 상세 조회 (관리자 전용)' })
  @ApiParam({ name: 'id', description: '사서함 고유 ID' })
  @ApiResponse({ status: 200, description: '사서함 상세 정보' })
  @ApiResponse({ status: 404, description: '사서함을 찾을 수 없음' })
  findOne(@Param('id') id: string) {
    return this.mailboxService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: '신규 사서함 생성 (관리자 전용)' })
  @ApiResponse({ status: 201, description: '생성 완료' })
  @ApiResponse({ status: 409, description: '이미 존재하는 이메일' })
  create(@Body() dto: CreateMailboxDto) {
    return this.mailboxService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '사서함 정보 수정 (관리자 전용)' })
  @ApiParam({ name: 'id', description: '사서함 고유 ID' })
  @ApiResponse({ status: 200, description: '수정 완료' })
  update(@Param('id') id: string, @Body() dto: UpdateMailboxDto) {
    return this.mailboxService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '사서함 삭제 (관리자 전용)' })
  @ApiParam({ name: 'id', description: '사서함 고유 ID' })
  @ApiResponse({ status: 200, description: '삭제 완료' })
  delete(@Param('id') id: string) {
    return this.mailboxService.delete(id);
  }
}
