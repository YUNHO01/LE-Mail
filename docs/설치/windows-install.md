# 🪟 LEMail Windows Server 배포 및 설치 가이드

본 문서는 Windows Server 2019 / 2022 및 Windows 10/11 환경에서 **사전 빌드/난독화된 배포 패키지 파일(`lemail_vX.Y.Z_*.zip`)**을 기반으로 LEMail을 설치하고, **NSSM(Non-Sucking Service Manager)**을 통해 Windows 서비스로 등록하여 무중단 운영 환경을 구축하는 방법을 안내합니다.

> [!NOTE]
> Docker Desktop 또는 Docker Engine 기반으로 설치하고자 하시는 경우 [Docker 설치 가이드](docker-install.md)를 참조하십시오.

---

## 📌 구성 아키텍처 개요

* **웹 프록시 & SSL**: Nginx for Windows (HTTPS: 443, HTTP: 80 ➔ 443 리다이렉트)
* **메일 프로토콜**: Inbound ESMTP (25/2525), IMAP (1143/1993, STARTTLS/TLS), Haraka MTA (2526)
* **데이터베이스**: MySQL 8.0 for Windows (utf8mb4 인코딩)
* **캐시 & 작업 큐**: Memurai (Redis 7 호환 엔진, `requirepass` 인증 필수)
* **보안 백신**: ClamAV for Windows (`clamd`, TCP: 3310 첨부파일 실시간 검사)
* **프로세스 관리**: PM2 프로세스 매니저 또는 NSSM (4대 핵심 마이크로서비스 및 Nginx/ClamAV 백그라운드 상시화)

---

## 1. 사전 필수 소프트웨어 설치

