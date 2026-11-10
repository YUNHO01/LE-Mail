# 🛠️ LEMail 시스템 설치 및 배포 가이드

본 디렉터리는 LEMail 엔터프라이즈 메일 플랫폼을 운영 환경에 설치·배포하기 위한 상세 가이드를 제공합니다.
인프라 환경(운영체제, 컨테이너화 여부)에 맞는 가이드를 선택하여 진행하십시오.

---

## 📌 설치 방식별 가이드 맵

| 설치 방식 | 대상 환경 | 가이드 문서 바로가기 | 주요 특징 |
| :--- | :--- | :--- | :--- |
| 🐧 **Linux (Baremetal / VM)** | Ubuntu 22.04+, RHEL/Rocky Linux 8/9 | [Linux 설치 가이드](linux-install.md) | `systemd` 데몬 서비스 등록, 고성능 네트워크 튜닝, Nginx 리버스 프록시 연동 |
| 🪟 **Windows Server** | Windows Server 2019/2022, Windows 10/11 | [Windows 설치 가이드](windows-install.md) | Windows 백그라운드 서비스(NSSM/PM2), 방화벽 포트 등록, 네이티브 Node/MySQL 구동 |
| 🐳 **Docker (Containerized)** | Docker Engine 24+, Docker Compose v2 | [Docker 설치 가이드](docker-install.md) | `docker-compose.yml` 원클릭 배포, 일체형 컨테이너 격리 및 간편한 볼륨 백업 |

---

## 📋 사전 준비 필수 점검 사항 (Pre-requisites)

모든 설치 방식에서 공통으로 점검해야 할 사전 요구사항입니다:

### 1. 네트워크 포트 방화벽 오픈 (Firewall Ports)

| 포트 번호 | 프로토콜 | 기본 서비스 | 설명 |
| :--- | :--- | :--- | :--- |
| **80 / 443** | TCP | Webmail / HTTPS | 웹메일 및 시스템 관리자 콘솔 웹 접속 (Nginx / ALB) |
| **25** | TCP | Inbound SMTP | 외부 인터넷 메일 서버로부터 메일 수신 (표준 SMTP 포트) |
| **2525** | TCP | Internal ESMTP | LEMail 내부 ESMTP 수신 엔진 포트 |
| **2526** | TCP | Haraka MTA | Haraka 아웃바운드 발송 릴레이 포트 |
| **143 / 1143** | TCP | IMAP (STARTTLS) | IMAP 표준 메일 클라이언트 포트 |
| **993 / 1993** | TCP | IMAPS (SSL/TLS) | 보안 IMAP 클라이언트 전용 포트 |
| **9200** | TCP | REST API | 백엔드 API 서비스 포트 (외부 직접 노출 불필요, 웹 프록시 연결) |

### 2. 도메인 DNS 레코드 설정 (메일 수발신 필수)
- **MX 레코드**: `mail.yourdomain.com` (우선순위 10)
- **A 레코드**: `mail.yourdomain.com` ➔ 공인 IP
- **SPF 레코드 (TXT)**: `"v=spf1 ip4:서버공인IP ~all"`
- **PTR 레코드 (rDNS)**: 공인 IP ➔ `mail.yourdomain.com` (통신사/클라우드 설정 필수 - 미설치 시 Gmail/Outlook에서 스팸 차단)

---

## 🧭 설치 후 초기 구성 순서

1. **인프라(DB / Redis / 스토리지) 기동 및 스키마 초기화**
2. **LEMail 전용 2048-bit RSA 라이선스 키 생성 및 라이선스 발급**
3. **Core Services(API, Web, IMAP, Haraka) 프로세스/컨테이너 기동**
4. **관리자 웹 콘솔(`https://mail.yourdomain.com/admin`) 접속 ➔ 정품 라이선스(.lic) 파일 업로드**
5. **도메인 추가, 관리자/테스트 사서함 계정 생성 후 송수신 검증**
