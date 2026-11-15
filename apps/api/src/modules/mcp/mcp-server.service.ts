import { Injectable, Logger } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import { FolderType, McpApiKeyScope } from '@lemail/shared-types';
import { User } from '../database/entities';
import { MailService } from '../mail/mail.service';
import { MailFolderService } from '../mail-folder/mail-folder.service';
import { ContactsService } from '../contacts/contacts.service';
import { CalendarService } from '../calendar/calendar.service';
import { UsersService } from '../users/users.service';
import { SettingsService } from '../settings/settings.service';
import { SpamService } from '../spam/spam.service';

const MAX_MAIL_BODY_CHARS = 10000;

interface McpSessionEntry {
  transport: SSEServerTransport;
  server: McpServer;
  user: User;
  scopes: McpApiKeyScope[];
}

@Injectable()
export class McpServerService {
  private readonly logger = new Logger(McpServerService.name);
  private readonly transports = new Map<string, McpSessionEntry>();

  constructor(
    private readonly mailService: MailService,
    private readonly mailFolderService: MailFolderService,
    private readonly contactsService: ContactsService,
    private readonly calendarService: CalendarService,
    private readonly usersService: UsersService,
    private readonly settingsService: SettingsService,
    private readonly spamService: SpamService,
  ) {}

  getActiveSessionCount(): number {
    return this.transports.size;
  }

  getTransport(sessionId: string): SSEServerTransport | undefined {
    return this.transports.get(sessionId)?.transport;
  }

  registerSession(
    sessionId: string,
    transport: SSEServerTransport,
    server: McpServer,
    user: User,
    scopes: McpApiKeyScope[],
  ) {
    this.transports.set(sessionId, { transport, server, user, scopes });
    this.logger.log(
      `[MCP Server] 새 원격 SSE 세션 등록: ${sessionId} (사용자: ${user.name} / ${user.email}, 스코프: ${scopes.join(', ')})`,
    );
  }

  removeSession(sessionId: string) {
    if (this.transports.has(sessionId)) {
      this.transports.delete(sessionId);
      this.logger.log(`[MCP Server] 원격 SSE 세션 종료: ${sessionId}`);
    }
  }

  private hasScope(scopes: McpApiKeyScope[], required: McpApiKeyScope): boolean {
    return scopes.includes(required);
  }

  private scopeDeniedResult(required: McpApiKeyScope) {
    return {
      isError: true,
      content: [
        {
          type: 'text' as const,
          text: `권한 부족: 이 도구를 실행하려면 '${required}' 스코프가 필요합니다.`,
        },
      ],
    };
  }

  private jsonResult(data: unknown) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  /**
   * Prompt Injection 완화 및 토큰 절감을 위해 HTML 본문을 정제된 텍스트로 변환
   */
  private sanitizeMailBody(textBody?: string | null, htmlBody?: string | null): {
    text: string;
    truncated: boolean;
  } {
    let raw = (textBody || '').trim();
    if (!raw && htmlBody) {
      raw = htmlBody
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&amp;/gi, '&')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }

    if (raw.length > MAX_MAIL_BODY_CHARS) {
      return {
        text: `${raw.slice(0, MAX_MAIL_BODY_CHARS)}\n\n... [본문이 길어 ${MAX_MAIL_BODY_CHARS}자에서 잘렸습니다]`,
        truncated: true,
      };
    }

