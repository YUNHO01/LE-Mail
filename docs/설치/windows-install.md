# 🪟 LEMail Windows Server 설치 가이드

본 문서는 Windows Server 2019 / 2022 및 Windows 10/11 환경에서 LEMail을 직접 설치하고, **Windows 백그라운드 서비스(NSSM 또는 PM2)**로 등록하여 24x365 무중단 운영 환경을 구축하는 방법을 안내합니다.

> [!NOTE]
> Docker Desktop 또는 Docker Engine 기반으로 컨테이너화하여 설치하고자 하시는 경우 [Docker 설치 가이드](docker-install.md)를 참조하십시오.

---

## 1. 사전 필수 소프트웨어 설치

### 1.1 필수 런타임 및 도구
1. **Node.js 20.x LTS (x64)**: [공식 다운로드](https://nodejs.org/)에서 Windows Installer(.msi) 다운로드 후 설치.
2. **Git for Windows**: [공식 다운로드](https://git-scm.com/) 설치 (Bash 툴 포함).
3. **Yarn 패키지 매니저**: PowerShell을 관리자 권한으로 실행 후 설치:
   ```powershell
   npm install -g yarn
   ```
4. **NSSM (Non-Sucking Service Manager)**: [NSSM 공식 사이트](https://nssm.cc/)에서 다운로드 후 `nssm.exe`를 `C:\Windows\System32\`에 배치 (서비스 등록용).

### 1.2 MySQL 8.0 설치
- [MySQL Installer for Windows](https://dev.mysql.com/downloads/installer/)를 다운로드하여 **Server Only** 모드로 설치.
- 포트: 기본 `3306` (또는 지정 포트 `3300`)
- Character Set: `utf8mb4` 지정.
- 서비스명: `MySQL80` (자동 시작 활성화).

### 1.3 Redis for Windows 설치
- Windows 환경에서는 **Memurai** (네이티브 Redis 호환 엔진, 권장) 또는 **Redis for Windows** 설치:
  - [Memurai 공식 사이트](https://www.memurai.com/) 다운로드 및 설치 (Windows 서비스로 자동 등록됨, 기본 포트 `6379`).

---

## 2. Windows 방화벽 인바운드 규칙 등록

PowerShell(관리자 권한)에서 다음 명령을 실행하여 메일 송수신 및 웹 접속 포트를 허용합니다:

```powershell
# 웹메일 및 관리자 콘솔 포트
New-NetFirewallRule -DisplayName "LEMail Web (9000)" -Direction Inbound -LocalPort 9000 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "LEMail API (9200)" -Direction Inbound -LocalPort 9200 -Protocol TCP -Action Allow

# SMTP 인바운드 및 아웃바운드 포트
New-NetFirewallRule -DisplayName "LEMail SMTP Standard (25)" -Direction Inbound -LocalPort 25 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "LEMail ESMTP Inbound (2525)" -Direction Inbound -LocalPort 2525 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "LEMail Haraka Outbound (2526)" -Direction Inbound -LocalPort 2526 -Protocol TCP -Action Allow

# IMAP 및 IMAPS 포트
New-NetFirewallRule -DisplayName "LEMail IMAP (1143)" -Direction Inbound -LocalPort 1143 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "LEMail IMAPS (1993)" -Direction Inbound -LocalPort 1993 -Protocol TCP -Action Allow
```

### 외부 25번 포트 ➔ 내부 2525번 포트포워딩 (선택 사항)
Windows에서 포트 25를 내부 LEMail 수신 포트(`2525`)로 라우팅해야 하는 경우:
```powershell
netsh interface portproxy add v4tov4 listenport=25 listenaddress=0.0.0.0 connectport=2525 connectaddress=127.0.0.1
```

---

## 3. 데이터베이스 생성 및 권한 설정

MySQL Command Line Client 또는 워크벤치를 실행합니다:

```sql
CREATE DATABASE IF NOT EXISTS `lemaildb` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'lemail'@'localhost' IDENTIFIED BY 'StrongPassword123!';
CREATE USER IF NOT EXISTS 'lemail'@'127.0.0.1' IDENTIFIED BY 'StrongPassword123!';
GRANT ALL PRIVILEGES ON `lemaildb`.* TO 'lemail'@'localhost';
GRANT ALL PRIVILEGES ON `lemaildb`.* TO 'lemail'@'127.0.0.1';
FLUSH PRIVILEGES;
```

---

## 4. 소스코드 배포 및 빌드

배포 경로를 `C:\LEMail`로 가정합니다:

```powershell
# 1. 디렉터리 생성 및 소스코드 복사
mkdir C:\LEMail
cd C:\LEMail

# 2. 의존성 설치
yarn install

# 3. 환경 변수 파일 설정
copy .env.example .env
notepad .env
```

### `.env` 핵심 설정값 확인
```ini
NODE_ENV=production
PORT=9200
WEB_PORT=9000

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USERNAME=lemail
DB_PASSWORD=StrongPassword123!
DB_DATABASE=lemaildb

REDIS_HOST=127.0.0.1
REDIS_PORT=6379

JWT_SECRET=YOUR_SUPER_SECURE_JWT_SECRET_KEY_MIN_32_CHAR
ENCRYPTION_KEY=YOUR_HEX_ENCRYPTION_KEY_64_CHAR

# 디렉터리 경로 (Windows 역슬래시 또는 슬래시 지원)
SPOOL_DIR=C:/LEMail/mail-spool
ARCHIVE_DIR=C:/LEMail/mail-archive
ATTACHMENTS_DIR=C:/LEMail/mail-attachments
LICENSE_FILE_PATH=C:/LEMail/apps/api/license/lemail-license.lic
```

```powershell
# 4. DB 테이블 스키마 초기화
yarn --cwd apps/api ts-node src/modules/database/scripts/init-schema.ts

# 5. 전체 모노레포 프로젝트 빌드
yarn build
```

---

## 5. Windows 서비스 데몬 등록 (NSSM 활용)

서버 재부팅 시에도 자동으로 백그라운드 구동되도록 NSSM을 이용하여 4대 서비스를 Windows Service로 등록합니다.

### 5.1 `LEMail-API` 서비스 등록
```powershell
nssm install LEMail-API "C:\Program Files\nodejs\node.exe" "C:\LEMail\apps\api\dist\main.js"
nssm set LEMail-API AppDirectory "C:\LEMail\apps\api"
nssm set LEMail-API AppEnvironmentExtra "NODE_ENV=production"
nssm set LEMail-API Description "LEMail Core REST API & Inbound ESMTP Service"
nssm set LEMail-API Start SERVICE_AUTO_START
```

### 5.2 `LEMail-Web` 서비스 등록
```powershell
nssm install LEMail-Web "C:\Program Files\nodejs\node.exe" "C:\LEMail\node_modules\next\dist\bin\next" "start -p 9000"
nssm set LEMail-Web AppDirectory "C:\LEMail\apps\web"
nssm set LEMail-Web AppEnvironmentExtra "NODE_ENV=production"
nssm set LEMail-Web Description "LEMail Next.js Webmail Client"
nssm set LEMail-Web Start SERVICE_AUTO_START
```

### 5.3 `LEMail-IMAP` 서비스 등록
```powershell
nssm install LEMail-IMAP "C:\Program Files\nodejs\node.exe" "C:\LEMail\services\imap\dist\index.js"
nssm set LEMail-IMAP AppDirectory "C:\LEMail\services\imap"
nssm set LEMail-IMAP AppEnvironmentExtra "NODE_ENV=production"
nssm set LEMail-IMAP Description "LEMail IMAP4rev1 Microservice"
nssm set LEMail-IMAP Start SERVICE_AUTO_START
```

### 5.4 `LEMail-Haraka` 서비스 등록
```powershell
nssm install LEMail-Haraka "C:\Program Files\nodejs\node.exe" "C:\LEMail\services\haraka\index.js"
nssm set LEMail-Haraka AppDirectory "C:\LEMail\services\haraka"
nssm set LEMail-Haraka AppEnvironmentExtra "NODE_ENV=production"
nssm set LEMail-Haraka Description "LEMail Haraka Outbound Relay MTA"
nssm set LEMail-Haraka Start SERVICE_AUTO_START
```

### 5.5 서비스 일괄 시작 및 상태 확인
```powershell
nssm start LEMail-API
nssm start LEMail-Web
nssm start LEMail-IMAP
nssm start LEMail-Haraka

# Windows 서비스 목록에서 실행 상태 확인
Get-Service -Name "LEMail*"
```

---

## 6. 서비스 정상 동작 확인

1. 관리자 PC에서 웹 브라우저를 열고 `http://서버IP:9000/login` 접속.
2. 기본 관리자 계정으로 로그인 (`admin@yourdomain.com`).
3. 관리자 대시보드 및 시스템 상태가 정상적으로 가동 중인지 확인합니다.
4. 관리자 메뉴에서 도메인 및 사서함 계정을 생성하여 메일 송수신 서비스를 개시합니다.