### 1.1 Node.js 20 LTS & Yarn & PM2 & NSSM
1. **Node.js 20.x LTS (x64)**: [공식 다운로드](https://nodejs.org/)에서 Windows Installer(.msi) 설치.
2. **Yarn 및 PM2 패키지 매니저**: PowerShell(관리자 권한)에서 실행:
   ```powershell
   npm install -g yarn pm2
   ```
3. **NSSM (Service Manager)**: [NSSM 공식 사이트](https://nssm.cc/)에서 다운로드 후 `win64\nssm.exe`를 `C:\Windows\System32\`에 복사합니다. (NSSM 서비스 등록 방식 사용 시 필요)

### 1.2 MySQL 8.0 for Windows
* [MySQL Installer](https://dev.mysql.com/downloads/installer/)를 통해 **Server Only** 모드로 설치.
* 기본 포트 `3306` (또는 지정 포트 `3300`), Character Set: `utf8mb4` 지정.
* Windows 서비스(`MySQL80`) 자동 시작 등록.

### 1.3 Redis 호환 엔진 (Memurai for Windows)
* [Memurai 공식 사이트](https://www.memurai.com/)에서 설치 파일 다운로드 후 설치합니다. (Windows 서비스로 자동 등록됨)
* 포트: 기본 `6379`.

### 1.4 ClamAV for Windows (안티바이러스 데몬)
1. [ClamAV 공식 다운로드](https://www.clamav.net/downloads)에서 Windows 64비트 버전을 다운로드하여 `C:\Program Files\ClamAV`에 압축 해제하거나 설치합니다.
2. `conf_examples` 폴더에서 `freshclam.conf.sample`, `clamd.conf.sample`을 상위 디렉터리로 복사하고 확장자의 `.sample`을 제거합니다.
3. `freshclam.conf`와 `clamd.conf`를 메모장으로 열고 최상단의 `Example` 줄을 `#Example`로 주석 처리합니다.
4. 바이러스 시그니처 최신 업데이트 실행:
   ```powershell
   cd "C:\Program Files\ClamAV"
   .\freshclam.exe
   ```

### 1.5 Nginx for Windows (웹 리버스 프록시)
* [Nginx 공식 다운로드](http://nginx.org/en/download.html)에서 Windows 안정화 버전(.zip)을 다운로드하여 `C:\nginx`에 압축 해제합니다.

---

## 2. ClamAV TCP 데몬 구성 및 서비스 등록

수신 메일의 첨부파일 바이러스 검사를 위해 ClamAV TCP 데몬(`3310`)을 상시 구동합니다.

### 2.1 `clamd.conf` 설정
`C:\Program Files\ClamAV\clamd.conf` 파일을 열고 다음 설정을 활성화합니다:
```ini
# 로컬 TCP 통신 포트 활성화
TCPSocket 3310
TCPAddr 127.0.0.1
MaxConnectionQueueLength 30
StreamMaxLength 50M
```

### 2.2 ClamAV Windows 서비스 등록 (NSSM)
```powershell
nssm install ClamAV-Daemon "C:\Program Files\ClamAV\clamd.exe" "--config-file=C:\Program Files\ClamAV\clamd.conf"
nssm set ClamAV-Daemon AppDirectory "C:\Program Files\ClamAV"
nssm set ClamAV-Daemon Description "LEMail ClamAV Antivirus Daemon Service"
nssm set ClamAV-Daemon Start SERVICE_AUTO_START
nssm start ClamAV-Daemon
```

---

## 3. Redis (Memurai) 비밀번호 및 큐 지속성 구성

BullMQ 작업 큐와 세션 캐시 보호를 위해 인증 비밀번호(`requirepass`) 및 지속성을 설정합니다.

### 3.1 `memurai.conf` 설정
`C:\Program Files\Memurai\memurai.conf` 파일을 메모장(관리자 권한)으로 엽니다:
```ini
bind 127.0.0.1
port 6379

# [필수 1] Redis 비밀번호 설정
requirepass SuperSecureRedisPass123!

# [필수 2] AOF 지속성 활성화
appendonly yes
appendfsync everysec

# [필수 3] 큐 유실 방지 메모리 정책
maxmemory 2gb
maxmemory-policy noeviction
```

### 3.2 서비스 재시작 및 인증 확인
```powershell
Restart-Service Memurai

# 패스워드 인증 테스트
& "C:\Program Files\Memurai\memurai-cli.exe" -a "SuperSecureRedisPass123!" ping
# 결과: PONG
```

---

## 4. MySQL 데이터베이스 및 계정 생성

MySQL Command Line Client를 관리자 권한으로 실행합니다:
```sql
CREATE DATABASE IF NOT EXISTS `lemaildb` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'lemail'@'localhost' IDENTIFIED BY 'StrongDbPassword123!';
CREATE USER IF NOT EXISTS 'lemail'@'127.0.0.1' IDENTIFIED BY 'StrongDbPassword123!';
GRANT ALL PRIVILEGES ON `lemaildb`.* TO 'lemail'@'localhost';
GRANT ALL PRIVILEGES ON `lemaildb`.* TO 'lemail'@'127.0.0.1';
FLUSH PRIVILEGES;
EXIT;
```

---

## 5. 배포 파일(ZIP) 압축 해제 및 초기 구성

> [!IMPORTANT]
> 본 가이드는 소스코드 빌드가 아닌 **공식 배포 패키지 파일(`lemail_vX.Y.Z_YYYYMMDD_obfuscated.zip`)**을 기준으로 설치합니다. 소스코드 컴파일(`yarn build`)을 별도로 수행할 필요가 없습니다.

### 5.1 배포 파일 압축 해제
1. 배포 경로 `C:\LEMail` 디렉터리를 생성합니다.
2. 배포 패키지 ZIP 파일을 `C:\LEMail`에 압축 해제합니다.
3. 런타임 저장 디렉터리를 생성합니다:
   ```powershell
   mkdir C:\LEMail\mail-spool, C:\LEMail\mail-archive, C:\LEMail\mail-attachments, C:\LEMail\license, C:\LEMail\ssl
   ```

### 5.2 운영 의존성 모듈 설치
PowerShell에서 실행합니다:
```powershell
cd C:\LEMail
yarn install --production --frozen-lockfile
```

### 5.3 환경 변수 설정 (`C:\LEMail\.env`)
`C:\LEMail\.env.example`을 복사하여 `C:\LEMail\.env`를 생성합니다:
```powershell
copy .env.example .env
notepad .env
```

```ini
# ==========================================
# LEMail Production Environment Configuration
# ==========================================
NODE_ENV=production
PORT=9200
WEB_PORT=9000

# 1. Database
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USERNAME=lemail
DB_PASSWORD=StrongDbPassword123!
DB_DATABASE=lemaildb
DB_POOL_SIZE=30

# 2. Redis (Memurai requirepass)
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=SuperSecureRedisPass123!

# 3. ClamAV Antivirus
CLAMAV_HOST=127.0.0.1
CLAMAV_PORT=3310
CLAMAV_ENABLED=true
CLAMAV_TIMEOUT_MS=3000

# 4. Mail Service TLS Certificates
IMAP_PORT=1143
IMAPS_PORT=1993
IMAP_STARTTLS=true
IMAP_TLS_CERT=C:/LEMail/ssl/fullchain.pem
IMAP_TLS_KEY=C:/LEMail/ssl/privkey.pem

# 5. Security & Master Encryption Key
JWT_SECRET=c28f09d84ef478c9320b9e81d714b901a8f9024cba81001928374655
APP_ENCRYPTION_KEY=e83a710bc82491a039d84e9021fa4b7c12093847561a0293847561a029384756

# 6. Default Administrator
DEFAULT_ADMIN_EMAIL=admin@yourdomain.com
DEFAULT_ADMIN_PASSWORD=AdminStrongPass123!
DEFAULT_ADMIN_NAME=시스템관리자

# 7. 디스크 저장소 경로
SPOOL_DIR=C:/LEMail/mail-spool
ARCHIVE_DIR=C:/LEMail/mail-archive
ATTACHMENTS_DIR=C:/LEMail/mail-attachments
LICENSE_FILE_PATH=C:/LEMail/license/lemail-license.lic
```

### 5.4 데이터베이스 스키마 및 초기 시드 초기화
컴파일된 배포 스크립트를 직접 실행합니다:
```powershell
node apps\api\dist\modules\database\scripts\init-schema.js
```
> `[Database] Schema synchronization & initial seeding completed successfully!` 출력을 확인합니다.

---

## 6. 웹 SSL 및 메일 TLS 인증서 배치

공인 인증서(`fullchain.pem`, `privkey.pem`)를 `C:\LEMail\ssl\` 디렉터리에 배치합니다:
* **웹메일 (Nginx)**: `C:/nginx/conf/ssl/fullchain.pem`, `privkey.pem`
* **IMAP SSL/TLS**: `.env`의 `IMAP_TLS_CERT`, `IMAP_TLS_KEY` 설정
* **Haraka SMTP**: `C:\LEMail\services\haraka\config\tls_cert.pem`, `tls_key.pem`으로 복사

```powershell
# Haraka TLS 인증서 복사
mkdir C:\LEMail\services\haraka\config -Force
copy C:\LEMail\ssl\fullchain.pem C:\LEMail\services\haraka\config\tls_cert.pem
copy C:\LEMail\ssl\privkey.pem C:\LEMail\services\haraka\config\tls_key.pem
```

---

## 7. Nginx for Windows 리버스 프록시 구성

`C:\nginx\conf\nginx.conf` 파일을 작성합니다:

```nginx
worker_processes 1;

events {
    worker_connections 2048;
}

http {
    include mime.types;
    default_type application/octet-stream;
    client_max_body_size 50M;

    # 1. HTTP -> HTTPS 리다이렉트
    server {
        listen 80;
        server_name mail.yourdomain.com;
        return 301 https://$host$request_uri;
    }

    # 2. HTTPS 메인 웹 서버
    server {
        listen 443 ssl http2;
        server_name mail.yourdomain.com;

        ssl_certificate C:/LEMail/ssl/fullchain.pem;
        ssl_certificate_key C:/LEMail/ssl/privkey.pem;
        ssl_protocols TLSv1.2 TLSv1.3;

        location / {
            proxy_pass http://127.0.0.1:9000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        location /api {
            proxy_pass http://127.0.0.1:9200;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_read_timeout 300s;
        }
    }
}
```

### Nginx Windows 서비스 등록 (NSSM)
```powershell
nssm install Nginx "C:\nginx\nginx.exe"
nssm set Nginx AppDirectory "C:\nginx"
nssm set Nginx Description "LEMail Frontend Nginx Reverse Proxy"
nssm set Nginx Start SERVICE_AUTO_START
nssm start Nginx
```

---

## 8. Windows 프로세스 상시화 및 서비스 등록 (PM2 / NSSM)

LEMail의 4대 핵심 서비스(Core API, Webmail, IMAP, Haraka)를 상시 구동하고 재부팅 시 자동 시작하도록 구성합니다.  
**[방법 1] PM2 프로세스 매니저**를 사용하면 실시간 리소스 모니터링 및 통합 로그 관리가 편리하며, **[방법 2] NSSM**을 사용하면 각 서비스를 Windows 표준 서비스(`services.msc`)로 직접 등록할 수 있습니다.

---

### 8.1 [방법 1] PM2 프로세스 매니저를 통한 등록 및 실행 (권장)

배포 루트 디렉터리에 포함된 `ecosystem.config.js`를 활용하여 4대 서비스를 원클릭으로 등록 및 실행합니다.

#### (1) PM2 글로벌 설치 및 확인
관리자 권한 PowerShell에서 실행:
```powershell
npm install -g pm2
pm2 -v
```

#### (2) 서비스 일괄 시작
LEMail 설치 루트 디렉터리(`C:\LEMail`)에서 실행합니다:

```powershell
cd C:\LEMail

# PM2 설정 파일로 4대 서비스 일괄 기동
pm2 start ecosystem.config.js

# 구동 상태 확인
pm2 status
```

#### (3) PM2 주요 운영 관리 명령어

| 작업 | PowerShell 명령어 | 설명 |
| :--- | :--- | :--- |
| **전체 프로세스 기동** | `pm2 start ecosystem.config.js` | 4대 서비스 일괄 등록 및 기동 |
| **상태 확인** | `pm2 status` | CPU, 메모리, 상태, 재시작 횟수 확인 |
| **실시간 로그 모니터링** | `pm2 logs` | 전체 서비스 실시간 스트리밍 로그 |
| **특정 서비스 로그** | `pm2 logs lemail-api` | `lemail-api`, `lemail-web`, `lemail-imap`, `lemail-haraka` 개별 로그 |
| **리소스 대시보드** | `pm2 monit` | 실시간 CPU 및 메모리 터미널 대시보드 |
| **무중단 리로드** | `pm2 reload ecosystem.config.js` | 무중단 순차적 재기동 |
| **전체 재시작** | `pm2 restart ecosystem.config.js` | 전체 프로세스 재시작 |
| **전체 중지** | `pm2 stop ecosystem.config.js` | 전체 서비스 일시 정지 |
| **프로세스 삭제** | `pm2 delete ecosystem.config.js` | PM2 등록 목록에서 삭제 |

#### (4) Windows 부팅 시 자동 시작 등록 (2가지 방식 중 택1)

**방식 A. NSSM을 통해 PM2 서비스를 Windows 서비스로 등록 (가장 안정적):**
```powershell
# PM2 bin 경로 확인 (예: C:\Users\<사용자>\AppData\Roaming\npm\pm2.cmd 또는 npm root -g)
# NSSM으로 PM2 resurrect 실행 등록
nssm install LEMail-PM2 "C:\Program Files\nodejs\node.exe" "C:\Users\<Administrator>\AppData\Roaming\npm\node_modules\pm2\bin\pm2" "resurrect"
nssm set LEMail-PM2 AppDirectory "C:\LEMail"
nssm set LEMail-PM2 Description "LEMail Enterprise PM2 Process Manager"
nssm set LEMail-PM2 Start SERVICE_AUTO_START

# 현재 상태 저장 및 서비스 시작
pm2 save
nssm start LEMail-PM2
```

**방식 B. `pm2-windows-service` 모듈 활용:**
```powershell
npm install -g pm2-windows-service
pm2-service-install
# 안내에 따라 서비스 등록 후:
pm2 save
```

---

### 8.2 [방법 2] NSSM을 통한 마이크로서비스 개별 Windows 서비스 등록

각 마이크로서비스를 Windows 개별 서비스로 분리하여 `services.msc`에서 직접 제어하고자 하는 경우 아래 명령어를 순서대로 실행합니다:

#### (1) `LEMail-API` 등록
```powershell
nssm install LEMail-API "C:\Program Files\nodejs\node.exe" "C:\LEMail\apps\api\dist\index.js"
nssm set LEMail-API AppDirectory "C:\LEMail\apps\api"
nssm set LEMail-API AppEnvironmentExtra "NODE_ENV=production"
nssm set LEMail-API Description "LEMail Core REST API & Inbound ESMTP Service"
nssm set LEMail-API Start SERVICE_AUTO_START
```

#### (2) `LEMail-Web` 등록
```powershell
nssm install LEMail-Web "C:\Program Files\nodejs\node.exe" "C:\LEMail\apps\web\scripts\start.js"
nssm set LEMail-Web AppDirectory "C:\LEMail\apps\web"
nssm set LEMail-Web AppEnvironmentExtra "NODE_ENV=production"
nssm set LEMail-Web Description "LEMail Next.js Webmail Client"
nssm set LEMail-Web Start SERVICE_AUTO_START
```

#### (3) `LEMail-IMAP` 등록
```powershell
nssm install LEMail-IMAP "C:\Program Files\nodejs\node.exe" "C:\LEMail\services\imap\dist\index.js"
nssm set LEMail-IMAP AppDirectory "C:\LEMail\services\imap"
nssm set LEMail-IMAP AppEnvironmentExtra "NODE_ENV=production"
nssm set LEMail-IMAP Description "LEMail IMAP4rev1 Microservice"
nssm set LEMail-IMAP Start SERVICE_AUTO_START
```

#### (4) `LEMail-Haraka` 등록
```powershell
nssm install LEMail-Haraka "C:\Program Files\nodejs\node.exe" "C:\LEMail\services\haraka\index.js"
nssm set LEMail-Haraka AppDirectory "C:\LEMail\services\haraka"
nssm set LEMail-Haraka AppEnvironmentExtra "NODE_ENV=production"
nssm set LEMail-Haraka Description "LEMail Haraka Outbound Relay MTA"
nssm set LEMail-Haraka Start SERVICE_AUTO_START
```

#### (5) 서비스 일괄 시작 및 상태 확인
```powershell
nssm start LEMail-API
nssm start LEMail-Web
nssm start LEMail-IMAP
nssm start LEMail-Haraka

# Windows 서비스 구동 확인
Get-Service -Name "LEMail*", "Nginx", "ClamAV*", "Memurai"
```

---

## 9. Windows 방화벽 및 포트 포워딩

```powershell
# 1. 웹 & 메일 포트 허용
New-NetFirewallRule -DisplayName "LEMail HTTP (80)" -Direction Inbound -LocalPort 80 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "LEMail HTTPS (443)" -Direction Inbound -LocalPort 443 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "LEMail SMTP Standard (25)" -Direction Inbound -LocalPort 25 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "LEMail IMAP (1143)" -Direction Inbound -LocalPort 1143 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "LEMail IMAPS (1993)" -Direction Inbound -LocalPort 1993 -Protocol TCP -Action Allow

# 2. 외부 25번 포트를 LEMail 수신 포트(2525)로 포트포워딩
netsh interface portproxy add v4tov4 listenport=25 listenaddress=0.0.0.0 connectport=2525 connectaddress=127.0.0.1
```

---

## 10. 설치 후 최종 검증

1. 웹 브라우저에서 `https://mail.yourdomain.com` 접속.
2. 초기 관리자 계정(`admin@yourdomain.com`)으로 로그인.
3. 관리자 메뉴 ➔ **스팸 & 보안 관리 (`/admin/spam-rules`)**에서 ClamAV 연결 테스트 (`127.0.0.1:3310` 성공 확인).
4. 도메인 및 사서함 계정을 생성하고 메일 송수신 및 IMAP 클라이언트 연동을 확인합니다.
