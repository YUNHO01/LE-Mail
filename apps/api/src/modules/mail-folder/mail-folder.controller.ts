import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { MailFolderService } from './mail-folder.service';
import { CreateMailFolderDto } from './dto/create-mail-folder.dto';
import { UpdateMailFolderDto } from './dto/update-mail-folder.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../database/entities';

@ApiTags('MailFolders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('mail-folders')
export class MailFolderController {
  constructor(private readonly folderService: MailFolderService) {}

  @Get()
  @ApiOperation({
    summary: '편지함 트리 목록 조회',
    description: '로그인 사용자의 기본 편지함 및 계층형 트리 구조 편지함 목록과 안 읽은 메일 수를 조회합니다.',
  })
  @ApiResponse({ status: 200, description: '편지함 목록 조회 성공' })
  async getTree(@CurrentUser() user: User) {
    return this.folderService.getFolderTree(user.id);
  }

  @Post()
  @ApiOperation({
    summary: '하위 편지함 생성',
    description: '개인편지함 또는 특정 상위 편지함 하위에 새로운 하위 편지함을 생성합니다.',
  })
  @ApiResponse({ status: 201, description: '편지함 생성 성공' })
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateMailFolderDto,
  ) {
    return this.folderService.createFolder(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: '편지함 수정 (이름 변경 / 위치 이동)',
    description: '하위 편지함의 이름, 순서 또는 상위 편지함 위치(트리 재배치)를 변경합니다.',
  })
  @ApiResponse({ status: 200, description: '편지함 수정 성공' })
  async update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateMailFolderDto,
  ) {
    return this.folderService.updateFolder(user.id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: '편지함 삭제',
    description: '하위 편지함을 삭제하고 소속된 메일을 휴지통으로 이동합니다. 시스템 기본 편지함은 삭제할 수 없습니다.',
  })
  @ApiResponse({ status: 200, description: '편지함 삭제 성공' })
  async remove(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    return this.folderService.deleteFolder(user.id, id);
  }
}
