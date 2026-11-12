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

---

## 📋 핵심 공통 인프라 요구사항

모든 배포 환경에서 안정적인 운영을 위해 다음 5대 컴포넌트 구성을 준수해야 합니다:

1. **Nginx 리버스 프록시**:
   * 웹메일(9000), REST API(9200) 라우팅 및 HTTPS(443) 강제 리다이렉트
   * 대용량 첨부파일 업로드 제한 해제(`client_max_body_size 50M`)
2. **ClamAV 안티바이러스 데몬**:
   * 첨부파일 바이러스/악성코드 실시간 검사를 위한 `clamd` TCP 포트(`3310`) 활성화
   * `freshclam` 바이러스 시그니처 최신 업데이트
3. **Redis 캐시 & 작업 큐 (requirepass 필수)**:
   * 메일 비동기 처리 큐(BullMQ) 보호를 위해 인증 패스워드(`requirepass`) 반드시 적용
   * 메시지 유실 방지를 위한 AOF(`appendonly yes`) 및 메모리 정책(`maxmemory-policy noeviction`) 구성
4. **SSL / TLS 보안 인증서**:
   * **웹 SSL**: Nginx HTTPS(443) 인증서 (`fullchain.pem`, `privkey.pem`)
   * **IMAP TLS**: `.env`의 `IMAP_TLS_CERT`, `IMAP_TLS_KEY` 설정 (STARTTLS 및 IMAPS 1993 지원)
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
   * 도메인 및 사서함 계정 생성 후 메일 송수신 테스트.
