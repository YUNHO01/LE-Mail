# LEMail (LineEdge Enterprise Mail Platform)

<p align="center">
  <strong>안정성과 고성능을 제공하는 기업용 올인원 메일 서버 & 웹메일 플랫폼</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20+-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/NestJS-11.x-E0234E?style=flat-square&logo=nestjs&logoColor=white" alt="NestJS" />
  <img src="https://img.shields.io/badge/Next.js-14.x-000000?style=flat-square&logo=next.js&logoColor=white" alt="Next.js" />
  <img src="https://img.shields.io/badge/Turborepo-2.x-EF4444?style=flat-square&logo=turborepo&logoColor=white" alt="Turborepo" />
  <img src="https://img.shields.io/badge/MySQL-8.x-4479A1?style=flat-square&logo=mysql&logoColor=white" alt="MySQL" />
  <img src="https://img.shields.io/badge/Redis-BullMQ-DC382D?style=flat-square&logo=redis&logoColor=white" alt="Redis" />
</p>

---

## 📌 개요 (Overview)

**LEMail**은 모던 아키텍처 기반의 고성능 엔터프라이즈 메일 솔루션입니다.
**Turborepo** 기반의 모노레포 구조로 설계되어 있으며, 대용량 트래픽 환경에서도 안정적인 메일 수신(SMTP Ingestion), 비동기 MIME 파싱 및 인덱싱, Haraka 기반 아웃바운드 발송(MTA), 표준 IMAP4rev1 서비스, 그리고 사용자 친화적인 웹메일 및 시스템 관리자 대시보드를 제공합니다.

---

## 🏛 시스템 아키텍처 (System Architecture)

```
                       [ 외부 메일 서버 / 클라이언트 ]
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         │ (SMTP Inbound: 2525)      │ (IMAP: 1143 / 1993)       │ (HTTP: 9000 / 9200)
         ▼                           ▼                           ▼
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│  apps/api        │       │  services/imap   │       │  apps/web        │
│  (SMTP Ingestion)│       │  (IMAP4rev1)     │       │  (Next.js 14)    │
└────────┬─────────┘       └────────┬─────────┘       └────────┬─────────┘
         │                          │                          │
         ▼                          │                          ▼
 ┌───────────────┐                  │                 ┌──────────────────┐
 │ Raw Spooling  │                  │                 │  apps/api        │
 │ (Disk Spool)  │                  │                 │  (REST API Server│
 └───────┬───────┘                  │                 │   Swagger Docs)  │
         │                          │                 └────────┬─────────┘
         ▼                          │                          │
 ┌───────────────┐                  │                          │ (Outbound Send)
 │ BullMQ Queue  │                  │                          ▼
 └───────┬───────┘                  │                 ┌──────────────────┐
         │ (Job Pop)                │                 │ services/haraka  │
         ▼                          │                 │ (Outbound MTA    │
 ┌───────────────┐                  │                 │  / Relay Engine) │
 │ Piscina Pool  │                  │                 └────────┬─────────┘
 │ (MIME Parser) │                  │                          │
 └───────┬───────┘                  │                          ▼
         │                          │                 [ 외부 수신 메일 서버 ]
         ▼                          ▼
 ┌────────────────────────────────────────────────────────┐
 │                      공통 인프라                        │
 │  - MySQL (계정, 도메인, 폴더, 메시지 메타데이터)           │
 │  - Redis (BullMQ 작업 큐, 사서함 캐시, IMAP IDLE Pub/Sub)│
 │  - File Storage (mail-archive, mail-attachments)       │
 └────────────────────────────────────────────────────────┘
```

---

## 📦 모노레포 패키지 구성 (Workspace Structure)

| 구분 | 이름 | 포트 | 설명 |
| :--- | :--- | :--- | :--- |
| **App** | `apps/api` | `9200` (HTTP)<br>`2525` (SMTP) | 코어 REST API 서버 및 고성능 ESMTP 수신 엔진 (NestJS 11) |
| **App** | `apps/web` | `9000` (HTTP) | 반응형 웹메일 클라이언트 및 시스템 관리자 대시보드 (Next.js 14) |
| **Service** | `services/imap` | `1143` (TCP/STARTTLS)<br>`1993` (IMAPS) | 경량·고성능 자체 구현 IMAP4rev1 마이크로서비스 (Node.js/TypeScript) |
| **Service** | `services/haraka` | `2526` (SMTP) | Haraka 기반 아웃바운드 MTA 및 외부 릴레이(Smarthost) 서비스 |
| **Package** | `packages/shared-types` | - | 프론트엔드/백엔드/마이크로서비스 간 공유 TypeScript 타입 및 인터페이스 |

