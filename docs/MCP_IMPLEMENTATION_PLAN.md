# 🤖 LEMail Model Context Protocol (MCP) 구현 계획서

본 문서는 **LEMail**과 AI 클라이언트(Claude Desktop, Cursor, 사내 AI 에이전트 등)를 표준 JSON-RPC 프로토콜로 연동하기 위한 **Model Context Protocol (MCP) 지원 구현 계획 및 로드맵**을 정의합니다.

> 본 계획은 사내 근태관리(`ams`) 프로젝트의 MCP 구현 패턴(`apps/api/src/mcp` 원격 SSE 서버 + `packages/mcp-server` Stdio CLI + 개인 API Key 인증)을 참고하되, LEMail의 메일·주소록·캘린더 도메인 특성과 보안·아키텍처 규칙에 맞게 최적화되었습니다.  
> **시스템 관리자 전용 MCP 도구(큐 모니터링, 스팸 분석/규칙 관리, 사용자/도메인 관리 등)는 MCP 도구 범위에서 제외**하고, 일반 사용자의 업무 생산성 기능에 집중합니다.

---

## 📌 1. 개요 및 설계 원칙

### 1.1 목적
- 자연어 대화를 통해 사용자가 자신의 메일함 조회·검색·정리·초안 작성, 주소록 및 사내 조직도 검색, 캘린더 일정 조회·등록을 안전하게 수행할 수 있는 표준 MCP 인터페이스 제공.

### 1.2 아키텍처 모델 (이원화 트랜스포트)
1. **백엔드 내장 원격 MCP 서버 (`apps/api/src/modules/mcp`)**
   - NestJS API 서버(`9200`) 내에 `SSEServerTransport` 기반 원격 MCP 엔드포인트(`GET /api/mcp/sse`, `POST /api/mcp/messages`, `GET /api/mcp/health`)를 내장합니다.
   - 사내 AI 챗봇, 웹 에이전트, 원격 MCP 클라이언트 연동에 사용합니다.
   - *(확장 고려)* 최신 MCP 클라이언트를 위한 Streamable HTTP Transport(`/api/mcp`) 병행 지원 여부를 구현 시 함께 검토합니다.
2. **로컬 Stdio CLI 패키지 (`packages/mcp-server`, `@lemail/mcp-server`)**
   - Claude Desktop, Cursor 등 로컬 데스크톱 AI 클라이언트를 위한 Stdio 기반 MCP 서버입니다.
   - `apps/api`의 REST API를 호출하는 어댑터 구조로 동작합니다.

### 1.3 보안 및 안전 가드(Safety Guard) 원칙
1. **사용자 컨텍스트 격리**: `X-API-Key` 또는 `Authorization: Bearer <JWT>` 인증을 통해 식별된 `User` 본인 소유의 메일·폴더·주소록·일정에만 접근합니다.
2. **스코프 분리 (최소 권한)**: API Key 발급 시 `mcp:read`(조회 전용)와 `mcp:write`(상태 변경 포함) 스코프를 구분하여, 읽기 전용 연동 시 예기치 않은 변경을 원천 차단합니다.
3. **메일 특화 안전 가드**:
   - **Prompt Injection 완화**: `get_mail_detail` 응답 시 HTML 스크립트/스타일을 제거한 정제 텍스트와 최대 길이 제한(예: 10,000자 truncation)을 적용하며, 첨부파일은 바이너리 대신 메타데이터(파일명, 크기, MIME 타입)만 반환합니다.
   - **영구 삭제 제한**: `delete_mail` 도구는 완전 삭제가 아닌 **휴지통 이동**만 허용합니다.
   - **외부 발송 보호**: 메일 작성 시 `create_draft`(임시보관함 저장)를 기본 권장하며, `send_mail`(직접 발송)은 관리자 시스템 설정에서 MCP 직접 발송이 허용된 경우에만 활성화합니다.
4. **시스템 관리자 도구 제외**: 시스템 모니터링(`MonitoringModule`), 스팸 정책/통계(`SpamModule`), 사용자·도메인·라이선스 관리 도구는 MCP로 노출하지 않습니다.

