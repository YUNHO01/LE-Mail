---
trigger: always_on
---

# LEMail 프로젝트 아키텍처 및 구현 유지 규칙

본 프로젝트(`LEMail`)의 기존 구현 구조, 보안 정책, 배포 파이프라인과의 정합성을 유지하기 위해 코드 수정 및 기능 추가 시 아래 규칙을 반드시 준수합니다.

## 1. 모노레포 및 공유 타입(`@lemail/shared-types`) 일관성 유지
- 본 저장소는 `apps/api`(9200/2525), `apps/web`(9000), `apps/mobile`(9300), `services/imap`(1143/1993), `services/haraka`(2526), `packages/shared-types`로 구성된 Turborepo 모노레포입니다.
- 여러 앱/서비스 간에 공유되는 Enum, DTO 인터페이스, 응답 타입은 `packages/shared-types/index.ts`에 정의합니다.
- `packages/shared-types`를 수정한 경우, 다른 워크스페이스에서 참조할 수 있도록 반드시 타입 빌드(`yarn --cwd packages/shared-types build`)를 수행하여 `dist/` 산출물을 갱신합니다.
- 새 워크스페이스나 서비스 엔트리포인트가 추가·변경될 경우 `package.json`, `ecosystem.config.js`, `scripts/package-dist.js`, `scripts/sync-workspace-deps.js`, `.versionrc.json`의 정합성을 함께 확인합니다.

## 2. 데스크톱 웹(`apps/web`) & 모바일 PWA(`apps/mobile`) 기능 동기화
- 사용자 메일 및 협업 라우트(`/mail/inbox`, `sent`, `drafts`, `spam`, `trash`, `folder`, `compose`, `view/[id]`, `contacts`, `calendar`, `settings`)는 `apps/web`과 `apps/mobile` 양쪽에 모두 구현되어 있습니다.
- 사용자용 메일·주소록·캘린더·개인설정 기능을 추가하거나 API 연동을 변경할 때는 **특별한 사유가 없는 한 `apps/web`과 `apps/mobile` 양쪽 모두에 동일하게 반영**합니다.
- 관리자 콘솔(`/admin/*`: `dashboard`, `domains`, `holidays`, `license`, `logs`, `mailboxes`, `org`, `quarantine`, `settings`, `spam-rules`, `users`)은 `apps/web` 전용으로 유지합니다.
- 두 프론트엔드 앱 모두 `Next.js 15` / `React 19` 및 PWA(`manifest.ts`, `offline`) 구성을 유지합니다.

## 3. 부트스트랩 환경 변수(`.env`)와 동적 DB 시스템 설정 분리
- 루트 `.env` 및 `.env.example`에는 초기 기동 및 인프라 연결에 필수적인 부트스트랩 설정(MySQL, Redis, ClamAV, IMAP 포트/TLS, 초기 관리자, `JWT_SECRET`, `APP_ENCRYPTION_KEY`, 공유 디스크 경로, `LICENSE_FILE_PATH`)만 둡니다.
- 스마트호스트 릴레이, 작업자 동시성, 스팸/보안 정책 등 런타임 운영 설정은 `.env`에 하드코딩하지 않고 `apps/api/src/modules/settings`를 통해 MySQL에 저장하며, 민감한 값(비밀번호, 시크릿 등)은 반드시 `APP_ENCRYPTION_KEY` 기반 **AES-256-GCM 암호화**를 거쳐 저장하고 `/admin/settings` GUI로 관리합니다.

## 4. 엔터프라이즈 라이선스·보안·TLS 구조 유지
- **전 서비스 라이선스 검증**: 라이선스 정책은 `apps/api`(`license` 모듈), `services/haraka`(`license-checker.js`), `services/imap`에 공통으로 적용되어 있습니다. 라이선스 검증 로직이나 사용자 정원·만료 제한을 변경할 경우 3개 서비스의 동작이 어긋나지 않도록 함께 점검합니다.
- **메일 파이프라인 및 다층 보안**: 인바운드 수신은 `smtp-ingestion`(디스크 스풀링) ➔ `queue`(BullMQ) ➔ `worker-pool`(Piscina MIME 파싱) ➔ `spam`(SPF/DKIM/DMARC, 베이지안/규칙 스팸 필터, 격리함, ClamAV 바이러스 검사) 흐름을 유지합니다.
- **TLS 인증서 경로 일관성**: `scripts/manage-tls-certs.js`가 관리하는 인증서 경로(`services/haraka/config/`, `services/imap/certs/`, `apps/api/certs/`)를 임의로 변경하지 않습니다.

## 5. 난독화 및 프로덕션 패키징 호환성
- `scripts/package-dist.js --obfuscate`는 `apps/api`와 `services/imap`의 빌드 산출물을 난독화하고, `services/haraka`의 `.js` 파일을 인라인 난독화하며, `.js.map` 및 `.d.ts`를 제거합니다.
- 따라서 백엔드·서비스 코드 작성 시 소스맵이나 개발용 TS 파일 경로(`src/...`)에 의존하지 않아야 하며, 난독화 이후에도 `apps/api/dist/index.js`, `services/imap/dist/index.js` 진입점으로 정상 기동되어야 합니다.

## 6. Swagger 명세 및 프로젝트 문서 현행화
- `apps/api`의 컨트롤러/DTO를 추가하거나 수정할 때는 `@nestjs/swagger` 데코레이터를 빠짐없이 작성하여 `/api/docs` 및 `swagger.json` 명세가 실제 API와 일치하도록 유지합니다.
- 신규 서비스, 포트, 환경 변수, 주요 모듈, CLI 스크립트가 추가·변경되면 `README.md` 및 `docs/` 내 관련 가이드 문서를 함께 최신화합니다.
