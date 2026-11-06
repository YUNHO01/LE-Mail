# LEMail IMAP4rev1 Microservice (`@lemail/imap`)

LEMail 플랫폼의 표준 IMAP4rev1(RFC 3501), IDLE(RFC 2177), UIDPLUS(RFC 4315), STARTTLS(RFC 2595/3501) 지원 마이크로서비스입니다.

## 1. 지원 기능 및 프로토콜 규격
- **IMAP4rev1 Core (RFC 3501)**:
  - Welcome 배너, `CAPABILITY`, `NOOP`, `LOGOUT`
  - 인증: `LOGIN`, `AUTHENTICATE PLAIN` (bcrypt 비밀번호 검증)
  - 편지함 관리: `LIST`, `LSUB`, `STATUS`, `SELECT`, `EXAMINE`, `CREATE`, `RENAME`, `DELETE`
  - 메시지 조회: `FETCH`, `UID FETCH` (`FLAGS`, `INTERNALDATE`, `RFC822.SIZE`, `ENVELOPE`, `BODY[]`, `BODY.PEEK[]`, `RFC822`)
  - 플래그 제어: `STORE`, `UID STORE` (`FLAGS`, `+FLAGS`, `-FLAGS`, `.SILENT`)
  - 검색: `SEARCH`, `UID SEARCH` (ALL, UNSEEN, SEEN, FLAGGED, FROM, TO, SUBJECT, BODY 등)
  - 메일 정리: `EXPUNGE`, `COPY`, `MOVE`
- **고급 확장 규격**:
  - **RFC 2177 IDLE**: Redis Pub/Sub(`mailbox:events:${userId}`) 기반 실시간 untagged 푸시 (`* <count> EXISTS`)
  - **RFC 4315 UIDPLUS**: `APPEND` 리터럴 스트리밍 업로드 및 `[APPENDUID <validity> <uid>]` 반환
  - **보안 전송**: 포트 1143 (Plain + STARTTLS), 포트 1993 (Direct TLS / IMAPS)
  - **자동 인증서**: 개발 환경용 Self-Signed 인증서 자동 생성 및 캐싱

---

## 2. 서비스 실행 방법

### 단독 실행
```bash
# 개발 모드 (TypeScript)
yarn --cwd services/imap dev

# 프로덕션 빌드 및 실행
yarn --cwd services/imap build
yarn --cwd services/imap start
```

### 모노레포 통합 실행
루트 `package.json`에서:
```bash
# IMAP 단독 실행
yarn imap:dev

# 전체 모노레포 동시 실행 (API + Web + Haraka + IMAP)
yarn dev
```

---

## 3. 메일 클라이언트 연동 가이드 (Thunderbird, Apple Mail, Outlook)

실제 이메일 클라이언트에서 LEMail 계정을 등록할 때 아래 정보를 입력합니다.

| 설정 항목 | 설정값 |
| :--- | :--- |
| **이메일 주소** | `admin@lineedge.com` (또는 등록된 사용자 이메일) |
| **비밀번호** | 사용자 계정 비밀번호 (기본: `admin1234!`) |
| **수신 메일 서버 (IMAP)** | `127.0.0.1` 또는 `mail.lineedge.com` |
| **IMAP 포트 (권장 1)** | `1993` (보안 설정: **SSL/TLS**) |
| **IMAP 포트 (권장 2)** | `1143` (보안 설정: **STARTTLS** 또는 없음) |
| **인증 방식** | `일반 비밀번호 (Normal Password / PLAIN)` |
| **송신 메일 서버 (SMTP)** | `127.0.0.1` (포트: `2525` 또는 `587`) |

> **참고 (자체 서명 인증서 알림)**: 개발 환경에서는 자체 서명된 TLS 인증서가 자동 발급되므로, 클라이언트 접속 시 "인증서 보안 예외 승인" 확인 창이 나타날 수 있습니다. 정상 동작을 위해 승인하고 진행하시면 됩니다.

---

## 4. 디렉터리 구조
```
services/imap/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts               # 진입점 및 프로세스 시그널 처리
│   ├── config/                # IMAP 포트, 호스트, 환경변수 탐색기
│   ├── protocol/              # IMAP 응답 및 상수 정의
│   ├── server/                # TCP/TLS 소켓 서버, ClientSession 라이프사이클
│   ├── services/              # MySQL DB 풀 및 Redis Pub/Sub 서비스
│   ├── handlers/              # Auth, Folder, Message, Append 핸들러
│   └── utils/                 # IMAP 시퀀스/쿼터/날짜 파서
└── test/
    ├── test-phase2-network.ts # 네트워크 & STARTTLS 검증
    ├── test-phase3-auth-folders.ts # 인증 & 폴더 관리 검증
    ├── test-phase4-messages.ts     # 메시지 조회/플래그/EXPUNGE 검증
    ├── test-phase5-append-idle.ts  # APPEND & IDLE 실시간 푸시 검증
    └── test-phase6-e2e.ts          # 종합 E2E 통합 테스트
```