### 1.4 LEMail 프로젝트 아키텍처 준수 사항
- **DB 스키마 동기화**: `apps/api`는 `synchronize: false`를 사용하므로, 신규 엔티티 추가 시 `apps/api/src/modules/database/scripts/init-schema.ts`의 `schemaStatements`와 `syncDatabaseSchema()`에 반드시 동시 반영합니다.
- **공유 타입 일관성**: `packages/shared-types/index.ts`에 API Key 및 MCP 관련 Enum/DTO를 추가한 후 `yarn --cwd packages/shared-types build`로 `dist/`를 갱신합니다.
- **웹 & 모바일 PWA 동기화**: 사용자 개인설정의 API Key 발급/관리 UI는 `apps/web/src/app/mail/settings/page.tsx`와 `apps/mobile/src/app/mail/settings/page.tsx` 양쪽에 동일하게 반영합니다.
- **라이선스 가드 정합성**: `GET /api/mcp/health`는 `@SkipLicenseCheck()`로 예외 처리하고, 실제 SSE 연결 및 도구 실행은 전역 `LicenseGuard` 검증을 유지합니다.
- **난독화·패키징 호환성**: `scripts/package-dist.js --obfuscate` 빌드 후에도 `src/` 경로 의존 없이 정상 기동되어야 하며, `@nestjs/swagger` 데코레이터를 통해 `swagger.json`을 현행화합니다.

---

## 🗺️ 2. MCP 제공 스펙 (Resources / Tools / Prompts)

### 2.1 표준 리소스 (Resources)
| URI | 이름 | 설명 | 연동 모듈 |
| :--- | :--- | :--- | :--- |
| `lemail://user/profile` | `user_profile` | 로그인 사용자 기본 정보, 부서/직급, 사서함 용량(`mailboxQuotaMb`), 언어/타임존 | `Users`, `Auth` |
| `lemail://mail/folders` | `mail_folders` | 내 메일함 목록(시스템 폴더 및 사용자 폴더)과 폴더별 전체/미읽음 메일 수 | `MailFolderModule` |
| `lemail://mail/inbox/recent` | `inbox_recent` | 최근 받은편지함 메일 요약 목록 (발신자, 제목, 수신일시, 읽음 여부) | `MailModule` |
| `lemail://calendar/today` | `calendar_today` | 오늘 및 다가오는 주요 일정 요약 | `CalendarModule` |

### 2.2 조회 도구 (Read Tools — `mcp:read` 스코프)
| 도구명 | 설명 | 연동 모듈 |
| :--- | :--- | :--- |
| `get_my_profile` | 내 계정 프로필 및 사서함 기본 정보 조회 | `Users`, `Auth` |
| `list_folders` | 내 메일함(폴더) 목록 및 미읽음 건수 조회 | `MailFolderModule` |
| `list_mails` | 폴더별·상태별(미읽음/중요) 메일 목록 페이지네이션 조회 | `MailModule` |
| `search_mails` | 키워드, 발신자, 기간 조건으로 메일 검색 | `MailModule` |
| `get_mail_detail` | 특정 메일의 정제된 본문, 수신자, 첨부파일 메타데이터 조회 | `MailModule` |
| `search_contacts` | 개인 주소록 및 그룹 연락처 검색 | `ContactsModule` |
| `list_company_users` | 사내 조직도/임직원 주소록 조회 | `ContactsModule`, `OrgModule` |
| `list_calendars` | 내 캘린더 및 공유 캘린더 목록 조회 | `CalendarModule` |
| `list_events` | 기간별 캘린더 일정 목록 조회 | `CalendarModule` |

### 2.3 상태 변경 도구 (Write Tools — `mcp:write` 스코프)
| 도구명 | 설명 | 안전 가드 |
| :--- | :--- | :--- |
| `mark_mail_read` | 메일 읽음/안읽음 상태 변경 | 본인 소유 메일 검증 |
| `toggle_mail_star` | 메일 중요(별표) 표시 토글 | 본인 소유 메일 검증 |
| `move_mail` | 메일을 다른 폴더로 이동 | 본인 소유 폴더/메일 검증 |
| `delete_mail` | 메일 삭제 처리 | **휴지통 이동만 허용** (영구 삭제 불가) |
| `report_spam` | 수신 메일 스팸 신고 및 스팸함 이동 | 본인 소유 메일 검증 |
| `create_draft` | 새 메일 또는 회신 초안을 임시보관함에 저장 | 발송 없이 초안 저장 |
| `send_mail` | 메일 발송 | **관리자 시스템 설정에서 직접 발송 허용 시에만 동작** |
| `create_folder` | 사용자 정의 메일함 생성 | 중복/예약어 검증 |
| `create_contact` | 개인 주소록에 새 연락처 추가 | 이메일/필드 유효성 검증 |
| `create_event` | 캘린더에 새 일정 등록 | 시작/종료 일시 검증 |
| `update_event` | 기존 캘린더 일정 수정 | 본인 수정 권한 검증 |

### 2.4 사전 정의 프롬프트 (Prompts)
| 프롬프트명 | 설명 |
| :--- | :--- |
| `daily_mail_briefing` | 오늘 수신된 미읽은 메일과 오늘 캘린더 일정을 종합해 일일 업무 브리핑 마크다운 생성 |
| `reply_mail_draft` | 지정한 메일(`messageId`)의 내용과 맥락을 바탕으로 정중한 회신 초안 생성 |