---

## ✨ 주요 기능 (Key Features)

### 1. 강력하고 확장성 있는 메일 수신 파이프라인 (Inbound SMTP)
- **Early Reject & Open Relay 방지**: Redis 및 In-Memory 캐시를 통해 수신 사서함 활성화 상태를 $O(1)$로 검증하여 비인가 릴레이 및 불필요한 트래픽 차단.
- **비차단 디스크 스풀링 (Disk Spooling)**: 네트워크 스트림을 즉시 `.eml` 파일로 안전하게 기록(`mail-spool/`)하여 메모리 누수 방지.
- **BullMQ 비동기 큐 & 분산 작업**: Redis 기반 큐를 통해 대량 유입 메일을 작업자(`InboundMailProcessor`) 단위로 안전하게 소비.
- **멀티스레드 MIME 파싱 (`Piscina`)**: Node.js Worker Threads 풀을 이용하여 CPU 집약적인 MIME 헤더, 인코딩, 본문 및 대용량 첨부파일 파싱을 이벤트 루프 블로킹 없이 병렬 처리.
- **보안 검증**: 수신 메일의 SPF, DKIM, DMARC 결과 기록 및 스팸 분석 토대 제공.
- **안전한 스토리지 아카이빙**: 날짜 기반 디렉터리(`mail-archive/YYYY-MM/`)로 원본 EML을 영구 보존하고, 첨부파일은 고유 해시/UUID 경로로 격리 저장.

### 2. 고신뢰성 아웃바운드 발송 (Outbound Delivery)
- **Haraka 기반 아웃바운드 MTA**: 내장된 고속 Haraka SMTP 서버(`127.0.0.1:2526`)를 통한 신속한 메일 발송.
- **스마트호스트(Smarthost) 릴레이 지원**: 사내 릴레이나 외부 메일 서비스(AWS SES, Google Workspace 등)로 자동 릴레이 연동 가능.
- **자동 보낸편지함(Sent) 동기화**: 메일 발송 성공 시 사용자 계정의 보낸편지함 폴더에 자동 색인 및 저장.

### 3. 완벽한 표준 지원 IMAP4rev1 마이크로서비스
- **RFC 3501 표준 준수**: `LOGIN`, `SELECT`, `FETCH`, `STORE`, `SEARCH`, `COPY`, `APPEND`, `EXPUNGE`, `NOOP` 등 핵심 명령어 지원.
- **보안 통신 (TLS / STARTTLS)**: 평문 통신 방지를 위한 자체 서명 및 정식 SSL/TLS 인증서, STARTTLS 핸드셰이크 지원.
- **실시간 IMAP IDLE 지원**: Redis Pub/Sub을 연동하여 새 메일 인바운드 수신 즉시 Outlook, Thunderbird, 모바일 메일 앱에 Push 알림 전송.
- **메일 상태 플래그 완벽 동기화**: `\Seen` (읽음), `\Flagged` (중요), `\Answered` (답장), `\Deleted` (삭제) 플래그 지원.

### 4. 직관적인 사용자 웹메일 (Webmail UI)
- **Next.js 14 & Tailwind CSS**: 빠르고 유려한 반응형 웹 인터페이스.
- **표준 메일함 & 커스텀 폴더 트리**: 받은편지함, 보낸편지함, 임시보관함, 스팸함, 휴지통 및 무제한 계층형 커스텀 폴더 생성/관리.
- **Quill 리치 텍스트 에디터**: 폰트 서식, 인라인 스타일, 주소록 자동완성 수신자 입력(`To`, `Cc`, `Bcc`).
- **첨부파일 관리**: 드래그 앤 드롭 파일 첨부, 크기 제한 검증 및 개별/전체 다운로드.
- **원본 EML 보기**: 원본 메일 헤더 확인 및 EML 원문 다운로드 기능.

### 5. 통합 시스템 관리자 콘솔 (Admin Dashboard)
- **실시간 모니터링**: CPU/메모리 사용률, BullMQ 큐 상태(대기/진행/완료/실패), 사서함 캐시 히트율 실시간 시각화.
- **도메인 관리**: 다중 도메인 등록, 활성화/비활성화, 기본 시스템 도메인 지정.
- **사용자 및 사서함 관리**: 계정 생성, 역할 할당(`SYSTEM_ADMIN`, `USER`), 사서함 할당량(Quota MB) 설정 및 비밀번호 초기화.
- **처리 로그 및 감사**: 메일 유입/발송 내역 및 시스템 에러 트래킹.

