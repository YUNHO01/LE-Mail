# 🛠️ LEMail 시스템 설치 및 배포 가이드

본 디렉터리는 LEMail 엔터프라이즈 메일 플랫폼을 운영 환경에 설치·배포하기 위한 상세 가이드를 제공합니다.
LEMail은 **사전 빌드/난독화된 배포 패키지 파일(`lemail_vX.Y.Z_*.zip`)**을 통해 배포되며, 인프라 환경(운영체제, 컨테이너화 여부)에 맞는 가이드를 선택하여 진행하십시오.

---

## 📌 설치 방식별 가이드 맵

| 설치 방식 | 대상 환경 | 가이드 문서 바로가기 | 주요 특징 |
| :--- | :--- | :--- | :--- |
| 🐧 **Linux (Baremetal / VM)** | Ubuntu 22.04+, RHEL/Rocky Linux 8/9 | [Linux 설치 가이드](linux-install.md) | **PM2 프로세스 매니저(권장)** 및 `systemd` 데몬 서비스 등록, ClamAV 데몬 연동, Nginx 리버스 프록시 및 SSL/TLS 적용 |
| 🪟 **Windows Server** | Windows Server 2019/2022, Windows 10/11 | [Windows 설치 가이드](windows-install.md) | **PM2(권장)** 및 Windows 백그라운드 서비스(NSSM), Memurai(Redis 호환), ClamAV for Windows, Nginx for Windows |
| 🐳 **Docker (Containerized)** | Docker Engine 24+, Docker Compose v2 | [Docker 설치 가이드](docker-install.md) | `docker-compose.yml` 원클릭 배포, ClamAV 및 Redis(`requirepass`) 일체형 컨테이너 격리 배포 |
| 📧 **메일 클라이언트 연동** | Outlook, Thunderbird, Apple Mail 등 | [메일 클라이언트 연동 가이드](../메일_클라이언트_연동_가이드.md) | 외부 메일 클라이언트 IMAP(`993`/`143`) · SMTP(`25`/`587` STARTTLS) 설정 및 트러블슈팅 |

---

## 📋 핵심 공통 인프라 요구사항

모든 배포 환경에서 안정적인 운영을 위해 다음 5대 컴포넌트 구성을 준수해야 합니다:

1. **Nginx 리버스 프록시**:
   * 웹메일(9000), 모바일 PWA(9300), REST API(9200) 라우팅 및 HTTPS(443) 강제 리다이렉트
   * 대용량 첨부파일 업로드 제한 해제(`client_max_body_size 50M`)
2. **ClamAV 안티바이러스 데몬**:
   * 첨부파일 바이러스/악성코드 실시간 검사를 위한 `clamd` TCP 포트(`3310`) 활성화
   * `freshclam` 바이러스 시그니처 최신 업데이트
3. **Redis 캐시 & 작업 큐 (requirepass 필수)**:
   * 메일 비동기 처리 큐(BullMQ) 보호를 위해 인증 패스워드(`requirepass`) 반드시 적용
   * 메시지 유실 방지를 위한 AOF(`appendonly yes`) 및 메모리 정책(`maxmemory-policy noeviction`) 구성
4. **SSL / TLS 보안 인증서**:
   * **웹 SSL**: Nginx HTTPS(443) 인증서 (`fullchain.pem`, `privkey.pem`)
   * **메일 TLS (IMAP / SMTP)**: `.env`의 `MAIL_TLS_CERT`, `MAIL_TLS_KEY` 공통 설정 (IMAP STARTTLS/IMAPS 1993, API Inbound SMTP STARTTLS, Haraka MTA 자동 동기화)
   * **SMTP TLS**: Haraka MTA (`services/haraka/config/tls_cert.pem`, `tls_key.pem`) 아웃바운드 암호화
5. **공식 배포 패키지(ZIP) 기반 배포**:
   * 개발 환경 소스코드 빌드(`yarn build`) 불필요
   * 배포 압축 해제 ➔ 운영 의존성 설치(`yarn install --production`) ➔ 스키마 초기화(`node apps/api/dist/modules/database/scripts/init-schema.js`) ➔ 서비스 기동

