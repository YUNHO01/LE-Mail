import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import type { Response } from 'express';
import { MailService } from './mail.service';
import { MailQueryDto } from './dto/mail-query.dto';
import { SendMailDto } from './dto/send-mail.dto';
import { SaveDraftDto } from './dto/save-draft.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../database/entities';

@ApiTags('Mails')
@Controller('mails')
export class MailController {
  constructor(private readonly mailService: MailService) {}

  @Post('send')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '새 메일 작성 및 발송' })
  @ApiResponse({ status: 201, description: '메일 발송 성공 및 보낸편지함 저장' })
  sendMail(@CurrentUser() user: User, @Body() dto: SendMailDto) {
    return this.mailService.sendMail(user, dto);
  }

  @Post('drafts')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '작성 중인 메일 임시저장' })
  @ApiResponse({ status: 201, description: '임시보관함 저장 성공' })
  saveDraft(@CurrentUser() user: User, @Body() dto: SaveDraftDto) {
    return this.mailService.saveDraft(user, dto);
  }

  @Get()
  @ApiOperation({ summary: '메일 목록 조회 (페이징, 사서함별, 편지함별, 검색)' })
  @ApiResponse({ status: 200, description: '메일 목록 및 페이징 정보' })
  findAll(@Query() query: MailQueryDto) {
    return this.mailService.findAll(query);
  }

  @Patch(':id/move')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '메일을 다른 편지함으로 이동' })
  @ApiParam({ name: 'id', description: '메일 고유 ID' })
  @ApiResponse({ status: 200, description: '이동 완료' })
  move(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body('targetFolderId') targetFolderId: string,
  ) {
    return this.mailService.moveMail(user.id, id, targetFolderId);
  }

  @Patch(':id/read')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '메일 읽음/안읽음 처리' })
  @ApiParam({ name: 'id', description: '메일 고유 ID' })
  @ApiResponse({ status: 200, description: '처리 완료' })
  markRead(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body('isRead') isRead: boolean,
  ) {
    return this.mailService.markRead(user.id, id, isRead);
  }

  @Get(':id')
  @ApiOperation({ summary: '메일 상세 조회 (본문 Text/HTML 및 첨부파일 목록)' })
  @ApiParam({ name: 'id', description: '메일 고유 ID' })
  @ApiResponse({ status: 200, description: '메일 상세 정보 반환' })
  @ApiResponse({ status: 404, description: '메일을 찾을 수 없음' })
  findOne(@Param('id') id: string) {
    return this.mailService.findOne(id);
  }

  @Get(':id/raw')
  @ApiOperation({ summary: '원본 EML 파일 다운로드' })
  @ApiParam({ name: 'id', description: '메일 고유 ID' })
  async downloadRaw(@Param('id') id: string, @Res() res: Response) {
    const filePath = await this.mailService.getRawFilePath(id);
    res.download(filePath, `${id}.eml`);
  }

  @Get(':id/attachments/:attachmentId')
  @ApiOperation({ summary: '메일 첨부파일 다운로드' })
  @ApiParam({ name: 'id', description: '메일 고유 ID' })
  @ApiParam({ name: 'attachmentId', description: '첨부파일 고유 ID' })
  async downloadAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response,
  ) {
    const att = await this.mailService.getAttachment(id, attachmentId);
    res.setHeader('Content-Type', att.contentType);
    res.download(att.path, att.filename);
  }

  @Delete(':id')
  @ApiOperation({ summary: '메일 삭제 및 스토리지 파일 정리' })
  @ApiParam({ name: 'id', description: '메일 고유 ID' })
  @ApiResponse({ status: 200, description: '삭제 완료' })
  delete(@Param('id') id: string) {
    return this.mailService.delete(id);
  }
}
