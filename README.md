# LEMail (LineEdge Enterprise Mail Platform)

<p align="center">
  <strong>안정성과 고성능을 제공하는 기업용 올인원 메일 서버 & 웹메일 플랫폼</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20+-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/NestJS-11.x-E0234E?style=flat-square&logo=nestjs&logoColor=white" alt="NestJS" />
  <img src="https://img.shields.io/badge/Next.js-15.x-000000?style=flat-square&logo=next.js&logoColor=white" alt="Next.js" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/Turborepo-2.x-EF4444?style=flat-square&logo=turborepo&logoColor=white" alt="Turborepo" />
  <img src="https://img.shields.io/badge/MySQL-8.x-4479A1?style=flat-square&logo=mysql&logoColor=white" alt="MySQL" />
  <img src="https://img.shields.io/badge/Redis-BullMQ-DC382D?style=flat-square&logo=redis&logoColor=white" alt="Redis" />
</p>

---

## 📌 개요 (Overview)

**LEMail**은 모던 아키텍처 기반의 고성능 엔터프라이즈 메일 & 협업 플랫폼입니다.
**Turborepo** 기반의 모노레포 구조로 설계되어 있으며, 대용량 트래픽 환경에서도 안정적인 메일 수신(SMTP Ingestion), 비동기 MIME 파싱 및 다층 스팸·바이러스 방어, Haraka 기반 아웃바운드 발송(MTA), 표준 IMAP4rev1 서비스, 데스크톱/모바일(PWA) 웹메일, 주소록·캘린더·조직도, 그리고 통합 시스템 관리자 콘솔을 제공합니다.

---

## 📚 엔지니어링 및 배포 문서 (Documentation)

- 📊 **[사용 인원별 시스템 리소스 및 용량 산정 가이드](docs/시스템_리소스_및_용량_산정_가이드.md)**: 100명 ~ 10,000명 이상 전 구간 인프라/하드웨어 스펙, 동시접속 산정식, DB/스토리지 IOPS
- 🌐 **[멀티 인스턴스 및 고가용성(HA) 구성 가이드](docs/멀티_인스턴스_고가용성_구성_가이드.md)**: L4/L7 로드밸런싱, NFS 공유 스토리지, 무상태 API/IMAP/Haraka 스케일 아웃
- 🛠️ **[운영체제별 설치 및 배포 가이드](docs/설치/README.md)**:
  - 🐧 [Linux (Baremetal/VM) 설치 가이드](docs/설치/linux-install.md) (`systemd` 서비스 등록)
  - 🪟 [Windows Server 설치 가이드](docs/설치/windows-install.md) (NSSM 서비스 등록)
  - 🐳 [Docker & Compose 설치 가이드](docs/설치/docker-install.md) (원클릭 컨테이너 배포)
