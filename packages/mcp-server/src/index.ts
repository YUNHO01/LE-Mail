#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadConfig } from './config.js';
import { LemailApiClient, McpScope } from './api-client.js';

const MAX_MAIL_BODY_CHARS = 10000;

function jsonResult(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

function scopeDenied(scope: McpScope) {
  return {
    isError: true,
    content: [
      {
        type: 'text' as const,
        text: `권한 부족: 이 도구를 실행하려면 '${scope}' 스코프가 필요합니다.`,
      },
    ],
  };
}

function sanitizeMailBody(textBody?: string | null, htmlBody?: string | null) {
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

function getTodayRangeIso() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function main() {
  const config = loadConfig();
  const api = new LemailApiClient(config);

  const server = new McpServer({
    name: config.serverName,
    version: config.serverVersion,
  });

  // ==========================================
  // 1. Resources
  // ==========================================
  server.registerResource(
    'user_profile',
    'lemail://user/profile',
    {
      title: '내 계정 프로필 및 사서함 정보',
      description: '로그인한 사용자의 기본 정보 및 사서함 용량 정보',
      mimeType: 'application/json',
    },
    async (uri) => {
      const profile = await api.request('GET', '/auth/profile');
      return {
        contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(profile, null, 2) }],
      };
    },
  );

  server.registerResource(
    'mail_folders',
    'lemail://mail/folders',
    {
      title: '내 메일함(폴더) 목록',
      description: '시스템 및 사용자 정의 메일함 목록과 미읽음 건수',
      mimeType: 'application/json',
    },
    async (uri) => {
      const folders = await api.request('GET', '/mail-folders');
      return {
        contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(folders, null, 2) }],
      };
    },
  );

  server.registerResource(
    'inbox_recent',
    'lemail://mail/inbox/recent',
    {
      title: '최근 받은편지함 메일 목록',
      description: '최근 메일 15건 요약 목록',
      mimeType: 'application/json',
    },
    async (uri) => {
      const mails = await api.request('GET', '/mails?page=1&limit=15');
      return {
        contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(mails, null, 2) }],
      };
    },
  );

  server.registerResource(
    'calendar_today',
    'lemail://calendar/today',
    {
      title: '오늘의 캘린더 일정',
      description: '오늘 날짜 기준 일정 목록',
      mimeType: 'application/json',
    },
    async (uri) => {
      const { start, end } = getTodayRangeIso();
      const events = await api.request(
        'GET',
        `/calendar/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
      );
      return {
        contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(events, null, 2) }],
      };
    },
  );

  // ==========================================
  // 2. Read Tools (mcp:read)
  // ==========================================
  server.registerTool(
    'get_my_profile',
    {
      description: '로그인한 사용자 본인의 계정 정보 및 사서함 기본 정보를 조회합니다.',
      inputSchema: {},
    },
    async () => {
      if (!(await api.hasScope('mcp:read'))) return scopeDenied('mcp:read');
      return jsonResult(await api.request('GET', '/auth/profile'));
    },
  );

  server.registerTool(
    'list_folders',
    {
      description: '내 메일함(폴더) 목록과 미읽음 건수를 조회합니다.',
      inputSchema: {},
    },
    async () => {
      if (!(await api.hasScope('mcp:read'))) return scopeDenied('mcp:read');
      return jsonResult(await api.request('GET', '/mail-folders'));
    },
  );

  server.registerTool(
    'list_mails',
    {
      description: '폴더별 또는 전체 사서함의 메일 목록을 페이지네이션으로 조회합니다.',
      inputSchema: {
        folderId: z.string().optional().describe('조회할 메일함 ID'),
        page: z.number().int().min(1).default(1).describe('페이지 번호'),
        limit: z.number().int().min(1).max(50).default(20).describe('페이지당 건수'),
      },
    },
    async ({ folderId, page, limit }) => {
      if (!(await api.hasScope('mcp:read'))) return scopeDenied('mcp:read');
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (folderId) params.set('folderId', folderId);
      return jsonResult(await api.request('GET', `/mails?${params.toString()}`));
    },
  );

  server.registerTool(
    'search_mails',
    {
      description: '키워드로 내 메일을 검색합니다.',
      inputSchema: {
        search: z.string().min(1).describe('검색 키워드'),
        folderId: z.string().optional().describe('폴더 ID 제한'),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(50).default(20),
      },
    },
    async ({ search, folderId, page, limit }) => {
      if (!(await api.hasScope('mcp:read'))) return scopeDenied('mcp:read');
      const params = new URLSearchParams({
        search,
        page: String(page),
        limit: String(limit),
      });
      if (folderId) params.set('folderId', folderId);
      return jsonResult(await api.request('GET', `/mails?${params.toString()}`));
    },
  );

  server.registerTool(
    'get_mail_detail',
    {
      description: '메일 ID로 정제된 본문, 수신자, 첨부파일 메타데이터를 조회합니다.',
      inputSchema: {
        messageId: z.string().min(1).describe('메일 ID'),
        folderId: z.string().optional().describe('폴더 ID'),
      },
    },
    async ({ messageId, folderId }) => {
      if (!(await api.hasScope('mcp:read'))) return scopeDenied('mcp:read');
      const qs = folderId ? `?folderId=${encodeURIComponent(folderId)}` : '';
      const detail = await api.request('GET', `/mails/${encodeURIComponent(messageId)}${qs}`);
      const sanitized = sanitizeMailBody(detail.body?.text, detail.body?.html);
      return jsonResult({
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
      description: '개인 주소록 및 사내 조직도에서 연락처를 검색합니다.',
      inputSchema: {
        keyword: z.string().min(1).describe('검색 키워드'),
      },
    },
    async ({ keyword }) => {
      if (!(await api.hasScope('mcp:read'))) return scopeDenied('mcp:read');
      const [personalContacts, quickSearchMatches] = await Promise.all([
        api.request('GET', `/contacts?search=${encodeURIComponent(keyword)}&page=1&limit=20`),
        api.request('GET', `/contacts/search?q=${encodeURIComponent(keyword)}`),
      ]);
      return jsonResult({ personalContacts, quickSearchMatches });
    },
  );

  server.registerTool(
    'list_company_users',
    {
      description: '사내 임직원 주소록 목록을 조회합니다.',
      inputSchema: {
        departmentId: z.string().optional().describe('부서 ID 필터'),
      },
    },
    async ({ departmentId }) => {
      if (!(await api.hasScope('mcp:read'))) return scopeDenied('mcp:read');
      const qs = departmentId ? `?departmentId=${encodeURIComponent(departmentId)}` : '';
      return jsonResult(await api.request('GET', `/contacts/company-users${qs}`));
    },
  );

  server.registerTool(
    'list_calendars',
    {
      description: '내 캘린더 및 공유 캘린더 목록을 조회합니다.',
      inputSchema: {},
    },
    async () => {
      if (!(await api.hasScope('mcp:read'))) return scopeDenied('mcp:read');
      return jsonResult(await api.request('GET', '/calendar/calendars'));
    },
  );

  server.registerTool(
    'list_events',
    {
      description: '기간 및 검색어로 캘린더 일정을 조회합니다.',
      inputSchema: {
        start: z.string().optional(),
        end: z.string().optional(),
        calendarIds: z.string().optional(),
        search: z.string().optional(),
      },
    },
    async ({ start, end, calendarIds, search }) => {
      if (!(await api.hasScope('mcp:read'))) return scopeDenied('mcp:read');
      const today = getTodayRangeIso();
      const params = new URLSearchParams({
        start: start || today.start,
        end: end || today.end,
      });
      if (calendarIds) params.set('calendarIds', calendarIds);
      if (search) params.set('search', search);
      return jsonResult(await api.request('GET', `/calendar/events?${params.toString()}`));
    },
  );

  // ==========================================
  // 3. Write Tools (mcp:write)
  // ==========================================
  server.registerTool(
    'mark_mail_read',
    {
      description: '메일의 읽음/안읽음 상태를 변경합니다.',
      inputSchema: {
        messageId: z.string().min(1),
        isRead: z.boolean(),
        folderId: z.string().optional(),
      },
    },
    async ({ messageId, isRead, folderId }) => {
      if (!(await api.hasScope('mcp:write'))) return scopeDenied('mcp:write');
      return jsonResult(
        await api.request('PATCH', `/mails/${encodeURIComponent(messageId)}/read`, {
          isRead,
          folderId,
        }),
      );
    },
  );

  server.registerTool(
    'toggle_mail_star',
    {
      description: '메일 중요(별표) 표시를 설정/해제합니다.',
      inputSchema: {
        messageId: z.string().min(1),
        isStarred: z.boolean(),
        folderId: z.string().optional(),
      },
    },
    async ({ messageId, isStarred, folderId }) => {
      if (!(await api.hasScope('mcp:write'))) return scopeDenied('mcp:write');
      return jsonResult(
        await api.request('PATCH', `/mails/${encodeURIComponent(messageId)}/star`, {
          isStarred,
          folderId,
        }),
      );
    },
  );

  server.registerTool(
    'move_mail',
    {
      description: '메일을 지정한 폴더로 이동합니다.',
      inputSchema: {
        messageId: z.string().min(1),
        targetFolderId: z.string().min(1),
      },
    },
    async ({ messageId, targetFolderId }) => {
      if (!(await api.hasScope('mcp:write'))) return scopeDenied('mcp:write');
      return jsonResult(
        await api.request('PATCH', `/mails/${encodeURIComponent(messageId)}/move`, {
          targetFolderId,
        }),
      );
    },
  );

  server.registerTool(
    'delete_mail',
    {
      description: '메일을 휴지통으로 이동합니다. (영구 삭제 불가)',
      inputSchema: {
        messageId: z.string().min(1),
      },
    },
    async ({ messageId }) => {
      if (!(await api.hasScope('mcp:write'))) return scopeDenied('mcp:write');
      const folders = (await api.request('GET', '/mail-folders')) as Array<{
        id: string;
        type?: string;
      }>;
      const trash = folders.find((f) => f.type === 'TRASH');
      if (!trash) {
        throw new Error('휴지통 폴더를 찾을 수 없습니다.');
      }
      return jsonResult(
        await api.request('PATCH', `/mails/${encodeURIComponent(messageId)}/move`, {
          targetFolderId: trash.id,
        }),
      );
    },
  );

  server.registerTool(
    'report_spam',
    {
      description: '수신 메일을 스팸으로 신고하고 스팸함으로 이동합니다.',
      inputSchema: {
        messageId: z.string().min(1),
      },
    },
    async ({ messageId }) => {
      if (!(await api.hasScope('mcp:write'))) return scopeDenied('mcp:write');
      return jsonResult(
        await api.request('POST', `/mails/${encodeURIComponent(messageId)}/report-spam`),
      );
    },
  );

  server.registerTool(
    'create_draft',
    {
      description: '새 메일 또는 회신 초안을 임시보관함에 저장합니다.',
      inputSchema: {
        draftId: z.string().optional(),
        to: z.array(z.string().email()).optional(),
        cc: z.array(z.string().email()).optional(),
        bcc: z.array(z.string().email()).optional(),
        subject: z.string().optional(),
        bodyText: z.string().optional(),
        bodyHtml: z.string().optional(),
      },
    },
    async ({ draftId, to, cc, bcc, subject, bodyText, bodyHtml }) => {
      if (!(await api.hasScope('mcp:write'))) return scopeDenied('mcp:write');
      const safeHtml =
        bodyHtml || (bodyText ? `<p>${bodyText.replace(/\n/g, '<br/>')}</p>` : '');
      return jsonResult(
        await api.request('POST', '/mails/drafts', {
          draftId,
          to,
          cc,
          bcc,
          subject,
          bodyText,
          bodyHtml: safeHtml,
        }),
      );
    },
  );

  server.registerTool(
    'send_mail',
    {
      description: '메일을 발송합니다. (직접 발송 정책 허용 시 권장, 기본은 create_draft 권장)',
      inputSchema: {
        to: z.array(z.string().email()).min(1),
        cc: z.array(z.string().email()).optional(),
        bcc: z.array(z.string().email()).optional(),
        subject: z.string().min(1),
        bodyText: z.string().optional(),
        bodyHtml: z.string().optional(),
      },
    },
    async ({ to, cc, bcc, subject, bodyText, bodyHtml }) => {
      if (!(await api.hasScope('mcp:write'))) return scopeDenied('mcp:write');
      const safeHtml =
        bodyHtml || (bodyText ? `<p>${bodyText.replace(/\n/g, '<br/>')}</p>` : '');
      return jsonResult(
        await api.request('POST', '/mails/send', {
          to,
          cc,
          bcc,
          subject,
          bodyText,
          bodyHtml: safeHtml,
        }),
      );
    },
  );

  server.registerTool(
    'create_folder',
    {
      description: '사용자 정의 메일함(폴더)을 생성합니다.',
      inputSchema: {
        name: z.string().min(1).max(100),
        parentId: z.string().optional(),
      },
    },
    async ({ name, parentId }) => {
      if (!(await api.hasScope('mcp:write'))) return scopeDenied('mcp:write');
      return jsonResult(await api.request('POST', '/mail-folders', { name, parentId }));
    },
  );

  server.registerTool(
    'create_contact',
    {
      description: '개인 주소록에 새 연락처를 등록합니다.',
      inputSchema: {
        name: z.string().min(1),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        company: z.string().optional(),
        department: z.string().optional(),
        position: z.string().optional(),
        memo: z.string().optional(),
      },
    },
    async (dto) => {
      if (!(await api.hasScope('mcp:write'))) return scopeDenied('mcp:write');
      return jsonResult(await api.request('POST', '/contacts', dto));
    },
  );

  server.registerTool(
    'create_event',
    {
      description: '캘린더에 새 일정을 등록합니다.',
      inputSchema: {
        calendarId: z.string().optional(),
        title: z.string().min(1),
        description: z.string().optional(),
        location: z.string().optional(),
        startAt: z.string(),
        endAt: z.string(),
        isAllDay: z.boolean().optional(),
      },
    },
    async (dto) => {
      if (!(await api.hasScope('mcp:write'))) return scopeDenied('mcp:write');
      return jsonResult(await api.request('POST', '/calendar/events', dto));
    },
  );

  server.registerTool(
    'update_event',
    {
      description: '기존 캘린더 일정을 수정합니다.',
      inputSchema: {
        eventId: z.string().min(1),
        title: z.string().optional(),
        description: z.string().optional(),
        location: z.string().optional(),
        startAt: z.string().optional(),
        endAt: z.string().optional(),
        isAllDay: z.boolean().optional(),
      },
    },
    async ({ eventId, ...dto }) => {
      if (!(await api.hasScope('mcp:write'))) return scopeDenied('mcp:write');
      return jsonResult(
        await api.request('PATCH', `/calendar/events/${encodeURIComponent(eventId)}`, dto),
      );
    },
  );

  // ==========================================
  // 4. Prompts
  // ==========================================
  server.registerPrompt(
    'daily_mail_briefing',
    {
      description: '오늘 수신된 메일과 오늘의 일정을 종합해 일일 업무 브리핑을 작성합니다.',
    },
    async () => {
      const mails = await api.request('GET', '/mails?page=1&limit=20');
      const { start, end } = getTodayRangeIso();
      const events = await api.request(
        'GET',
        `/calendar/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
      );
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: [
                '최근 받은 메일과 오늘의 캘린더 일정을 중요도 순으로 정리한 일일 업무 브리핑을 마크다운으로 작성해 주세요.',
                '',
                '### 최근 메일',
                JSON.stringify(mails, null, 2),
                '',
                '### 오늘 일정',
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
      description: '지정한 메일(messageId)을 바탕으로 정중한 회신 초안을 작성합니다.',
      argsSchema: {
        messageId: z.string().describe('원본 메일 ID'),
        tone: z.string().optional().describe('어조'),
      },
    },
    async ({ messageId, tone }) => {
      const detail = await api.request('GET', `/mails/${encodeURIComponent(messageId)}`);
      const sanitized = sanitizeMailBody(detail.body?.text, detail.body?.html);
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: [
                `아래 원본 메일에 대한 회신 초안을 작성해 주세요. (어조: ${tone || '정중한 비즈니스 어조'})`,
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

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `[LEMail MCP Server] 기동 완료 (버전: ${config.serverVersion}, API: ${config.apiUrl})`,
  );
}

main().catch((error) => {
  console.error('[LEMail MCP Server] 실행 오류:', error);
  process.exit(1);
});