---

## 🌐 네트워크 방화벽 포트 점검 사항

| 포트 번호 | 프로토콜 | 기본 서비스 | 설명 |
| :--- | :--- | :--- | :--- |
| **80 / 443** | TCP | Webmail / HTTPS | 웹메일 UI 및 시스템 관리자 콘솔 웹 접속 (Nginx) |
| **25** | TCP | Inbound SMTP | 외부 인터넷 메일 서버로부터 메일 수신 (표준 SMTP 포트 ➔ 2525 포워딩) |
| **2525** | TCP | Internal ESMTP | LEMail 내부 ESMTP 수신 엔진 포트 (로컬/프록시) |
| **2526** | TCP | Haraka MTA | Haraka 아웃바운드 발송 릴레이 포트 |
| **143** | TCP | IMAP (STARTTLS) | IMAP 표준 메일 클라이언트 포트 (STARTTLS 암호화) |
| **993** | TCP | IMAPS (SSL/TLS) | 보안 IMAP 클라이언트 전용 포트 (Direct SSL/TLS) |
| **9000** | TCP | Webmail UI | 데스크톱 웹메일 Next.js 포트 (Nginx 프록시로만 노출) |
| **9300** | TCP | Mobile PWA | 모바일 웹메일 PWA Next.js 포트 (Nginx 프록시로만 노출) |
| **9200** | TCP | REST API | 백엔드 API 서비스 포트 (Nginx `/api` 프록시로만 노출) |
| **3310** | TCP | ClamAV Daemon | ClamAV TCP 데몬 통신 포트 (로컬 내부 127.0.0.1 전용) |
| **6379** | TCP | Redis / Memurai | 작업 큐 및 캐시 저장소 (비밀번호 인증 필수, 로컬 전용) |

---

## 🧭 배포 후 초기 구동 및 검증 순서

1. **인프라 기동**: MySQL ➔ Redis (`requirepass` 적용) ➔ ClamAV (`3310` 포트 활성화).
2. **배포 패키지 압축 해제 & 의존성 설치**: `yarn install --production`.
3. **환경 변수(.env) 설정**: DB, Redis 패스워드, ClamAV 포트, TLS 인증서 경로 등록.
4. **DB 스키마 초기화 실행**:
   ```bash
   node apps/api/dist/modules/database/scripts/init-schema.js
   ```
5. **Core Services 기동**:
   * **PM2 프로세스 매니저 사용 시 (권장)**:
     ```bash
     pm2 start ecosystem.config.js
     pm2 save
     ```
   * **systemd / NSSM 사용 시**: 가이드에 따라 개별 서비스 등록 및 활성화 (`systemctl` / `nssm`).
6. **관리자 웹 콘솔 접속 & 검증**:
   * `https://mail.yourdomain.com` 접속 후 관리자 계정 로그인.
   * **스팸 & 보안 관리 (`/admin/spam-rules`)**에서 ClamAV 연결 테스트 실행 (정상 확인).
   * **도메인 관리 (`/admin/domains`)**에서 도메인 등록 후 **도메인 헬스체크**를 실행하여 SPF/DKIM/DMARC 및 **Spamhaus RBL 평판(미등재)** 상태 확인.
   * 사서함 계정 생성 후 외부 메일 송수신 테스트.

---

## 🛡️ Spamhaus RBL (DNSBL) 연동 및 DNS · IP 평판 관리

LEMail은 스팸 메일 유입을 선제적으로 차단하고 발송 도메인의 평판을 진단하기 위해 **Spamhaus(`zen.spamhaus.org`)** 및 **KISA(`spamlist.or.kr`)** RBL(DNSBL)을 기본 연동합니다.