- 📦 **[난독화 배포 패키지 생성 가이드](#-난독화-배포-패키지-생성-obfuscated-distribution-packaging)**: 소스코드 난독화(Obfuscation) 및 고객사 전달용 독립 ZIP 패키지 생성
- 🏷️ **[버전 관리 및 릴리즈 가이드](#-버전-관리-및-릴리즈-version--release-management)**: standard-version 기반 SemVer 및 CHANGELOG 자동화 워크플로우

---

## 🏛 시스템 아키텍처 (System Architecture)

```
                             [ 외부 메일 서버 / 클라이언트 ]
                                           │
         ┌─────────────────────────┬───────┴─────────────────┬─────────────────────────┐
         │ (SMTP Inbound: 2525)    │ (IMAP: 1143 / 1993)     │ (Web: 9000)             │ (Mobile PWA: 9300)
         ▼                         ▼                         ▼                         ▼
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│  apps/api        │      │  services/imap   │      │  apps/web        │      │  apps/mobile     │
│  (SMTP Ingestion)│      │  (IMAP4rev1)     │      │  (Next.js 15)    │      │  (Next.js 15 PWA)│
└────────┬─────────┘      └────────┬─────────┘      └────────┬─────────┘      └────────┬─────────┘
         │                         │                         │                         │
         ▼                         │                         └────────────┬────────────┘
 ┌───────────────┐                 │                                      ▼
 │ Raw Spooling  │                 │                             ┌──────────────────┐
 │ (Disk Spool)  │                 │                             │  apps/api        │
 └───────┬───────┘                 │                             │  (REST API /     │
         │                         │                             │   Swagger Docs)  │
         ▼                         │                             └────────┬─────────┘
 ┌───────────────┐                 │                                      │ (Outbound Send)
 │ BullMQ Queue  │                 │                                      ▼
 └───────┬───────┘                 │                             ┌──────────────────┐
         │ (Job Pop)               │                             │ services/haraka  │
         ▼                         │                             │ (Outbound MTA /  │
 ┌───────────────┐                 │                             │  Relay Engine)   │
 │ Piscina Pool  │                 │                             └────────┬─────────┘
 │ (MIME/Spam/AV)│                 │                                      │
 └───────┬───────┘                 │                                      ▼
         │                         │                             [ 외부 수신 메일 서버 ]
         ▼                         ▼
 ┌─────────────────────────────────────────────────────────────────────────────────┐
 │                                   공통 인프라                                    │
 │  - MySQL 8.x  : 계정, 조직도, 도메인, 폴더, 메일, 주소록, 캘린더, 암호화 시스템 설정 │
 │  - Redis 7.x  : BullMQ 작업 큐, 사서함 캐시, 스팸/속도 제한, IMAP IDLE Pub/Sub     │
 │  - ClamAV     : 실시간 첨부파일 바이러스 검사 데몬 (선택 활성화, Port 3310)         │
 │  - File Store : mail-spool, mail-archive, mail-attachments, license, certs      │
 └─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 📦 모노레포 패키지 구성 (Workspace Structure)

| 구분 | 이름 | 포트 | 설명 |
| :--- | :--- | :--- | :--- |
| **App** | `apps/api` | `9200` (HTTP)<br>`2525` (SMTP) | 코어 REST API 서버, ESMTP 수신 엔진, 스팸/보안/라이선스/협업 모듈 (NestJS 11) |
| **App** | `apps/web` | `9000` (HTTP) | 데스크톱 웹메일(메일·주소록·캘린더), PWA 및 시스템 관리자 콘솔 (Next.js 15 / React 19) |
| **App** | `apps/mobile` | `9300` (HTTP) | 모바일 최적화 웹메일, 주소록·캘린더 및 오프라인 PWA 클라이언트 (Next.js 15 / React 19) |
| **Service** | `services/imap` | `1143` (TCP/STARTTLS)<br>`1993` (IMAPS) | 경량·고성능 자체 구현 IMAP4rev1 마이크로서비스 (Node.js/TypeScript) |
| **Service** | `services/haraka` | `2526` (SMTP) | Haraka 기반 아웃바운드 MTA, 외부 릴레이(Smarthost) 및 라이선스 검증 연동 서비스 |
| **Package** | `packages/shared-types` | - | 프론트엔드/백엔드/마이크로서비스 간 공유 TypeScript 타입 및 인터페이스 |

---

## ✨ 주요 기능 (Key Features)

### 1. 메일 수신 파이프라인 및 다층 보안 방어 (Inbound SMTP & Security)
- **Early Reject & Open Relay 방지**: Redis 및 In-Memory 캐시를 통해 수신 사서함 활성화 상태를 $O(1)$로 검증하여 비인가 릴레이 및 불필요한 트래픽 차단.
- **비차단 디스크 스풀링 (Disk Spooling)**: 네트워크 스트림을 즉시 `.eml` 파일로 안전하게 기록(`mail-spool/`)하여 메모리 누수 방지.
- **BullMQ 비동기 큐 & 멀티스레드 MIME 파싱 (`Piscina`)**: Worker Threads 풀을 이용해 CPU 집약적인 MIME 헤더, 인코딩, 본문 및 대용량 첨부파일 파싱을 이벤트 루프 블로킹 없이 병렬 처리.
- **메일 인증 및 다층 스팸 필터링 (`spam` 모듈)**:
  - `mailauth` 기반 **SPF / DKIM / DMARC** 검증 및 DMARC 리포트 처리.
  - **베이지안(Bayesian) 스팸 학습 필터** 및 규칙 기반 스팸 점수 산정(`spam-score`, `spam-config`).
  - 스팸 의심 메일 자동 **격리함(Quarantine)** 분리 및 관리자/사용자 복구·영구 삭제 지원.
- **첨부파일 보안 & ClamAV 바이러스 검사**: ClamAV 데몬(`3310`) 연동을 통한 실시간 첨부파일 악성코드 검사 및 위험 확장자 차단.
- **계정 방어 (`account-defense`)**: 비정상 로그인/브루트포스 공격 탐지 및 자동 차단.
- **안전한 스토리지 아카이빙**: 날짜 기반 디렉터리(`mail-archive/YYYY-MM/`)로 원본 EML을 영구 보존하고, 첨부파일은 고유 경로로 격리 저장.

### 2. 고신뢰성 아웃바운드 발송 (Outbound Delivery)
- **Haraka 기반 아웃바운드 MTA**: 내장된 고속 Haraka SMTP 서버(`127.0.0.1:2526`)를 통한 신속한 메일 발송 및 바운스 처리.
- **DKIM 자동 서명 & 발송 속도 제한**: 발신 도메인별 DKIM 서명(`dkim-sign`) 및 계정/도메인별 아웃바운드 Rate Limit(`outbound-rate-limit`) 적용.
- **스마트호스트(Smarthost) 동적 릴레이**: 사내 릴레이나 외부 메일 서비스(AWS SES, Google Workspace 등) 연동을 관리자 웹 콘솔(`/admin/settings`)에서 GUI로 실시간 설정.
- **자동 보낸편지함(Sent) 동기화**: 메일 발송 성공 시 사용자 계정의 보낸편지함 폴더에 자동 색인 및 저장.

### 3. 완벽한 표준 지원 IMAP4rev1 마이크로서비스
- **RFC 3501 표준 준수**: `LOGIN`, `SELECT`, `FETCH`, `STORE`, `SEARCH`, `COPY`, `APPEND`, `EXPUNGE`, `NOOP` 등 핵심 명령어 지원.
- **보안 통신 (TLS / STARTTLS)**: 평문 통신 방지를 위한 SAN X.509 SSL/TLS 인증서 및 STARTTLS 핸드셰이크 지원.
- **실시간 IMAP IDLE 지원**: Redis Pub/Sub을 연동하여 새 메일 인바운드 수신 즉시 Outlook, Thunderbird, 모바일 메일 앱에 Push 알림 전송.
- **메일 상태 플래그 동기화**: `\Seen` (읽음), `\Flagged` (중요), `\Answered` (답장), `\Deleted` (삭제) 플래그 완벽 지원.

### 4. 데스크톱 웹메일 & 모바일 전용 PWA (`apps/web`, `apps/mobile`)
- **Next.js 15 & React 19 + Tailwind CSS**: 데스크톱(`9000`)과 모바일 전용(`9300`) UI를 분리 제공하며, 두 앱 모두 **PWA(매니페스트 및 오프라인 페이지)**를 지원.
- **메일함 & 리치 에디터**: 기본 메일함(받은/보낸/임시/스팸/휴지통) 및 무제한 계층형 커스텀 폴더, Quill 리치 텍스트 에디터, 주소록 자동완성(`To`, `Cc`, `Bcc`), 드래그 앤 드롭 첨부파일, 원본 EML 보기 및 다운로드.
- **메일 백업 (`mail-backup`)**: 사용자/관리자 메일함 백업(암호화 ZIP 내보내기 지원) 및 보관 기간 만료 시 자동 정리.
- **주소록 (`contacts`)**: 개인/공용 연락처 관리, 검색 및 **CSV / Excel(`.xlsx`) / vCard(`.vcf`) 가져오기·내보내기**.
- **캘린더 (`calendar`)**: 일정 생성·반복·공유, **`.ics`(iCalendar) 가져오기·내보내기**, 일정 리마인더 알림, **한국 공휴일 자동 연동**.

### 5. 통합 시스템 관리자 콘솔 (`apps/web/admin`)
- **실시간 모니터링 대시보드 (`/admin/dashboard`)**: CPU/메모리 사용률, BullMQ 큐 상태(대기/진행/완료/실패), 사서함 캐시 히트율, 스팸 통계 실시간 시각화.
- **도메인·사용자·사서함·조직도 관리**:
  - 다중 도메인 등록 및 기본 도메인 지정 (`/admin/domains`)
  - 계정 생성, 역할 할당(`SYSTEM_ADMIN`, `USER`), 사서함 할당량(Quota MB) 설정 (`/admin/users`, `/admin/mailboxes`)
  - 부서 계층 구조 및 **조직도 관리·동기화** (`/admin/org`)
- **동적 시스템 설정 GUI (`/admin/settings`)**: `APP_ENCRYPTION_KEY` 기반 **AES-256-GCM 암호화**를 통해 SMTP 릴레이, 작업자 동시성, 보안 정책 등 운영 설정을 DB에 안전하게 저장 및 즉시 반영.
- **보안·정책·감사 관리**:
  - 스팸 필터 규칙 설정 (`/admin/spam-rules`) 및 격리함 관리 (`/admin/quarantine`)
  - 공휴일 관리 (`/admin/holidays`) 및 처리/감사 로그 조회 (`/admin/logs`)
  - **엔터프라이즈 라이선스 관리 (`/admin/license`)**: 라이선스 키 검증, 정원·만료일 조회 및 갱신.

### 6. 엔터프라이즈 라이선스 & TLS 인증서 자동화
- **전 서비스 라이선스 검증**: 비대칭키 서명 기반 라이선스 발급 도구(`tools/license-issuer`)를 제공하며, `apps/api`, `services/haraka`, `services/imap` 전반에서 라이선스 유효성 및 사용자 정원을 검증합니다.
- **TLS 인증서 만료 검사 및 자동 갱신 (`scripts/manage-tls-certs.js`)**: Haraka SMTP, IMAP Server, API Inbound SMTP용 SAN X.509 인증서의 만료일을 검사하고 일괄 생성/갱신합니다.

---

## 🛠 기술 스택 (Tech Stack)

- **언어 및 런타임**: Node.js (v20+ 권장), TypeScript 5.x
- **모노레포 빌드 시스템**: Turborepo 2.x, Yarn Workspaces (v1.22+)
- **백엔드 프레임워크**: NestJS 11.x, TypeORM 1.x, Express, Swagger (OpenAPI 3.0)
- **프론트엔드 프레임워크**: Next.js 15.x (App Router), React 19, Tailwind CSS, Quill, Lucide Icons, DOMPurify
- **데이터베이스 및 캐시**: MySQL 8.x, Redis 7.x, ioredis, BullMQ
- **메일 엔진 & 보안/유틸 라이브러리**:
  - SMTP 수신 & 인증: `smtp-server`, `mailauth` (SPF/DKIM/DMARC)
  - MIME 파싱 & 병렬 처리: `mailparser`, `piscina` (Worker Threads)
  - SMTP 발송: `nodemailer`, `Haraka` (v3.4+)
  - IMAP 프로토콜: `emailjs-imap-handler`, `tls/net`
  - 파일·문서·압축: `archiver`, `archiver-zip-encrypted`, `exceljs`, `pdfkit`

---

## 🚀 시작하기 (Getting Started)

### 1. 사전 요구사항 (Prerequisites)

- **Node.js**: v20.x 이상
- **Yarn**: v1.22.x
- **MySQL**: 8.0 이상 (기본 포트: `3306`)
- **Redis**: 6.x 이상 (기본 포트: `6379`)
- **ClamAV** *(선택 사항)*: 실시간 바이러스 검사 사용 시 `3310` 포트 연동 (최소 4GB RAM 권장)

### 2. 저장소 클론 및 패키지 설치

```bash
git clone <repository-url>
cd LE-Mail

# 모노레포 전체 의존성 설치
yarn install
```

### 3. 환경 변수 설정 (`.env`)

프로젝트 루트의 `.env.example`을 복사하여 `.env` 파일을 생성합니다.
초기 설치용 `.env`에는 인프라 연결 및 부트스트랩 필수 항목만 포함되며, 스마트호스트 릴레이·작업자 동시성 등 세부 운영 설정은 최초 기동 후 **관리자 웹 콘솔(`/admin/settings`)**에서 GUI로 구성합니다.

```bash
cp .env.example .env
```

#### 주요 환경 변수 설정 항목 (`.env.example` 기준):
```ini
# 1. MySQL Database Connection (부트스트랩 필수)
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USERNAME=lemail
DB_PASSWORD=your_mysql_password
DB_DATABASE=lemaildb

# 2. Redis Infrastructure Connection (작업 큐 & 캐시)
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# 3. ClamAV Antivirus Daemon (저사양 환경 시 false 설정)
CLAMAV_HOST=127.0.0.1
CLAMAV_PORT=3310
CLAMAV_ENABLED=true
CLAMAV_TIMEOUT_MS=3000

# 4. IMAP Service & TLS Certificates
IMAP_PORT=1143
IMAPS_PORT=1993
IMAP_STARTTLS=true
# IMAP_TLS_CERT=/opt/lemail/certs/fullchain.pem
# IMAP_TLS_KEY=/opt/lemail/certs/privkey.pem

# 5. Default System Administrator (최초 부트스트랩 시 1회 시딩)
DEFAULT_ADMIN_EMAIL=admin@lineedge.com
DEFAULT_ADMIN_PASSWORD=admin1234!
DEFAULT_ADMIN_NAME=시스템관리자

# 6. Security & Master Encryption Key
JWT_SECRET=lemail_super_secret_jwt_key_2026!
JWT_EXPIRES_IN=1d
# 32바이트(64자리 Hex) 마스터 대칭키 (비워두면 최초 실행 시 .encryption_key 자동 생성)
APP_ENCRYPTION_KEY=

# 7. Shared Disk Storage & License Paths
MAIL_SPOOL_DIR=/opt/lemail/mail-spool
MAIL_ARCHIVE_DIR=/opt/lemail/mail-archive
MAIL_ATTACHMENT_DIR=/opt/lemail/mail-attachments
LICENSE_FILE_PATH=/opt/lemail/license/lemail-license.lic
```

### 4. 데이터베이스 스키마 초기화

MySQL 데이터베이스에 필요한 테이블(`domain`, `mailbox`, `user`, `mail_message`, `mail_folder`, `user_mail`, `system_settings`, `contacts`, `calendar_events` 등)을 생성합니다. (`apps/api` 기동 시에도 `DatabaseModule`이 `syncDatabaseSchema()`를 자동 실행합니다.)

```bash
yarn --cwd apps/api schema:init
```

---

## 💻 실행 방법 (Running the Applications)

### 전체 서비스 동시 실행 (개발 모드)

Turborepo를 이용하여 API, Web, Mobile, IMAP, Haraka 서비스를 한 번에 병렬로 실행합니다.

```bash
yarn dev
```

### 개별 서비스 실행

| 서비스 | 개발 모드 (Dev) | 프로덕션 모드 (Start) | 빌드 (Build) |
| :--- | :--- | :--- | :--- |
| **API Server** | `yarn api:dev` | `yarn --cwd apps/api start:prod` | `yarn api:build` |
| **Web Frontend** | `yarn web:dev` | `yarn --cwd apps/web start` | `yarn web:build` |
| **Mobile PWA** | `yarn mobile:dev` | `yarn --cwd apps/mobile start` | `yarn mobile:build` |
| **IMAP Service** | `yarn imap:dev` | `yarn imap:start` | `yarn imap:build` |
| **Haraka MTA** | `yarn haraka:dev` | `yarn haraka:start` | - |

---

## 🌐 서비스 접속 정보 (Default URLs)

| 서비스 | URL / 주소 | 설명 |
| :--- | :--- | :--- |
| **Webmail & Admin** | [http://localhost:9000](http://localhost:9000) | 데스크톱 웹메일 및 관리자 콘솔 |
| **Mobile Webmail (PWA)** | [http://localhost:9300](http://localhost:9300) | 모바일 최적화 웹메일 및 PWA 클라이언트 |
| **REST API Server** | [http://localhost:9200](http://localhost:9200) | 백엔드 API 서버 |
| **Swagger API Docs** | [http://localhost:9200/api/docs](http://localhost:9200/api/docs) | OpenAPI 3.0 대화형 API 명세서 |
| **ESMTP Inbound** | `localhost:2525` | 메일 수신 포트 |
| **Haraka Outbound** | `localhost:2526` | 내부 메일 발송 릴레이 |
| **IMAP Server** | `localhost:1143` (STARTTLS)<br>`localhost:1993` (IMAPS) | IMAP4 클라이언트 연동 포트 |

> **초기 관리자 계정**: `admin@lineedge.com` / `admin1234!` (부트스트랩 시 자동 생성)

---

## 🧪 테스트 및 운영 유틸리티 (Testing & Utilities)

### e2e 및 보안 테스트

```bash
# 전체 수신 파이프라인 (스풀링, BullMQ, Piscina 파싱, DB 저장) 검증
yarn test:pipeline

# SMTP 수신 및 연결 e2e 테스트
yarn test:smtp

# Open Relay 차단, 악성 요청, DoS 방어 등 프로덕션 보안 테스트
yarn test:security

# REST API 엔드포인트 동작 검증
yarn test:api

# 사용자 인증 및 권한(JWT) 검증
yarn test:users

# 엔터프라이즈 라이선스 서명·검증 및 보안 테스트
yarn test:license
```

### TLS 인증서 및 라이선스 관리 CLI

```bash
# TLS 인증서 만료일 점검 (Haraka, IMAP, API Inbound SMTP)
yarn certs:check

# TLS 인증서 일괄 발급/갱신 (SAN X.509)
yarn certs:renew

# 라이선스 서명 키 쌍 생성 및 환경별 라이선스 발급
yarn license:generate-keys
yarn license:issue:dev
yarn license:issue:prod
```

---

## 🏷️ 버전 관리 및 릴리즈 (Version & Release Management)

LEMail 모노레포는 **[standard-version](https://github.com/conventional-changelog/standard-version)**을 기반으로 **Semantic Versioning(SemVer)** 및 자동화된 변경 이력(`CHANGELOG.md`) 관리를 수행합니다.

### 1. 릴리즈 자동화 워크플로우

- **Conventional Commits 기반 분석**: Git 커밋 메시지 유형(`feat`, `fix`, `perf`, `refactor`, `chore`, `docs` 등)을 분석하여 버전을 자동으로 결정합니다.
- **모노레포 전체 버전 동기화**: 단일 릴리즈 명령으로 루트 `package.json`뿐만 아니라 `apps/api`, `apps/web`, `apps/mobile`, `services/imap`, `services/haraka`, `packages/shared-types`의 버전이 일괄 갱신됩니다.
- **내부 의존성 및 Lockfile 자동 동기화 (`postbump`)**: 버전 범프 직후 `scripts/sync-workspace-deps.js`가 자동으로 실행되어 각 하위 패키지의 `@lemail/shared-types` 의존성 버전을 맞추고, `yarn install`을 통해 `yarn.lock` 트리를 동기화하여 릴리즈 커밋에 함께 스테이징합니다.
- **Git 커밋 및 태그 자동 생성**: `vX.Y.Z` 형식의 릴리즈 커밋과 Git 태그를 생성합니다.

### 2. 릴리즈 명령어

| 명령어 | 유형 | 설명 |
| :--- | :--- | :--- |
| `yarn release` | **자동 산정** | 커밋 히스토리를 분석하여 적절한 버전(Patch/Minor/Major)을 자동 판별 후 릴리즈 |
| `yarn release:patch` | **Patch (x.x.▲)** | 버그 수정, 핫픽스, 소규모 개선 릴리즈 (예: `1.2.1` ➔ `1.2.2`) |
| `yarn release:minor` | **Minor (x.▲.0)** | 하위 호환성을 유지하는 신규 기능 추가 릴리즈 (예: `1.1.0` ➔ `1.2.0`) |
| `yarn release:major` | **Major (▲.0.0)** | 하위 호환성을 깨는 중대한 아키텍처/API 변경 릴리즈 (예: `1.2.2` ➔ `2.0.0`) |
| `yarn release:dry` | **시뮬레이션** | 실제 커밋/태깅 없이 버전 번호 및 `CHANGELOG.md` 생성 결과를 미리 확인 (Dry-Run) |

### 3. 표준 릴리즈 절차

```bash
# 1. 작업 내용 커밋 완료 및 Git 작업 디렉터리 상태 확인
git status

# 2. 릴리즈 시뮬레이션 (버전 변경 및 CHANGELOG 내용 사전 검토)
yarn release:dry

# 3. 릴리즈 실행 (버전 범프, 의존성 동기화, CHANGELOG 생성, Git 태그 생성)
yarn release

# 4. 원격 저장소로 커밋 및 릴리즈 태그 푸시
git push --follow-tags origin main
```

---

## 🛡️ 난독화 배포 패키지 생성 (Obfuscated Distribution Packaging)

LEMail은 엔터프라이즈 고객사 설치 및 운영 환경 배포 시 **지적재산권(IP) 보호, 소스코드 유출 방지 및 파일 경량화**를 위해 JavaScript 난독화(`javascript-obfuscator`)가 적용된 독립 배포 패키지(ZIP) 생성 스크립트(`scripts/package-dist.js`)를 제공합니다.

### 1. 배포 패키징 명령어

```bash
# 1. 난독화 배포 패키지 생성 (운영 배포 기본 권장)
yarn package:obfuscate
# 또는 직접 실행:
node scripts/package-dist.js --obfuscate

# 2. 표준 배포 패키지 생성 (난독화 미적용 일반 빌드 패키지)
yarn package
# 또는:
yarn dist:package
```

### 2. 난독화 배포 패키지 생성 순서 및 처리 과정

`yarn package:obfuscate`를 실행하면 다음 **5단계 파이프라인**이 자동으로 진행됩니다:

```
[1/5] 빌드 산출물 확인 및 난독화 컴파일
  ├── packages/shared-types: tsc 타입 빌드
  ├── apps/api: nest build ➔ 메타데이터/소스맵 제거 ➔ JS 난독화 ➔ dist/index.js 래퍼 생성
  ├── services/imap: tsc 컴파일 ➔ 소스맵 제거 ➔ JS 난독화
  ├── services/haraka: 플러그인 및 스크립트 .js 파일 대상 인라인 난독화 처리
  ├── apps/web: Next.js 15 프로덕션 최적화 빌드 (next build)
  └── apps/mobile: Next.js 15 모바일 PWA 프로덕션 빌드 (next build)
        │
        ▼
[2/5] bin 스테이징 디렉터리 초기화
  └── bin/lemail_v{version}_{date}_obfuscated/ 임시 디렉터리 준비
        │
        ▼
[3/5] 운영 배포 패키지 구성요소 복사 및 경량화
  ├── 루트: 운영 전용 package.json (dev 의존성 제거, pm2/start 실행 스크립트 구성) 및 yarn.lock
  ├── apps/api: dist/ (난독화 JS), swagger.json, 운영용 package.json
  ├── apps/web: .next/ (cache 제외), public/, scripts/, next.config.mjs, 운영용 package.json
  ├── apps/mobile: .next/ (cache 제외), public/, scripts/, next.config.mjs, 운영용 package.json
  ├── services/imap: dist/ (난독화 JS), keys/, 운영용 package.json
  ├── services/haraka: 난독화된 JS 파일, config/ (불필요한 docs, README 제외)
  └── 공통 운영 파일: ecosystem.config.js (PM2 설정), .env.example, license_dev.lic, swagger.json, docs/
        │
        ▼
[4/5] 고압축 ZIP 아카이브 생성
  └── archiver (Zlib Level 9 최고 압축률) 기반 단일 ZIP 파일 생성
      산출물: bin/lemail_v{version}_{YYYYMMDD}_obfuscated.zip
        │
        ▼
[5/5] 패키징 검증 및 완료 안내
  └── 최종 압축 파일 크기(MB), 스테이징 디렉터리 및 아카이브 파일 경로 출력
```

#### 💡 난독화(Obfuscation) 보안 및 런타임 안정성 보장 사항:
- **개발 메타데이터 완전 제거**: 빌드 산출물에서 `.js.map`(소스맵), `.d.ts` 및 `.d.ts.map`(타입 정의)을 완전히 삭제하여 역공학 및 원본 코드 추적을 차단합니다.
- **백엔드 프레임워크 런타임 호환성 (`apps/api`)**:
  - `renameProperties: false`: NestJS 의존성 주입(DI), TypeORM 엔티티 컬럼 매핑 및 DTO 유효성 검증 필드명을 온전하게 유지하여 런타임 오류를 방지합니다.
  - `controlFlowFlattening: false`: 비동기(`async/await`) 호출 스택과 I/O 성능에 미치는 오버헤드를 최소화하고 안정적인 예외 추적을 보장합니다.
  - `stringArrayEncoding: ['base64']`: 중요한 문자열 및 내부 로직을 Base64 회전 배열로 암호화합니다.
- **자동 부트스트랩 래퍼**: 난독화 빌드 완료 후 `dist/index.js`가 자동 생성되어 운영 환경에서 일관된 진입점(`node dist/index.js`)을 제공합니다.

### 3. 생성된 배포 패키지 구성 (`bin/` 디렉터리)

패키징이 완료되면 프로젝트 루트의 `bin/` 디렉터리에 산출물이 저장됩니다:

```
bin/
├── lemail_v1.2.2_20261114_obfuscated.zip   # 고객사 전달용 최종 압축 배포 파일
└── lemail_v1.2.2_20261114_obfuscated/       # 압축 전 스테이징 폴더 (검증용)
    ├── package.json                        # 운영 전용 경량화 package.json
    ├── yarn.lock                           # 의존성 락파일
    ├── ecosystem.config.js                 # PM2 프로세스 매니저 설정 파일 (5개 서비스)
    ├── .env.example                        # 환경 변수 템플릿
    ├── license_dev.lic                     # 기본 라이선스 파일
    ├── swagger.json                        # REST API 명세서
    ├── docs/                               # 시스템 및 OS별 설치 가이드
    ├── packages/shared-types/              # 공용 타입 빌드 산출물
    ├── apps/
    │   ├── api/                            # 난독화된 NestJS 백엔드 (dist/, package.json)
    │   ├── web/                            # 프로덕션 빌드 Next.js 15 웹메일 (.next/, public/)
    │   └── mobile/                         # 프로덕션 빌드 Next.js 15 모바일 PWA (.next/, public/)
    └── services/
        ├── imap/                           # 난독화된 IMAP4rev1 서비스 (dist/, package.json)
        └── haraka/                         # 난독화된 Haraka MTA 엔진
```

### 4. 고객사/운영 서버 배포 및 서비스 기동 절차

운영 서버에서는 소스코드 빌드 과정(`yarn build`) 없이 압축 해제 후 운영 의존성만 설치하여 즉시 기동합니다:

```bash
# 1. 배포 패키지 압축 해제
unzip lemail_v1.2.2_20261114_obfuscated.zip -d /opt/lemail
cd /opt/lemail/lemail_v1.2.2

# 2. 운영 전용 의존성 설치 (devDependencies 제외로 신속한 설치)
yarn install --production

# 3. 환경 변수 설정
cp .env.example .env
# vi .env (MySQL, Redis, ClamAV, 공유 디스크 경로 등 인프라 정보 입력)

# 4. 데이터베이스 스키마 초기화
node apps/api/dist/modules/database/scripts/init-schema.js

# 5. PM2 프로세스 매니저로 전체 5개 서비스 백그라운드 기동 (권장)
pm2 start ecosystem.config.js
pm2 save
pm2 startup

# 또는 PM2 관리 명령어 활용
yarn pm2:status   # 전체 서비스 상태 확인 (api, web, mobile, imap, haraka)
yarn pm2:logs     # 실시간 통합 로그 확인
yarn pm2:restart  # 전체 서비스 재시작
```

---

## 📂 디렉터리 구조 상세 (Directory Tree)

```
LE-Mail/
├── apps/
│   ├── api/                      # NestJS 11 백엔드 & SMTP 엔진
│   │   ├── src/
│   │   │   ├── config/           # 환경설정 및 Joi 유효성 검증
│   │   │   ├── modules/
│   │   │   │   ├── auth/         # JWT 인증 및 가드
│   │   │   │   ├── calendar/     # 일정, .ics 연동, 리마인더, 한국 공휴일
│   │   │   │   ├── contacts/     # 주소록, CSV/Excel/vCard 가져오기·내보내기
│   │   │   │   ├── database/     # TypeORM 엔티티 및 스키마 초기화 스크립트
│   │   │   │   ├── domain/       # 다중 도메인 관리
│   │   │   │   ├── license/      # 엔터프라이즈 라이선스 검증 및 관리
│   │   │   │   ├── mail/         # 메일 조회, 발송, 첨부파일, EML 다운로드
│   │   │   │   ├── mail-backup/  # 암호화 ZIP 메일 백업 및 자동 정리
│   │   │   │   ├── mail-folder/  # 계층형 메일함 폴더 관리
│   │   │   │   ├── mailbox/      # 사서함 및 할당량 관리
│   │   │   │   ├── monitoring/   # 큐 및 시스템 리소스 모니터링
│   │   │   │   ├── org/          # 부서 계층 및 조직도 동기화
│   │   │   │   ├── queue/        # BullMQ Producer 및 Processor
│   │   │   │   ├── seed/         # 초기 시스템 관리자 및 도메인 시딩
│   │   │   │   ├── settings/     # AES-256-GCM 암호화 기반 동적 DB 설정
│   │   │   │   ├── smtp-ingestion/ # SMTPServer 기반 인바운드 수신 엔진
│   │   │   │   ├── spam/         # 베이지안 스팸 필터, 격리함, ClamAV, DKIM/DMARC, 계정 방어
│   │   │   │   ├── users/        # 사용자 계정 관리
│   │   │   │   └── worker-pool/  # Piscina 멀티스레드 MIME 파서
│   │   │   └── main.ts
│   │   └── test/                 # e2e 파이프라인, 보안 및 라이선스 테스트 스크립트
│   ├── web/                      # Next.js 15 / React 19 데스크톱 웹메일 & 관리자 콘솔
│   │   └── src/app/              # App Router (admin, mail, login, offline)
│   └── mobile/                   # Next.js 15 / React 19 모바일 전용 웹메일 & PWA
│       └── src/app/              # App Router (mail, login, offline, manifest.ts)
├── services/
│   ├── haraka/                   # Haraka 기반 아웃바운드 MTA (릴레이, 라이선스 체크)
│   │   ├── config/               # Haraka smtp, dns, log 설정
│   │   ├── plugins/              # 릴레이 라우팅 커스텀 플러그인
│   │   ├── license-checker.js    # 아웃바운드 라이선스 검증기
│   │   └── index.js
│   └── imap/                     # IMAP4rev1 독립 마이크로서비스
│       ├── src/
│       │   ├── handlers/         # AUTH, FOLDER, MESSAGE, APPEND 핸들러
│       │   ├── protocol/         # IMAP 응답 및 상태 상수
│       │   ├── server/           # TCP/TLS 소켓 서버 및 세션 상태 머신
│       │   └── services/         # DB, 라이선스 및 Redis Pub/Sub(IDLE 푸시) 연동
├── packages/
│   └── shared-types/             # 모노레포 공용 TypeScript 타입 정의
├── scripts/
│   ├── manage-tls-certs.js       # SAN X.509 TLS 인증서 점검 및 자동 갱신
│   ├── package-dist.js           # 난독화 및 표준 배포 ZIP 패키징 스크립트
│   └── sync-workspace-deps.js    # 릴리즈 시 워크스페이스 내부 의존성 동기화
├── tools/
│   └── license-issuer/           # 엔터프라이즈 라이선스 키 생성 및 발급 CLI
├── docs/                         # 시스템 용량 산정, HA 구성, OS별 설치 가이드
├── ecosystem.config.js           # PM2 5개 서비스 통합 운영 설정
├── CHANGELOG.md                  # standard-version 자동 생성 변경 이력
└── package.json                  # 모노레포 루트 패키지 설정
```

---

## 🔒 라이선스 (License)

This project is proprietary and confidential.
Copyright © LineEdge. All rights reserved.