    return { text: raw, truncated: false };
  }

  private getTodayRangeIso(): { start: string; end: string } {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { start: start.toISOString(), end: end.toISOString() };
  }

  createMcpServer(user: User, scopes: McpApiKeyScope[]): McpServer {
    const server = new McpServer({
      name: 'lemail-remote-mcp-server',
      version: '1.0.0',
    });

    // ==========================================
    // 1. Resources (읽기 전용 컨텍스트)
    // ==========================================
    server.registerResource(
      'user_profile',
      'lemail://user/profile',
      {
        title: '내 계정 프로필 및 사서함 정보',
        description: '로그인한 사용자의 기본 정보, 부서/직급, 사서함 용량, 언어/타임존 정보',
        mimeType: 'application/json',
      },
      async (uri) => {
        const profile = await this.usersService.findOne(user.id);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(profile, null, 2),
            },
          ],
        };
      },
    );

    server.registerResource(
      'mail_folders',
      'lemail://mail/folders',
      {
        title: '내 메일함(폴더) 목록',
        description: '시스템 기본 메일함 및 사용자 정의 폴더 목록과 미읽음 메일 수',
        mimeType: 'application/json',
      },
      async (uri) => {
        const folders = await this.mailFolderService.getFolderTree(user.id);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(folders, null, 2),
            },
          ],
        };
      },
    );

    server.registerResource(
      'inbox_recent',
      'lemail://mail/inbox/recent',
      {
        title: '최근 받은편지함 메일 목록',
        description: '받은편지함의 최근 메일 15건 요약 목록',
        mimeType: 'application/json',
      },
      async (uri) => {
        const inbox = await this.mailFolderService.getSystemFolder(user.id, FolderType.INBOX);
        const result = await this.mailService.findAll(
          { folderId: inbox.id, page: 1, limit: 15 },
          user.id,
        );
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      },
    );

    server.registerResource(
      'calendar_today',
      'lemail://calendar/today',
      {
        title: '오늘의 캘린더 일정',
        description: '오늘 날짜 기준 내 일정 및 공유 캘린더 일정 목록',
        mimeType: 'application/json',
      },
      async (uri) => {
        const { start, end } = this.getTodayRangeIso();
        const events = await this.calendarService.getEvents(user.id, { start, end });
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(events, null, 2),
            },
          ],
        };
      },
    );

    // ==========================================
    // 2. Read Tools (mcp:read)
    // ==========================================
    server.registerTool(
      'get_my_profile',
      {
        description: '로그인한 사용자 본인의 계정 정보, 사서함 용량, 부서 및 직급 정보를 조회합니다.',
        inputSchema: {},
      },
      async () => {
        if (!this.hasScope(scopes, McpApiKeyScope.MCP_READ)) {
          return this.scopeDeniedResult(McpApiKeyScope.MCP_READ);
        }
        const profile = await this.usersService.findOne(user.id);
        return this.jsonResult(profile);
      },
    );

    server.registerTool(
      'list_folders',
      {
        description: '내 메일함(받은/보낸/임시/스팸/휴지통 및 사용자 폴더) 목록과 미읽음 건수를 조회합니다.',
        inputSchema: {},
      },
      async () => {
        if (!this.hasScope(scopes, McpApiKeyScope.MCP_READ)) {
          return this.scopeDeniedResult(McpApiKeyScope.MCP_READ);
        }
        const folders = await this.mailFolderService.getFolderTree(user.id);
        return this.jsonResult(folders);
      },
    );

    server.registerTool(
      'list_mails',
      {
        description: '특정 폴더 또는 전체 사서함의 메일 목록을 페이지네이션으로 조회합니다.',
        inputSchema: {
          folderId: z.string().optional().describe('조회할 메일함(폴더) ID (미지정 시 받은편지함 기본)'),
          page: z.number().int().min(1).default(1).describe('페이지 번호'),
          limit: z.number().int().min(1).max(50).default(20).describe('페이지당 조회 건수 (최대 50)'),
        },
      },
      async ({ folderId, page, limit }) => {
        if (!this.hasScope(scopes, McpApiKeyScope.MCP_READ)) {
          return this.scopeDeniedResult(McpApiKeyScope.MCP_READ);
        }
        let targetFolderId = folderId;
        if (!targetFolderId) {
          const inbox = await this.mailFolderService.getSystemFolder(user.id, FolderType.INBOX);
          targetFolderId = inbox.id;
        }
        const result = await this.mailService.findAll(
          { folderId: targetFolderId, page, limit },
          user.id,
        );
        return this.jsonResult(result);
      },
    );

    server.registerTool(
      'search_mails',
      {
        description: '제목, 발신자, 본문 키워드로 내 메일을 검색합니다.',
        inputSchema: {
          search: z.string().min(1).describe('검색 키워드 (제목 또는 발신자 등)'),
          folderId: z.string().optional().describe('특정 폴더 ID로 제한 (선택)'),
          page: z.number().int().min(1).default(1).describe('페이지 번호'),
          limit: z.number().int().min(1).max(50).default(20).describe('페이지당 조회 건수'),
        },
      },
      async ({ search, folderId, page, limit }) => {
        if (!this.hasScope(scopes, McpApiKeyScope.MCP_READ)) {
          return this.scopeDeniedResult(McpApiKeyScope.MCP_READ);
        }
        const result = await this.mailService.findAll(
          { search, folderId, page, limit },
          user.id,
        );
        return this.jsonResult(result);
      },
    );

    server.registerTool(
      'get_mail_detail',
      {
        description: '메일 ID로 메일 상세 내용(정제된 텍스트 본문, 수신자, 첨부파일 메타데이터)을 조회합니다.',
        inputSchema: {
          messageId: z.string().min(1).describe('조회할 메일(message) ID'),
          folderId: z.string().optional().describe('메일이 속한 폴더 ID (선택)'),
        },
      },
      async ({ messageId, folderId }) => {
        if (!this.hasScope(scopes, McpApiKeyScope.MCP_READ)) {
          return this.scopeDeniedResult(McpApiKeyScope.MCP_READ);
        }
        const detail = await this.mailService.findOne(messageId, user.id, folderId);
        const sanitized = this.sanitizeMailBody(detail.body?.text, detail.body?.html);

        return this.jsonResult({
          id: detail.id,
          subject: detail.subject,
          sender: detail.sender,
          direction: detail.direction,
          status: detail.status,
          isRead: detail.isRead,
          isStarred: detail.isStarred,
          folderId: detail.folderId,
          createdAt: detail.createdAt,
          recipients: detail.recipients,
          bodyText: sanitized.text,
          bodyTruncated: sanitized.truncated,
          attachments: (detail.attachments || []).map((att: any) => ({
            id: att.id,
            filename: att.filename,
            contentType: att.contentType,
            sizeBytes: att.sizeBytes,
          })),
        });
      },
    );

    server.registerTool(
      'search_contacts',
      {
        description: '개인 주소록 및 사내 조직도에서 이름 또는 이메일로 연락처를 검색합니다.',
        inputSchema: {
          keyword: z.string().min(1).describe('검색할 이름 또는 이메일 키워드'),
        },
      },
      async ({ keyword }) => {
        if (!this.hasScope(scopes, McpApiKeyScope.MCP_READ)) {
          return this.scopeDeniedResult(McpApiKeyScope.MCP_READ);
        }
        const [personalContacts, combined] = await Promise.all([
          this.contactsService.getContacts(user.id, { search: keyword, page: 1, limit: 20 }),
          this.contactsService.searchContactsAndUsers(user.id, keyword),
        ]);
        return this.jsonResult({
          personalContacts,
          quickSearchMatches: combined,
        });
      },
    );

    server.registerTool(
      'list_company_users',
      {
        description: '사내 임직원 주소록 목록을 조회합니다. 부서 ID로 필터링할 수 있습니다.',
        inputSchema: {
          departmentId: z.string().optional().describe('필터링할 부서 ID (선택)'),
        },
      },
      async ({ departmentId }) => {
        if (!this.hasScope(scopes, McpApiKeyScope.MCP_READ)) {
          return this.scopeDeniedResult(McpApiKeyScope.MCP_READ);
        }
        const users = await this.contactsService.getCompanyUsers(departmentId);
        return this.jsonResult(users);
      },
    );

    server.registerTool(
      'list_calendars',
      {
        description: '내 캘린더 및 공유 캘린더 목록을 조회합니다.',
        inputSchema: {},
      },
      async () => {
        if (!this.hasScope(scopes, McpApiKeyScope.MCP_READ)) {
          return this.scopeDeniedResult(McpApiKeyScope.MCP_READ);
        }
        const calendars = await this.calendarService.getCalendars(user.id);
        return this.jsonResult(calendars);
      },
    );

    server.registerTool(
      'list_events',
      {
        description: '기간 및 검색어 조건으로 캘린더 일정을 조회합니다.',
        inputSchema: {
          start: z.string().optional().describe('조회 시작 일시 (ISO 8601, 미지정 시 오늘 시작)'),
          end: z.string().optional().describe('조회 종료 일시 (ISO 8601, 미지정 시 오늘 종료)'),
          calendarIds: z.string().optional().describe('쉼표로 구분된 캘린더 ID 목록 (선택)'),
          search: z.string().optional().describe('일정 제목/설명 검색어 (선택)'),
        },
      },
      async ({ start, end, calendarIds, search }) => {
        if (!this.hasScope(scopes, McpApiKeyScope.MCP_READ)) {
          return this.scopeDeniedResult(McpApiKeyScope.MCP_READ);
        }
        const today = this.getTodayRangeIso();
        const events = await this.calendarService.getEvents(user.id, {
          start: start || today.start,
          end: end || today.end,
          calendarIds,
          search,
        });
        return this.jsonResult(events);
      },
    );

    // ==========================================
    // 2.5 Write Tools (mcp:write)
    // ==========================================
    server.registerTool(
      'mark_mail_read',
      {
        description: '메일의 읽음/안읽음 상태를 변경합니다. (mcp:write 스코프 필요)',
        inputSchema: {
          messageId: z.string().min(1).describe('대상 메일 ID'),
          isRead: z.boolean().describe('true=읽음, false=안읽음'),
          folderId: z.string().optional().describe('메일이 속한 폴더 ID (선택)'),
        },
      },
      async ({ messageId, isRead, folderId }) => {
        if (!this.hasScope(scopes, McpApiKeyScope.MCP_WRITE)) {
          return this.scopeDeniedResult(McpApiKeyScope.MCP_WRITE);
        }
        await this.mailService.verifyMailAccess(messageId, user.id);
        const res = await this.mailService.markRead(user.id, messageId, isRead, folderId);
        return this.jsonResult({ success: true, messageId, isRead: res.isRead });
      },
    );

    server.registerTool(
      'toggle_mail_star',
      {
        description: '메일의 중요(별표) 표시를 설정 또는 해제합니다. (mcp:write 스코프 필요)',
        inputSchema: {
          messageId: z.string().min(1).describe('대상 메일 ID'),
          isStarred: z.boolean().describe('true=중요 표시, false=해제'),
          folderId: z.string().optional().describe('메일이 속한 폴더 ID (선택)'),
        },
      },
      async ({ messageId, isStarred, folderId }) => {
        if (!this.hasScope(scopes, McpApiKeyScope.MCP_WRITE)) {
          return this.scopeDeniedResult(McpApiKeyScope.MCP_WRITE);
        }
        await this.mailService.verifyMailAccess(messageId, user.id);
        const res = await this.mailService.markStarred(user.id, messageId, isStarred, folderId);
        return this.jsonResult({ success: true, messageId, isStarred: res.isStarred });
      },
    );

    server.registerTool(
      'move_mail',
      {
        description: '메일을 지정한 폴더로 이동합니다. (mcp:write 스코프 필요)',
        inputSchema: {
          messageId: z.string().min(1).describe('이동할 메일 ID'),
          targetFolderId: z.string().min(1).describe('대상 폴더 ID'),
        },
      },
      async ({ messageId, targetFolderId }) => {
        if (!this.hasScope(scopes, McpApiKeyScope.MCP_WRITE)) {
          return this.scopeDeniedResult(McpApiKeyScope.MCP_WRITE);
        }
        await this.mailService.verifyMailAccess(messageId, user.id);
        const res = await this.mailService.moveMail(user.id, messageId, targetFolderId);
        return this.jsonResult(res);
      },
    );

    server.registerTool(
      'delete_mail',
      {
        description: '메일을 휴지통으로 이동합니다. 안전을 위해 영구 삭제는 지원하지 않습니다. (mcp:write 스코프 필요)',
        inputSchema: {
          messageId: z.string().min(1).describe('휴지통으로 이동할 메일 ID'),
        },
      },
      async ({ messageId }) => {
        if (!this.hasScope(scopes, McpApiKeyScope.MCP_WRITE)) {
          return this.scopeDeniedResult(McpApiKeyScope.MCP_WRITE);
        }
        await this.mailService.verifyMailAccess(messageId, user.id);
        const trashFolder = await this.mailFolderService.getSystemFolder(user.id, FolderType.TRASH);
        const res = await this.mailService.moveMail(user.id, messageId, trashFolder.id);
        return this.jsonResult({ ...res, movedToTrash: true });
      },
    );

    server.registerTool(
      'report_spam',
      {
        description: '수신 메일을 스팸으로 신고하고 스팸함으로 이동합니다. (mcp:write 스코프 필요)',
        inputSchema: {
          messageId: z.string().min(1).describe('스팸 신고할 메일 ID'),
        },
      },
      async ({ messageId }) => {
        if (!this.hasScope(scopes, McpApiKeyScope.MCP_WRITE)) {
          return this.scopeDeniedResult(McpApiKeyScope.MCP_WRITE);
        }
        await this.mailService.verifyMailAccess(messageId, user.id);
        const res = await this.spamService.reportSpam(user.id, messageId);
        return this.jsonResult(res);
      },
    );

    server.registerTool(
      'create_draft',
      {
        description: '새 메일 또는 회신 초안을 임시보관함에 저장합니다. (mcp:write 스코프 필요)',
        inputSchema: {
          draftId: z.string().optional().describe('기존 임시보관 메일 ID (수정 시)'),
          to: z.array(z.string().email()).optional().describe('받는 사람 이메일 목록'),
          cc: z.array(z.string().email()).optional().describe('참조 이메일 목록'),
          bcc: z.array(z.string().email()).optional().describe('숨은참조 이메일 목록'),
          subject: z.string().optional().describe('메일 제목'),
          bodyText: z.string().optional().describe('일반 텍스트 본문'),
          bodyHtml: z.string().optional().describe('HTML 본문'),
        },
      },
      async ({ draftId, to, cc, bcc, subject, bodyText, bodyHtml }) => {
        if (!this.hasScope(scopes, McpApiKeyScope.MCP_WRITE)) {
          return this.scopeDeniedResult(McpApiKeyScope.MCP_WRITE);
        }
        const safeHtml =
          bodyHtml ||
          (bodyText ? `<p>${bodyText.replace(/\n/g, '<br/>')}</p>` : '');
        const res = await this.mailService.saveDraft(user, {
          draftId,
          to,
          cc,
          bcc,
          subject,
          bodyText,
          bodyHtml: safeHtml,
        });
        return this.jsonResult(res);
      },
    );

    server.registerTool(
      'send_mail',
      {
        description:
          '메일을 즉시 발송합니다. 관리자 정책(MCP_ALLOW_DIRECT_SEND)이 허용된 경우에만 동작하며, 비허용 시 create_draft를 사용해야 합니다. (mcp:write 스코프 필요)',
        inputSchema: {
          to: z.array(z.string().email()).min(1).describe('받는 사람 이메일 주소 목록'),
          cc: z.array(z.string().email()).optional().describe('참조(Cc) 이메일 주소 목록'),
          bcc: z.array(z.string().email()).optional().describe('숨은참조(Bcc) 이메일 주소 목록'),
          subject: z.string().min(1).describe('메일 제목'),
          bodyText: z.string().optional().describe('일반 텍스트 본문'),
          bodyHtml: z.string().optional().describe('HTML 본문 (미지정 시 bodyText 기반 자동 변환)'),
        },
      },
      async ({ to, cc, bcc, subject, bodyText, bodyHtml }) => {
        if (!this.hasScope(scopes, McpApiKeyScope.MCP_WRITE)) {
          return this.scopeDeniedResult(McpApiKeyScope.MCP_WRITE);
        }
        const allowDirectSend = await this.settingsService.getBooleanSetting(
          'MCP_ALLOW_DIRECT_SEND',
          false,
        );
        if (!allowDirectSend) {
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: '보안 정책에 의해 MCP 직접 메일 발송(MCP_ALLOW_DIRECT_SEND)이 비활성화되어 있습니다. create_draft 도구를 사용하여 임시보관함에 저장한 후 웹메일에서 발송해 주세요.',
              },
            ],
          };
        }
        const safeHtml =
          bodyHtml ||
          (bodyText ? `<p>${bodyText.replace(/\n/g, '<br/>')}</p>` : '');
        const res = await this.mailService.sendMail(user, {
          to,
          cc,
          bcc,
          subject,
          bodyText,
          bodyHtml: safeHtml,
        });
        return this.jsonResult(res);
      },
    );

    server.registerTool(
      'create_folder',
      {
        description: '사용자 정의 메일함(폴더)을 생성합니다. (mcp:write 스코프 필요)',
        inputSchema: {
          name: z.string().min(1).max(100).describe('새 메일함 이름'),
          parentId: z.string().optional().describe('상위 메일함 ID (선택)'),
        },
      },
      async ({ name, parentId }) => {
        if (!this.hasScope(scopes, McpApiKeyScope.MCP_WRITE)) {
          return this.scopeDeniedResult(McpApiKeyScope.MCP_WRITE);
        }
        const res = await this.mailFolderService.createFolder(user.id, { name, parentId });
        return this.jsonResult(res);
      },
    );

    server.registerTool(
      'create_contact',
      {
        description: '개인 주소록에 새 연락처를 등록합니다. (mcp:write 스코프 필요)',
        inputSchema: {
          name: z.string().min(1).describe('이름'),
          email: z.string().email().optional().describe('이메일 주소'),
          phone: z.string().optional().describe('휴대전화 번호'),
          company: z.string().optional().describe('회사명'),
          department: z.string().optional().describe('부서명'),
          position: z.string().optional().describe('직급/직책'),
          memo: z.string().optional().describe('메모'),
        },
      },
      async ({ name, email, phone, company, department, position, memo }) => {
        if (!this.hasScope(scopes, McpApiKeyScope.MCP_WRITE)) {
          return this.scopeDeniedResult(McpApiKeyScope.MCP_WRITE);
        }
        const res = await this.contactsService.createContact(user.id, {
          name,
          email,
          phone,
          company,
          department,
          position,
          memo,
        });
        return this.jsonResult(res);
      },
    );

    server.registerTool(
      'create_event',
      {
        description: '캘린더에 새 일정을 등록합니다. (mcp:write 스코프 필요)',
        inputSchema: {
          calendarId: z.string().optional().describe('대상 캘린더 ID (미지정 시 기본 캘린더)'),
          title: z.string().min(1).describe('일정 제목'),
          description: z.string().optional().describe('일정 상세 설명'),
          location: z.string().optional().describe('장소'),
          startAt: z.string().describe('시작 일시 (ISO 8601)'),
          endAt: z.string().describe('종료 일시 (ISO 8601)'),
          isAllDay: z.boolean().optional().describe('종일 일정 여부'),
        },
      },
      async ({ calendarId, title, description, location, startAt, endAt, isAllDay }) => {
        if (!this.hasScope(scopes, McpApiKeyScope.MCP_WRITE)) {
          return this.scopeDeniedResult(McpApiKeyScope.MCP_WRITE);
        }
        const res = await this.calendarService.createEvent(user.id, {
          calendarId,
          title,
          description,
          location,
          startAt,
          endAt,
          isAllDay,
        });
        return this.jsonResult(res);
      },
    );

    server.registerTool(
      'update_event',
      {
        description: '기존 캘린더 일정을 수정합니다. (mcp:write 스코프 필요)',
        inputSchema: {
          eventId: z.string().min(1).describe('수정할 일정 ID'),
          title: z.string().optional().describe('일정 제목'),
          description: z.string().optional().describe('일정 설명'),
          location: z.string().optional().describe('장소'),
          startAt: z.string().optional().describe('시작 일시 (ISO 8601)'),
          endAt: z.string().optional().describe('종료 일시 (ISO 8601)'),
          isAllDay: z.boolean().optional().describe('종일 일정 여부'),
        },
      },
      async ({ eventId, title, description, location, startAt, endAt, isAllDay }) => {
        if (!this.hasScope(scopes, McpApiKeyScope.MCP_WRITE)) {
          return this.scopeDeniedResult(McpApiKeyScope.MCP_WRITE);
        }
        const res = await this.calendarService.updateEvent(user.id, eventId, {
          title,
          description,
          location,
          startAt,
          endAt,
          isAllDay,
        });
        return this.jsonResult(res);
      },
    );

    // ==========================================
    // 3. Prompts (사전 정의 프롬프트)
    // ==========================================
    server.registerPrompt(
      'daily_mail_briefing',
      {
        description: '오늘 수신된 미읽은 메일과 오늘의 캘린더 일정을 종합하여 일일 업무 브리핑을 작성합니다.',
      },
      async () => {
        const inbox = await this.mailFolderService.getSystemFolder(user.id, FolderType.INBOX);
        const mails = await this.mailService.findAll({ folderId: inbox.id, page: 1, limit: 20 }, user.id);
        const { start, end } = this.getTodayRangeIso();
        const events = await this.calendarService.getEvents(user.id, { start, end });

        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: [
                  `다음은 ${user.name}(${user.email})님의 최근 받은편지함 메일과 오늘의 캘린더 일정입니다.`,
                  '중요도 순으로 정리한 간결한 일일 업무 브리핑을 마크다운으로 작성해 주세요.',
                  '',
                  '### 최근 받은 메일',
                  JSON.stringify(mails, null, 2),
                  '',
                  '### 오늘의 일정',
                  JSON.stringify(events, null, 2),
                ].join('\n'),
              },
            },
          ],
        };
      },
    );

    server.registerPrompt(
      'reply_mail_draft',
      {
        description: '지정한 메일(messageId)의 내용을 바탕으로 정중한 회신 초안을 작성합니다.',
        argsSchema: {
          messageId: z.string().describe('회신할 원본 메일 ID'),
          tone: z.string().optional().describe('어조 (예: 공손한 비즈니스, 간결한 확인)'),
        },
      },
      async ({ messageId, tone }) => {
        const detail = await this.mailService.findOne(messageId, user.id);
        const sanitized = this.sanitizeMailBody(detail.body?.text, detail.body?.html);

        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: [
                  `아래 원본 메일에 대한 회신 초안을 작성해 주세요. (원하는 어조: ${tone || '정중한 비즈니스 어조'})`,
                  '필요하다면 create_draft 도구를 사용해 임시보관함에 저장할 수 있도록 제목과 본문을 구분해 주세요.',
                  '',
                  `제목: ${detail.subject}`,
                  `발신자: ${detail.sender}`,
                  `본문:\n${sanitized.text}`,
                ].join('\n'),
              },
            },
          ],
        };
      },
    );

    return server;
  }
}
