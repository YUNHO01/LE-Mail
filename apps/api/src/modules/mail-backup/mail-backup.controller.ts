import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { MailBackupService } from './mail-backup.service';
import { RequestMailBackupDto } from './dto/request-mail-backup.dto';

@ApiTags('Mailbox Backup')
@Controller('mail/backup')
export class MailBackupController {
  constructor(private readonly backupService: MailBackupService) {}

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: '내 메일함 백업 이력 조회',
    description: '현재 로그인한 사용자의 메일함 백업 요청 및 생성 목록을 조회합니다.',
  })
  async getMyBackups(@CurrentUser() user: any) {
    return this.backupService.getMyBackups(user.id);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: '메일함 백업 파일 생성 요청',
    description:
      '전체 메일함 또는 지정된 특정 편지함의 메일들을 .zip 압축 파일로 패키징하는 백그라운드 작업을 요청합니다.',
  })
  async requestBackup(
    @CurrentUser() user: any,
    @Body() dto: RequestMailBackupDto,
  ) {
    return this.backupService.requestBackup(user.id, dto);
  }

  @Get('download/:token')
  @ApiOperation({
    summary: '백업 압축 파일 다운로드 (링크 제공)',
    description:
      '유효한 다운로드 토큰을 통해 생성된 백업 ZIP 파일을 다운로드합니다. 만료일 이후에는 다운로드할 수 없습니다.',
  })
  async downloadBackup(@Param('token') token: string, @Res() res: Response) {
    const { filePath, fileName } = await this.backupService.getBackupFileForDownload(token);

    const encodedFileName = encodeURIComponent(fileName);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodedFileName}"; filename*=UTF-8''${encodedFileName}`,
    );

    res.download(filePath, fileName, (err) => {
      if (err && !res.headersSent) {
        res.status(500).send('파일 전송 중 오류가 발생했습니다.');
      }
    });
  }
}
