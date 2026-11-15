import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiKeyService } from './api-key.service';
import { CreateApiKeyDto } from './dto/api-key.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';

@ApiTags('Auth')
@Controller('auth/api-keys')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ApiKeyController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  @Get()
  @ApiOperation({
    summary: '내 MCP 연동 API Key 목록 조회',
    description: '현재 로그인한 사용자가 발급한 MCP 연동용 개인 API Key 목록을 조회합니다.',
  })
  @ApiResponse({ status: 200, description: '조회 성공' })
  async listMyApiKeys(@CurrentUser() user: any) {
    return this.apiKeyService.listApiKeys(user.id);
  }

  @Post()
  @ApiOperation({
    summary: 'MCP 연동 API Key 발급',
    description: '새 개인 API Key를 발급합니다. 원본 키(rawKey)는 발급 응답에서 1회만 반환됩니다.',
  })
  @ApiResponse({ status: 201, description: '발급 성공' })
  @ApiResponse({ status: 400, description: '잘못된 요청 파라미터' })
  async createApiKey(@CurrentUser() user: any, @Body() dto: CreateApiKeyDto) {
    return this.apiKeyService.createApiKey(user.id, dto);
  }

  @Patch(':id/toggle')
  @ApiOperation({
    summary: 'MCP 연동 API Key 활성/비활성 전환',
    description: '지정한 API Key의 활성 상태를 전환합니다.',
  })
  @ApiResponse({ status: 200, description: '상태 변경 성공' })
  @ApiResponse({ status: 404, description: 'API Key를 찾을 수 없음' })
  async toggleApiKey(@CurrentUser() user: any, @Param('id') id: string) {
    return this.apiKeyService.toggleApiKey(user.id, id);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'MCP 연동 API Key 폐기(삭제)',
    description: '지정한 API Key를 영구 삭제합니다.',
  })
  @ApiResponse({ status: 200, description: '삭제 성공' })
  @ApiResponse({ status: 404, description: 'API Key를 찾을 수 없음' })
  async deleteApiKey(@CurrentUser() user: any, @Param('id') id: string) {
    return this.apiKeyService.deleteApiKey(user.id, id);
  }
}