---

## 📋 3. 단계별 구현 로드맵

### [Phase 1] 인증·API Key 기반 구축 및 DB 스키마 동기화 (완료 ✅)
> **목표**: MCP 클라이언트 인증을 위한 개인 API Key 발급/검증/폐기 체계와 공유 타입을 구축합니다.

- [x] **공유 타입 정의 (`packages/shared-types/index.ts`)**
  - `McpApiKeyScope` (`mcp:read`, `mcp:write`) Enum 및 생성/목록/응답 DTO 인터페이스 추가
  - `yarn --cwd packages/shared-types build` 실행으로 `dist/` 갱신
- [x] **DB 엔티티 및 스키마 동기화**
  - `apps/api/src/modules/database/entities/integration-api-key.entity.ts` 신설 (`id`, `userId`, `name`, `keyPrefix`, `keyHash`, `scopes`, `expiresAt`, `lastUsedAt`, `isActive`, `createdAt`)
  - `apps/api/src/modules/database/entities/index.ts` export 등록
  - `apps/api/src/modules/database/scripts/init-schema.ts` 내 `schemaStatements` (`CREATE TABLE IF NOT EXISTS integration_api_key ...`) 및 `syncDatabaseSchema()` 멱등 `ALTER TABLE` 구문 동시 반영
  - `npm --prefix apps/api run schema:init` 실행 및 `[SchemaDrift]` 없음 확인
- [x] **API Key 관리 및 인증 연동 (`apps/api/src/modules/auth`)**
  - 개인 API Key 발급(`POST /api/auth/api-keys`), 목록 조회(`GET /api/auth/api-keys`), 활성/비활성 토글(`PATCH /api/auth/api-keys/:id/toggle`), 폐기/삭제(`DELETE /api/auth/api-keys/:id`) 엔드포인트 구현 (발급 시 1회만 평문 키 반환, DB에는 SHA-256 해시 및 접두어 `keyPrefix` 저장)
  - API Key 검증 메서드(`validateApiKey`) 구현 (만료일, `isActive`, 사용자 `isActive` 및 스코프 확인, `lastUsedAt` 갱신)
  - `@nestjs/swagger` 데코레이터 작성

### [Phase 2] 백엔드 내장 원격 MCP 서버 & 읽기(Read) 기능 구현 (완료 ✅)
> **목표**: `apps/api` 내에 원격 SSE MCP 엔드포인트를 구축하고, 모든 읽기 전용 Resources / Tools / Prompts를 제공합니다.

- [x] **의존성 및 모듈 구성**
  - `apps/api/package.json`에 `@modelcontextprotocol/sdk`, `zod` 추가
  - `apps/api/src/modules/mcp/` 신설 (`mcp.module.ts`, `mcp.controller.ts`, `mcp-server.service.ts`) 및 `AppModule` 등록
- [x] **원격 SSE 트랜스포트 및 인증 바인딩**
  - `GET /api/mcp/sse`: `X-API-Key` 헤더/쿼리 또는 `Authorization: Bearer <JWT>` 인증 후 세션별 `McpServer` 생성 및 `SSEServerTransport` 연결
  - `POST /api/mcp/messages`: `sessionId` 매핑 및 NestJS 전역 `json()` 파서(`apps/api/src/main.ts`)와 충돌하지 않도록 `transport.handlePostMessage(req, res, req.body)` 형태로 parsed body 전달 검증
  - `GET /api/mcp/health`: `@SkipLicenseCheck()` 적용 및 지원 Capabilities 반환
- [x] **Read Resources / Tools / Prompts 구현**
  - Resources 4종(`lemail://user/profile`, `lemail://mail/folders`, `lemail://mail/inbox/recent`, `lemail://calendar/today`) 등록
  - Read Tools 9종(`get_my_profile`, `list_folders`, `list_mails`, `search_mails`, `get_mail_detail`, `search_contacts`, `list_company_users`, `list_calendars`, `list_events`) 등록
  - Prompts 2종(`daily_mail_briefing`, `reply_mail_draft`) 등록
  - `get_mail_detail` 내 HTML 정제(스크립트/스타일 제거) 및 본문 길이 제한 적용

### [Phase 3] 상태 변경(Write) 도구, 운영 정책 및 웹/모바일 UI 동기화 (완료 ✅)
> **목표**: 안전한 쓰기 도구와 관리자 운영 정책 제어를 추가하고, 웹과 모바일 PWA 양쪽에 사용자 API Key 관리 UI를 제공합니다.

