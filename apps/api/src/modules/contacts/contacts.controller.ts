import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
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
import { ContactsService } from './contacts.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { ImportContactsDto } from './dto/import-contacts.dto';
import { BulkDeleteContactsDto } from './dto/bulk-delete.dto';

@ApiTags('Contacts & Address Book')
@Controller('contacts')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get()
  @ApiOperation({
    summary: '주소록 연락처 목록 조회',
    description: '검색어, 그룹 필터, 페이징에 따라 로그인한 사용자의 주소록 연락처를 조회합니다.',
  })
  async getContacts(
    @CurrentUser() user: any,
    @Query('search') search?: string,
    @Query('groupId') groupId?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.contactsService.getContacts(user.id, {
      search,
      groupId,
      page,
      limit,
    });
  }

  @Post()
  @ApiOperation({ summary: '새 연락처 등록' })
  async createContact(@CurrentUser() user: any, @Body() dto: CreateContactDto) {
    return this.contactsService.createContact(user.id, dto);
  }

  @Get('search')
  @ApiOperation({
    summary: '메일 작성용 수신자 자동완성 검색',
    description: '개인 주소록과 사내 등록 사용자(User)에서 이름/이메일을 통합 검색합니다.',
  })
  async search(@CurrentUser() user: any, @Query('q') q: string) {
    return this.contactsService.searchContactsAndUsers(user.id, q);
  }

  @Get('groups')
  @ApiOperation({ summary: '주소록 그룹 목록 및 그룹별 건수 조회' })
  async getGroups(@CurrentUser() user: any) {
    return this.contactsService.getGroups(user.id);
  }

  @Post('groups')
  @ApiOperation({ summary: '주소록 그룹 생성' })
  async createGroup(@CurrentUser() user: any, @Body() dto: CreateGroupDto) {
    return this.contactsService.createGroup(user.id, dto);
  }

  @Patch('groups/:id')
  @ApiOperation({ summary: '주소록 그룹 수정' })
  async updateGroup(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.contactsService.updateGroup(user.id, id, dto);
  }

  @Delete('groups/:id')
  @ApiOperation({ summary: '주소록 그룹 삭제' })
  async deleteGroup(@CurrentUser() user: any, @Param('id') id: string) {
    return this.contactsService.deleteGroup(user.id, id);
  }

  @Post('import')
  @ApiOperation({
    summary: '외부 주소록 가져오기 (Outlook CSV / vCard 지원)',
  })
  async importContacts(
    @CurrentUser() user: any,
    @Body() dto: ImportContactsDto,
  ) {
    return this.contactsService.importContacts(user.id, dto);
  }

  @Get('export')
  @ApiOperation({
    summary: '주소록 내보내기 (Excel xlsx, Outlook 호환 CSV 또는 vCard 포맷)',
  })
  async exportContacts(
    @CurrentUser() user: any,
    @Query('format') format: 'xlsx' | 'csv' | 'vcf' = 'xlsx',
    @Query('groupId') groupId: string,
    @Res() res: Response,
  ) {
    const { data, filename, mimeType } = await this.contactsService.exportContacts(
      user.id,
      format,
      groupId,
    );

    res.setHeader('Content-Type', mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(filename)}"`,
    );
    res.send(data);
  }

  @Post('bulk-delete')
  @ApiOperation({ summary: '선택한 연락처 다중 삭제' })
  async bulkDelete(@CurrentUser() user: any, @Body() dto: BulkDeleteContactsDto) {
    return this.contactsService.bulkDeleteContacts(user.id, dto.ids);
  }

  @Get(':id')
  @ApiOperation({ summary: '연락처 상세 조회' })
  async getContactById(@CurrentUser() user: any, @Param('id') id: string) {
    return this.contactsService.getContactById(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '연락처 수정' })
  async updateContact(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateContactDto,
  ) {
    return this.contactsService.updateContact(user.id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '연락처 삭제' })
  async deleteContact(@CurrentUser() user: any, @Param('id') id: string) {
    return this.contactsService.deleteContact(user.id, id);
  }

  @Patch(':id/star')
  @ApiOperation({ summary: '중요 연락처 토글' })
  async toggleStar(@CurrentUser() user: any, @Param('id') id: string) {
    return this.contactsService.toggleStar(user.id, id);
  }
}