### 1. LEMail에서의 Spamhaus 동작 방식
* **인바운드 SMTP IP 차단 (`RblCheckService`)**:
  * 외부 미인증 SMTP 수신(`MAIL FROM` 단계) 시, 발신 서버의 공인 IPv4 주소를 `zen.spamhaus.org` 및 `spamlist.or.kr`에 실시간 DNS 조회(타임아웃 1,500ms)합니다.
  * 블랙리스트에 등재된 IP로 확인되면 메일 본문 수신 전 연결 단계에서 `554 5.7.1 Service unavailable; Client host [...] blocked using ...` 응답으로 즉시 거부합니다.
  * 사설/루프백 IP(`127.0.0.1`, `10.x.x.x`, `172.16.x.x`, `192.168.x.x`) 및 인증된 발신 세션은 RBL 검사를 우회합니다.
* **아웃바운드 도메인 헬스체크 (`DomainHealthService`)**:
  * 관리자 콘솔의 **도메인 관리 (`/admin/domains`)** 헬스체크 실행 시, 자사 MX 호스트 IP가 `zen.spamhaus.org`에 등재되어 있는지 점검하여 외부 포털(Gmail, Naver 등) 발송 차단 위험을 사전에 진단합니다.

### 2. 설치 시 필수 DNS 리졸버 주의사항 (오탐 차단 방지)
> [!WARNING]
> **공용 오픈 DNS 리졸버(`8.8.8.8`, `1.1.1.1` 등) 사용 시 정상 메일 차단 주의**
> * Spamhaus는 Google Public DNS(`8.8.8.8`), Cloudflare(`1.1.1.1`) 등 대형 공용 오픈 리졸버를 통한 대량 DNSBL 쿼리를 정책상 제한하며, 차단 응답 코드(예: `127.255.255.254`)를 반환할 수 있습니다.
> * LEMail은 RBL DNS 조회 시 A 레코드 응답이 반환되면 차단 대상으로 판단하므로, **서버 DNS로 공용 오픈 리졸버를 사용하면 정상적인 외부 메일까지 RBL에 걸려 차단(오탐)될 수 있습니다.**
> * **권장 구성**: 서버 자체 **로컬 캐싱 전용 DNS 리졸버(`unbound` 또는 `bind9`)**를 사용하거나, **클라우드 VPC 내부 DNS(예: AWS VPC DNS)** 또는 **IDC/ISP 전용 DNS 서버**를 지정하십시오.
> * **방화벽**: RBL 조회를 위해 서버에서 외부 DNS(**UDP/TCP 53 아웃바운드**) 통신이 허용되어 있어야 합니다.

### 3. 자사 서버 공인 IP 사전 점검 및 등재 해제(Delist)
* 신규 서버(특히 클라우드 VM/VPS)에 할당된 공인 IP는 이전 사용자의 이력으로 인해 Spamhaus(PBL/SBL/XBL)에 등재되어 있을 수 있습니다.
* 설치 직후 [Spamhaus IP Lookup](https://check.spamhaus.org/) 또는 LEMail 관리자 콘솔 도메인 헬스체크를 통해 발송 IP의 등재 여부를 확인하십시오.
* 등재되어 있는 경우, 서버 공인 IP에 대한 **역방향 DNS(PTR/rDNS) 레코드**를 메일 서버 호스트명(`mail.yourdomain.com`)으로 먼저 설정한 뒤 Spamhaus 공식 페이지에서 **등재 해제(Delist)**를 신청하십시오.

### 4. 환경 변수 제어 옵션 (`.env`)
폐쇄망·사내망 환경이거나 RBL 정책을 조정해야 하는 경우 `.env` 파일에서 아래 환경 변수로 제어할 수 있습니다(변경 후 `api` 서비스 재시작 필요):

| 환경 변수 | 기본값 | 설명 |
| :--- | :--- | :--- |
| `SMTP_RBL_ENABLED` | `true` | 인바운드 SMTP RBL 실시간 검사 활성화 여부 (`false` 설정 시 비활성화) |
| `SMTP_RBL_SERVERS` | `zen.spamhaus.org,spamlist.or.kr` | 조회할 DNSBL 서버 목록 (쉼표 구분, 예: 공용 DNS 환경에서 KISA만 사용 시 `spamlist.or.kr`) |