- [x] **Write Tools 및 스코프 가드 구현**
  - `mcp:write` 스코프 보유 세션에서만 Write Tools 실행 허용 (미보유 시 명확한 권한 안내 에러 반환)
  - 메일(`mark_mail_read`, `toggle_mail_star`, `move_mail`, `delete_mail`, `report_spam`, `create_draft`, `send_mail`), 폴더(`create_folder`), 주소록(`create_contact`), 캘린더(`create_event`, `update_event`) 도구 등록
- [x] **시스템 설정 연동 (`apps/api/src/modules/settings`, `apps/web/src/app/admin/settings`)**
  - DB 시스템 설정에 MCP 활성화 여부(`MCP_SERVER_ENABLED`) 및 직접 발송 허용 여부(`MCP_ALLOW_DIRECT_SEND`, 기본 `false`) 추가
  - `/admin/settings` GUI에서 운영 정책 변경 가능하도록 반영
- [x] **웹 & 모바일 개인설정 내 API Key 발급/관리 UI 동기화 (`ams` 연동 관리 UI 참고)**
  - **데스크톱 웹 (`apps/web`)**: `apps/web/src/app/mail/settings/page.tsx`에 `mcp` 탭(`McpApiKeySettingsTab` 컴포넌트) 추가
  - **모바일 PWA (`apps/mobile`)**: `apps/mobile/src/app/mail/settings/page.tsx`에도 동일한 MCP API Key 발급/관리 UI 반영
  - **UI 핵심 기능 (`ams` `system/integrations` 참고)**:
    - 발급된 키 목록 조회(키 명칭, 설명, `keyPrefix`, 스코프 배지, 만료일, 마지막 사용일시, 활성/비활성 상태) 및 검색/상태 필터
    - **API Key 발급 모달**: 명칭(`name`), 설명(`description`), 만료일(`expiresAt`), 허용 스코프(`mcp:read`, `mcp:write`) 선택
    - **1회 노출 비밀키 확인 모달**: 발급 직후 평문 API Key를 1회만 표시하고 원클릭 복사 및 보안 안내 제공
    - **관리 액션**: 키 활성/비활성 토글 및 영구 삭제(폐기) 확인 다이얼로그
    - **연동 가이드 패널**: 발급된 키를 바로 적용할 수 있는 원격 SSE URL(`/api/mcp/sse`) 및 `claude_desktop_config.json` / Cursor 설정 스니펫 복사 지원

### [Phase 4] 로컬 Stdio MCP 패키지(`packages/mcp-server`) 및 E2E 검증 (완료 ✅)
> **목표**: 로컬 AI 클라이언트용 Stdio 패키지를 제공하고, 패키징/난독화 빌드 및 E2E 테스트를 완료합니다.

- [x] **Stdio 패키지 신설 (`packages/mcp-server`, `@lemail/mcp-server`)**
  - `package.json`, `tsconfig.json`, `bin/lemail-mcp-server.js`, `src/index.ts`, `src/config.ts`, `src/api-client.ts`, `README.md` 구현
  - 환경 변수(`LEMAIL_API_URL`, `LEMAIL_API_KEY` 또는 `LEMAIL_API_TOKEN`, `LEMAIL_EMAIL`/`LEMAIL_PASSWORD`) 지원 및 `POST /api/auth/exchange-api-key` 연동
  - Phase 2~3과 동일한 Resources(4종) / Tools(20종) / Prompts(2종)를 REST API 어댑터로 등록
- [x] **패키징·난독화·문서 현행화**
  - `scripts/package-dist.js` (`packages/*` 워크스페이스 포함) 확인 및 `yarn --cwd packages/mcp-server build`, `yarn --cwd apps/api build` 통과
  - `scripts/test-mcp-server.js` E2E 검증 스크립트 작성 및 실행 통과 (`tools=20`, `resources=4`, `prompts=2`, `/api/mcp/health` ONLINE)

---

## ✅ 4. 구현 완료 검증 기준

1. `npm --prefix apps/api run schema:init` 실행 시 오류 및 `[SchemaDrift]` 경고가 없어야 합니다.
2. `yarn --cwd packages/shared-types build` 및 루트 `yarn build`가 타입 오류 없이 통과해야 합니다.
3. `apps/web` 및 `apps/mobile` 개인설정 화면 모두에서 API Key 발급·폐기가 정상 동작해야 합니다.
4. `mcp:read` 스코프 키로는 Write Tool 호출이 차단되고, `mcp.allowDirectSend=false` 상태에서 `send_mail`이 차단되어야 합니다.
5. `yarn package:obfuscate` 실행 후 난독화된 `apps/api/dist` 환경에서도 `/api/mcp/health` 및 SSE 연결이 정상 동작해야 합니다.
