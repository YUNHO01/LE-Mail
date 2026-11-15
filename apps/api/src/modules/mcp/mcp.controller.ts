import {
  Controller,
  ForbiddenException,
  Get,
  Logger,
  NotFoundException,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Request, Response } from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { McpApiKeyScope } from '@lemail/shared-types';
import { ApiKeyService } from '../auth/api-key.service';
import { User } from '../database/entities';
import { SkipLicenseCheck } from '../license/decorators/skip-license-check.decorator';
import { SettingsService } from '../settings/settings.service';
import { McpServerService } from './mcp-server.service';

@ApiTags('MCP (Model Context Protocol)')
@Controller('mcp')
export class McpController {
  private readonly logger = new Logger(McpController.name);

  constructor(
    private readonly mcpServerService: McpServerService,
    private readonly apiKeyService: ApiKeyService,
    private readonly jwtService: JwtService,
    private readonly settingsService: SettingsService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  private async authenticateRequest(
    req: Request,
    queryToken?: string,
    queryApiKey?: string,
  ): Promise<{ user: User; scopes: McpApiKeyScope[] }> {
    const apiKeyHeader = req.headers['x-api-key'];
    const apiKey =
      (Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader) || queryApiKey;

    if (apiKey) {
      const validated = await this.apiKeyService.validateApiKey(apiKey);
      return { user: validated.user, scopes: validated.scopes };
    }

    let token = queryToken;
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    }

    if (!token) {
      throw new UnauthorizedException(
        'MCP 원격 연결을 위한 인증 정보(X-API-Key 또는 Bearer JWT)가 제공되지 않았습니다.',
      );
    }

    try {
      const payload = this.jwtService.verify<{ sub: string }>(token);
      const user = await this.userRepository.findOne({ where: { id: payload.sub } });
      if (!user || !user.isActive) {
        throw new UnauthorizedException('유효하지 않거나 비활성화된 사용자입니다.');
      }
      return {
        user,
        scopes: [McpApiKeyScope.MCP_READ, McpApiKeyScope.MCP_WRITE],
      };
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('만료되었거나 유효하지 않은 JWT 토큰입니다.');
    }
  }

  @Get('sse')
  @ApiOperation({ summary: '[원격 MCP] Server-Sent Events(SSE) 스트림 연결 수립' })
  @ApiQuery({ name: 'token', required: false, description: 'JWT 세션 토큰' })
  @ApiQuery({ name: 'apiKey', required: false, description: '개인 연동 API Key' })
  @ApiResponse({ status: 200, description: 'SSE 연결 정상 수립' })
  @ApiResponse({ status: 401, description: '인증 실패' })
  async handleSse(
    @Req() req: Request,
    @Res() res: Response,
    @Query('token') queryToken?: string,
    @Query('apiKey') queryApiKey?: string,
  ) {
    const mcpEnabled = await this.settingsService.getBooleanSetting('MCP_SERVER_ENABLED', true);
    if (!mcpEnabled) {
      throw new ForbiddenException('관리자 정책에 의해 원격 MCP 연동이 비활성화되어 있습니다.');
    }

    const { user, scopes } = await this.authenticateRequest(req, queryToken, queryApiKey);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const transport = new SSEServerTransport('/api/mcp/messages', res);
    const sessionId = transport.sessionId;

    const server = this.mcpServerService.createMcpServer(user, scopes);
    await server.connect(transport);

    this.mcpServerService.registerSession(sessionId, transport, server, user, scopes);

    transport.onclose = () => {
      this.mcpServerService.removeSession(sessionId);
    };

    req.on('close', () => {
      this.mcpServerService.removeSession(sessionId);
    });
  }

  @Post('messages')
  @ApiOperation({ summary: '[원격 MCP] JSON-RPC 클라이언트 메시지 수신 엔드포인트' })
  @ApiQuery({ name: 'sessionId', required: true, description: 'SSE 연결에서 할당받은 세션 ID' })
  @ApiResponse({ status: 200, description: '메시지 처리 완료' })
  @ApiResponse({ status: 404, description: '존재하지 않거나 만료된 세션' })
  async handleMessages(
    @Req() req: Request,
    @Res() res: Response,
    @Query('sessionId') sessionId: string,
  ) {
    if (!sessionId) {
      throw new NotFoundException('sessionId 쿼리 파라미터가 누락되었습니다.');
    }

    const transport = this.mcpServerService.getTransport(sessionId);
    if (!transport) {
      throw new NotFoundException(`유효하지 않거나 만료된 MCP 세션입니다: ${sessionId}`);
    }

    // main.ts의 전역 json() 미들웨어가 이미 req.body를 파싱하므로 parsedBody 인자로 전달
    await transport.handlePostMessage(req, res, req.body);
  }

  @Get('health')
  @SkipLicenseCheck()
  @ApiOperation({ summary: '[원격 MCP] 원격 MCP 서버 상태 및 지원 스펙 안내' })
  @ApiResponse({ status: 200, description: '서버 상태 정상' })
  getHealth() {
    return {
      status: 'UP',
      protocol: 'Model Context Protocol (MCP) / SSE Transport',
      sseEndpoint: '/api/mcp/sse',
      messageEndpoint: '/api/mcp/messages',
      activeSessions: this.mcpServerService.getActiveSessionCount(),
      capabilities: {
        resources: [
          'lemail://user/profile',
          'lemail://mail/folders',
          'lemail://mail/inbox/recent',
          'lemail://calendar/today',
        ],
        tools: [
          'get_my_profile',
          'list_folders',
          'list_mails',
          'search_mails',
          'get_mail_detail',
          'search_contacts',
          'list_company_users',
          'list_calendars',
          'list_events',
          'mark_mail_read',
          'toggle_mail_star',
          'move_mail',
          'delete_mail',
          'report_spam',
          'create_draft',
          'send_mail',
          'create_folder',
          'create_contact',
          'create_event',
          'update_event',
        ],
        prompts: ['daily_mail_briefing', 'reply_mail_draft'],
      },
    };
  }
}
