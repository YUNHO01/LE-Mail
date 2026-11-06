import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole, UserStorageUsageDto } from '@lemail/shared-types';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(UserRole.SYSTEM_ADMIN)
  @ApiOperation({
    summary: '사용자 목록 조회 (관리자 전용)',
    description: '페이징 및 검색, 역할 필터를 적용하여 등록된 사용자 목록을 조회합니다.',
  })
  @ApiResponse({ status: 200, description: '사용자 목록 조회 성공' })
  async findAll(@Query() query: UserQueryDto) {
    return this.usersService.findAll(query);
  }

  @Get('me/storage-usage')
  @ApiOperation({
    summary: '현재 로그인한 사용자의 사서함 스토리지 사용량 조회',
    description: '현재 접속 중인 사용자의 메일 용량, 할당량, 사용률(%), 보관 메일 건수를 조회합니다.',
  })
  @ApiResponse({ status: 200, description: '사용량 조회 성공' })
  async getMyStorageUsage(@CurrentUser() user: any): Promise<UserStorageUsageDto> {
    return this.usersService.getUserStorageUsage(user.id);
  }

  @Get(':id')
  @Roles(UserRole.SYSTEM_ADMIN)
  @ApiOperation({
    summary: '특정 사용자 상세 조회 (관리자 전용)',
    description: '사용자 ID로 사용자 상세 정보를 조회합니다.',
  })
  @ApiResponse({ status: 200, description: '사용자 상세 조회 성공' })
  @ApiResponse({ status: 404, description: '사용자 미발견' })
  async findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  @Roles(UserRole.SYSTEM_ADMIN)
  @ApiOperation({
    summary: '신규 사용자 등록 (관리자 전용)',
    description:
      '신규 사용자를 등록하고, 해당 사용자의 전용 사서함(Mailbox)을 자동 생성 및 활성화합니다.',
  })
  @ApiResponse({ status: 201, description: '사용자 등록 성공' })
  @ApiResponse({ status: 409, description: '이미 존재하는 이메일 계정' })
  async create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Patch(':id')
  @Roles(UserRole.SYSTEM_ADMIN)
  @ApiOperation({
    summary: '사용자 정보 수정 (관리자 전용)',
    description: '사용자의 이름, 비밀번호, 역할, 계정 활성 상태를 수정합니다.',
  })
  @ApiResponse({ status: 200, description: '사용자 수정 성공' })
  @ApiResponse({ status: 404, description: '사용자 미발견' })
  async update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @Roles(UserRole.SYSTEM_ADMIN)
  @ApiOperation({
    summary: '사용자 삭제 (관리자 전용)',
    description: '사용자 계정을 삭제하고 연관된 사서함을 비활성화합니다. 본인 계정은 삭제할 수 없습니다.',
  })
  @ApiResponse({ status: 200, description: '사용자 삭제 성공' })
  @ApiResponse({ status: 400, description: '자기 자신 삭제 시도 오류' })
  @ApiResponse({ status: 403, description: '마지막 시스템 관리자 삭제 불가' })
  async remove(@Param('id') id: string, @CurrentUser() currentUser: any) {
    return this.usersService.remove(id, currentUser.id);
  }
}