---

## 🛠 기술 스택 (Tech Stack)

- **언어 및 런타임**: Node.js (v20+ 권장), TypeScript 5.x
- **모노레포 빌드 시스템**: Turborepo 2.x, Yarn Workspaces (v1.22+)
- **백엔드 프레임워크**: NestJS 11.x, TypeORM 1.x, Express
- **프론트엔드 프레임워크**: Next.js 14.x (App Router), React 18, Tailwind CSS, Quill
- **데이터베이스 및 캐시**: MySQL 8.x, Redis 7.x, ioredis, BullMQ
- **메일 엔진 & 라이브러리**:
  - SMTP 수신: `smtp-server`
  - MIME 파싱: `mailparser`, `piscina` (Worker Threads)
  - SMTP 발송: `nodemailer`, `Haraka` (v3.4+)
  - IMAP 프로토콜: `emailjs-imap-handler`, `tls/net`

---

## 🚀 시작하기 (Getting Started)

### 1. 사전 요구사항 (Prerequisites)

- **Node.js**: v20.x 이상
- **Yarn**: v1.22.x
- **MySQL**: 8.0 이상 (권장 포트: `3306` 또는 `3300`)
- **Redis**: 6.x 이상 (기본 포트: `6379`)

### 2. 저장소 클론 및 패키지 설치

```bash
git clone <repository-url>
cd LEMail

# 모노레포 전체 의존성 설치
yarn install
```

### 3. 환경 변수 설정 (`.env`)

프로젝트 루트의 `.env.example`을 복사하여 `.env` 파일을 생성하고 환경에 맞게 값을 설정합니다.

```bash
cp .env.example .env
```

#### 주요 환경 변수 설정 항목:
```ini
# HTTP REST API 포트
PORT=9200

# 작업자 병렬 처리 스레드 수
WORKER_CONCURRENCY=5

# SMTP 수신 서버 설정
SMTP_PORT=2525
MAIL_SPOOL_DIR=./mail-spool
MAIL_ARCHIVE_DIR=./mail-archive
MAIL_SPOOL_CLEANUP=false

# MySQL 데이터베이스 설정
DB_HOST=127.0.0.1
DB_PORT=3300
DB_USERNAME=lemail
DB_PASSWORD=your_mysql_password
DB_DATABASE=lemaildb
DB_POOL_SIZE=20

# Redis 설정
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=

# 기본 시스템 관리자 계정 (최초 부트스트랩 시 자동 생성)
DEFAULT_ADMIN_EMAIL=admin@lineedge.com
DEFAULT_ADMIN_PASSWORD=admin1234!
DEFAULT_ADMIN_NAME=시스템관리자

# JWT 인증 시크릿
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=7d

# Haraka 아웃바운드 MTA 설정
HARAKA_HOST=127.0.0.1
HARAKA_PORT=2526
HARAKA_ENABLED=true

# 외부 SMTP 릴레이 (Smarthost - 필요 시 활성화)
SMTP_RELAY_ENABLED=false
SMTP_RELAY_HOST=smtp.gmail.com
SMTP_RELAY_PORT=587
SMTP_RELAY_USER=your_email@gmail.com
SMTP_RELAY_PASS=your_app_password
```

### 4. 데이터베이스 스키마 초기화

MySQL 데이터베이스에 필요한 테이블(`domain`, `mailbox`, `user`, `mail_message`, `mail_folder`, `user_mail` 등)을 생성합니다.

```bash
yarn --cwd apps/api schema:init
```

---

## 💻 실행 방법 (Running the Applications)

### 전체 서비스 동시 실행 (개발 모드)

Turborepo를 이용하여 API, Web, IMAP, Haraka 서비스를 한 번에 병렬로 실행합니다.

```bash
yarn dev
```

### 개별 서비스 실행

| 서비스 | 개발 모드 (Dev) | 프로덕션 모드 (Start) | 빌드 (Build) |
| :--- | :--- | :--- | :--- |
| **API Server** | `yarn api:dev` | `node apps/api/dist/main` | `yarn api:build` |
| **Web Frontend** | `yarn web:dev` | `yarn --cwd apps/web start` | `yarn web:build` |
| **IMAP Service** | `yarn imap:dev` | `yarn imap:start` | `yarn imap:build` |
| **Haraka MTA** | `yarn haraka:dev` | `yarn haraka:start` | - |

