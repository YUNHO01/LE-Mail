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
import { SpamService } from '../spam/spam.service';
import { MailQueryDto } from './dto/mail-query.dto';
import { SendMailDto } from './dto/send-mail.dto';
import { SaveDraftDto } from './dto/save-draft.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../database/entities';

@ApiTags('Mails')
@Controller('mails')
export class MailController {
  constructor(
    private readonly mailService: MailService,
    private readonly spamService: SpamService,
  ) {}

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

  @Post('bulk-delete')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '선택한 메일 일괄 삭제 (일반삭제 또는 영구완전삭제)' })
  @ApiResponse({ status: 200, description: '일괄 삭제 완료' })
  bulkDelete(
    @CurrentUser() user: User,
    @Body('ids') ids: string[],
    @Body('permanent') permanent?: boolean,
    @Body('folderId') folderId?: string,
  ) {
    return this.mailService.bulkDelete(user.id, ids || [], folderId, Boolean(permanent));
  }

  @Post('bulk-move')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '선택한 메일 일괄 편지함 이동' })
  @ApiResponse({ status: 200, description: '일괄 이동 완료' })
  bulkMove(
    @CurrentUser() user: User,
    @Body('ids') ids: string[],
    @Body('targetFolderId') targetFolderId: string,
  ) {
    return this.mailService.bulkMove(user.id, ids || [], targetFolderId);
  }

  @Post('bulk-retry')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '선택한 메일 일괄 재발송 시도' })
  @ApiResponse({ status: 200, description: '일괄 재발송 결과' })
  bulkRetrySendMail(@CurrentUser() user: User, @Body('ids') ids: string[]) {
    return this.mailService.bulkRetrySendMail(ids || [], user);
  }

  @Post(':id/retry')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '발송 실패 메일 단건 재발송 시도' })
  @ApiParam({ name: 'id', description: '메일 고유 ID' })
  @ApiResponse({ status: 200, description: '재발송 결과' })
  retrySendMail(@CurrentUser() user: User, @Param('id') id: string) {
    return this.mailService.retrySendMail(id, user);
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '메일 목록 조회 (페이징, 사서함별, 편지함별, 검색)' })
  @ApiResponse({ status: 200, description: '메일 목록 및 페이징 정보' })
  findAll(@CurrentUser() user: User, @Query() query: MailQueryDto) {
    return this.mailService.findAll(query, user?.id);
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
    @Body('folderId') folderId?: string,
  ) {
    return this.mailService.markRead(user.id, id, Boolean(isRead), folderId);
  }

  @Patch(':id/star')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '메일 중요(별표) 설정/해제' })
  @ApiParam({ name: 'id', description: '메일 고유 ID' })
  @ApiResponse({ status: 200, description: '처리 완료' })
  markStarred(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body('isStarred') isStarred: boolean,
    @Body('folderId') folderId?: string,
  ) {
    return this.mailService.markStarred(user.id, id, Boolean(isStarred), folderId);
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '메일 상세 조회 (본문 Text/HTML 및 첨부파일 목록, 자동 읽음 처리)' })
  @ApiParam({ name: 'id', description: '메일 고유 ID' })
  @ApiResponse({ status: 200, description: '메일 상세 정보 반환' })
  @ApiResponse({ status: 404, description: '메일을 찾을 수 없음' })
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Query('folderId') folderId?: string,
  ) {
    return this.mailService.findOne(id, user?.id, folderId);
  }

  @Get(':id/raw')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '원본 EML 파일 다운로드' })
  @ApiParam({ name: 'id', description: '메일 고유 ID' })
  async downloadRaw(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const filePath = await this.mailService.getRawFilePath(id, user?.id);
    res.download(filePath, `${id}.eml`);
  }

  @Get(':id/attachments/:attachmentId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '메일 첨부파일 다운로드' })
  @ApiParam({ name: 'id', description: '메일 고유 ID' })
  @ApiParam({ name: 'attachmentId', description: '첨부파일 고유 ID' })
  async downloadAttachment(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response,
  ) {
    const att = await this.mailService.getAttachment(id, attachmentId, user?.id);
    res.setHeader('Content-Type', att.contentType);
    res.download(att.path, att.filename);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      '메일 삭제 (일반함은 휴지통 이동, permanent=true 또는 휴지통은 완전삭제 및 마지막 참조자일 때 물리 파일 삭제)',
  })
  @ApiParam({ name: 'id', description: '메일 고유 ID' })
  @ApiResponse({ status: 200, description: '삭제/이동 완료' })
  delete(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query('folderId') folderId?: string,
    @Query('permanent') permanent?: string,
  ) {
    if (user && user.id) {
      return this.mailService.deleteUserMail(
        user.id,
        id,
        folderId,
        permanent === 'true' || permanent === '1',
      );
    }
    return this.mailService.delete(id);
  }

  @Post(':id/report-spam')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '스팸 메일 신고 및 발신자 차단' })
  @ApiParam({ name: 'id', description: '메일 고유 ID' })
  @ApiResponse({ status: 200, description: '스팸 이동 및 차단 완료' })
  reportSpam(@CurrentUser() user: User, @Param('id') id: string) {
    return this.spamService.reportSpam(user.id, id);
  }

  @Post(':id/unreport-spam')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '스팸 해제 및 정상 메일 복원' })
  @ApiParam({ name: 'id', description: '메일 고유 ID' })
  @ApiResponse({ status: 200, description: '받은편지함 복원 및 허용 완료' })
  unreportSpam(@CurrentUser() user: User, @Param('id') id: string) {
    return this.spamService.unreportSpam(user.id, id);
  }
}
