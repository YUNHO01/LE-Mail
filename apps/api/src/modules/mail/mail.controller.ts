import {
  Controller,
  Get,
  Delete,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import type { Response } from 'express';
import { MailService } from './mail.service';
import { MailQueryDto } from './dto/mail-query.dto';

@ApiTags('Mails')
@Controller('mails')
export class MailController {
  constructor(private readonly mailService: MailService) {}

  @Get()
  @ApiOperation({ summary: '메일 목록 조회 (페이징, 사서함별, 검색)' })
  @ApiResponse({ status: 200, description: '메일 목록 및 페이징 정보' })
  findAll(@Query() query: MailQueryDto) {
    return this.mailService.findAll(query);
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