---

## 🌐 서비스 접속 정보 (Default URLs)

| 서비스 | URL / 주소 | 설명 |
| :--- | :--- | :--- |
| **Webmail & Admin** | [http://localhost:9000](http://localhost:9000) | 사용자 웹메일 및 관리자 페이지 |
| **REST API Server** | [http://localhost:9200](http://localhost:9200) | 백엔드 API 서버 |
| **Swagger API Docs** | [http://localhost:9200/api/docs](http://localhost:9200/api/docs) | OpenAPI 3.0 대화형 API 명세서 |
| **ESMTP Inbound** | `localhost:2525` | 메일 수신 포트 |
| **Haraka Outbound** | `localhost:2526` | 내부 메일 발송 릴레이 |
| **IMAP Server** | `localhost:1143` (STARTTLS)<br>`localhost:1993` (IMAPS) | IMAP4 클라이언트 연동 포트 |

> **초기 관리자 계정**: `admin@lineedge.com` / `admin1234!` (부트스트랩 시 자동 생성)

---

## 🧪 테스트 실행 (Testing & Verification)

LEMail은 파이프라인 무결성과 안정성을 보장하기 위한 e2e 테스트 스크립트를 제공합니다.

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
```

---

## 📂 디렉터리 구조 상세 (Directory Tree)

```
LEMail/
├── apps/
│   ├── api/                     # NestJS 백엔드 & SMTP 엔진
│   │   ├── src/
│   │   │   ├── config/          # 환경설정 및 Joi 유효성 검증
│   │   │   ├── modules/
│   │   │   │   ├── auth/        # JWT 인증 및 가드
│   │   │   │   ├── database/    # TypeORM 엔티티 및 마이그레이션 스크립트
│   │   │   │   ├── domain/      # 도메인 관리
│   │   │   │   ├── mail/        # 메일 조회, 발송, 다운로드
│   │   │   │   ├── mail-folder/ # 계층형 메일함 폴더 관리
│   │   │   │   ├── mailbox/     # 사서함 관리
│   │   │   │   ├── monitoring/  # 큐 및 시스템 모니터링
│   │   │   │   ├── queue/       # BullMQ Producer 및 Processor
│   │   │   │   ├── seed/        # 초기 시스템 관리자 및 도메인 시딩
│   │   │   │   ├── smtp-ingestion/# SMTPServer 기반 인바운드 수신 엔진
│   │   │   │   ├── users/       # 사용자 계정 관리
│   │   │   │   └── worker-pool/ # Piscina 멀티스레드 MIME 파서
│   │   │   └── main.ts
│   │   └── test/                # e2e 파이프라인 및 보안 테스트 스크립트
│   └── web/                     # Next.js 14 프론트엔드
│       ├── src/
│       │   ├── app/             # App Router (admin, mail, login)
│       │   ├── components/      # 메일 에디터, 폴더 트리, 테이블 등 UI 컴포넌트
│       │   └── contexts/        # Auth Context 및 세션 상태 관리
├── services/
│   ├── haraka/                  # Haraka 기반 아웃바운드 MTA
│   │   ├── config/              # Haraka smtp, dns, log 설정
│   │   ├── plugins/             # 릴레이 라우팅 커스텀 플러그인
│   │   └── index.js
│   └── imap/                    # IMAP4rev1 독립 마이크로서비스
│       ├── src/
│       │   ├── handlers/        # AUTH, FOLDER, MESSAGE, APPEND 핸들러
│       │   ├── protocol/        # IMAP 응답 및 상태 상수
│       │   ├── server/          # TCP/TLS 소켓 서버 및 세션 상태 머신
│       │   └── services/        # DB 및 Redis Pub/Sub(IDLE 푸시) 연동
├── packages/
│   └── shared-types/            # 모노레포 공용 TypeScript 타입 정의
├── mail-archive/                # 수신된 EML 원본 영구 저장소
├── mail-attachments/            # 메일 첨부파일 격리 저장소
├── mail-spool/                  # 수신 중 임시 스풀링 디렉터리
├── turbo.json                   # Turborepo 파이프라인 설정
└── package.json                 # 모노레포 루트 패키지 설정
```

---

## 🔒 라이선스 (License)

This project is proprietary and confidential.
Copyright © LineEdge. All rights reserved.
