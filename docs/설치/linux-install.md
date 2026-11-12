# 🐧 LEMail Linux (Baremetal / VM) 배포 및 설치 가이드

본 문서는 Linux 운영체제(Ubuntu 22.04/24.04 LTS 또는 Rocky Linux / RHEL 8/9) 환경에서 **사전 빌드/난독화된 배포 패키지 파일(`lemail_vX.Y.Z_*.zip`)**을 기반으로 LEMail을 설치하고, `systemd` 데몬 서비스 및 Nginx 리버스 프록시를 구성하여 24x365 무중단 운영 환경을 구축하는 방법을 안내합니다.

> [!NOTE]
> Docker 컨테이너 기반으로 설치하고자 하시는 경우 [Docker 설치 가이드](docker-install.md)를 참조하십시오.

---

## 📌 전체 구성 아키텍처 개요

* **웹 프론트엔드 & 리버스 프록시**: Nginx (HTTPS: 443, HTTP: 80 ➔ 443 자동 리다이렉트)
* **메일 수신 & 발송**: Nginx Stream 또는 직접 바인딩 (Inbound ESMTP: 25, IMAP: 143/993, Haraka MTA: 2526)
* **백엔드 애플리케이션**: Node.js 20 LTS (Core API, Webmail UI, IMAP Microservice, Haraka MTA)
* **인프라 저장소**: MySQL 8.0 (데이터베이스), Redis 7.x (작업 큐 & 캐시, 비밀번호 인증 필수)
* **보안 백신**: ClamAV Daemon (`clamd`, TCP: 3310 스트리밍 실시간 첨부파일 검사)
* **보안 암호화**: 웹 SSL (Let's Encrypt/공인 인증서), 메일 TLS (IMAP STARTTLS/IMAPS, SMTP TLS)

---

## 1. 시스템 사전 필수 패키지 설치

### 1.1 Ubuntu 22.04 / 24.04 LTS
```bash
# 1. 패키지 저장소 업데이트 및 기본 유틸리티 설치
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y curl wget git unzip certbot python3-certbot-nginx nginx

# 2. Node.js 20.x LTS 설치 (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g yarn pm2

# 3. MySQL 8.0 & Redis 7.x 설치
sudo apt-get install -y mysql-server redis-server

# 4. ClamAV 안티바이러스 데몬 설치
sudo apt-get install -y clamav clamav-daemon
```

### 1.2 Rocky Linux 8/9 / RHEL 8/9
```bash
# 1. EPEL 및 기본 패키지 설치
sudo dnf install -y epel-release
sudo dnf update -y
sudo dnf install -y curl wget unzip git nginx certbot python3-certbot-nginx

# 2. Node.js 20 설치
sudo dnf module enable -y nodejs:20
sudo dnf install -y nodejs
sudo npm install -g yarn pm2

# 3. MySQL 8.0 & Redis 7 설치
sudo dnf install -y mysql-server redis
sudo systemctl enable --now mysqld

# 4. ClamAV 안티바이러스 설치
sudo dnf install -y clamav clamav-update clamd
```

---

## 2. ClamAV 안티바이러스 데몬 구성 (필수)

LEMail은 메일 수신 시 첨부파일의 바이러스/악성코드를 실시간 검사하기 위해 ClamAV 데몬(`clamd`, 기본 TCP 포트 `3310`)과 통신합니다.

### 2.1 바이러스 시그니처 데이터베이스 업데이트
```bash
sudo systemctl stop clamav-freshclam 2>/dev/null || true
sudo freshclam
sudo systemctl enable --now clamav-freshclam
```

### 2.2 TCP 소켓 포트(3310) 활성화

#### Ubuntu (`/etc/clamav/clamd.conf`)
파일을 열고 아래 항목을 수정하거나 추가합니다:
```ini
# 로컬 TCP 소켓 바인딩 설정
TCPSocket 3310
TCPAddr 127.0.0.1
MaxConnectionQueueLength 30
StreamMaxLength 50M
```
설정 후 데몬 재시작:
```bash
sudo systemctl restart clamav-daemon
sudo systemctl enable clamav-daemon
```

#### Rocky Linux / RHEL (`/etc/clamd.d/scan.conf`)
```bash
sudo cp /etc/clamd.d/scan.conf /etc/clamd.d/scan.conf.bak
sudo sed -i 's/^Example/#Example/' /etc/clamd.d/scan.conf
sudo sed -i 's/^#TCPSocket 3310/TCPSocket 3310/' /etc/clamd.d/scan.conf
sudo sed -i 's/^#TCPAddr 127.0.0.1/TCPAddr 127.0.0.1/' /etc/clamd.d/scan.conf
sudo systemctl enable --now clamd@scan
```

### 2.3 ClamAV TCP 데몬 동작 검증
```bash
# 3310 포트 리스닝 확인
sudo ss -tulpn | grep 3310
# PING 질의 (PONG 응답 확인)
echo -e "zPING\0" | nc 127.0.0.1 3310
```

---

## 3. Redis 캐시 & 큐 서버 구성 (requirepass 필수)

LEMail은 대용량 메일 수발신 큐(BullMQ)와 고속 사서함 캐시를 위해 Redis를 사용합니다. 큐 데이터 유실 방지와 보안을 위해 **인증 비밀번호(`requirepass`) 및 지속성 설정**을 반드시 적용해야 합니다.

### 3.1 Redis 설정 파일 수정
* **Ubuntu**: `/etc/redis/redis.conf`
* **Rocky Linux / RHEL**: `/etc/redis/redis.conf` 또는 `/etc/redis.conf`

```ini
# 로컬 바인딩 유지
bind 127.0.0.1 ::1

# 포트 지정
port 6379

# [필수 1] 접속 인증 비밀번호 설정 (강력한 임의 문자열 사용)
requirepass YourSuperSecureRedisPassword123!

# [필수 2] 큐 데이터 유실 방지를 위한 AOF 활성화
appendonly yes
appendfsync everysec

# [필수 3] BullMQ 큐 메시지가 임의 삭제되지 않도록 noeviction 정책 지정
maxmemory 2gb
maxmemory-policy noeviction
```

### 3.2 Redis 서비스 재시작 및 연결 확인
```bash
# Ubuntu
sudo systemctl restart redis-server
sudo systemctl enable redis-server

# Rocky / RHEL
sudo systemctl restart redis
sudo systemctl enable redis

# 패스워드 인증 테스트
redis-cli -a 'YourSuperSecureRedisPassword123!' ping
# 결과: PONG
```

---

## 4. MySQL 8.0 데이터베이스 생성 및 계정 설정

```bash
sudo mysql -u root
```

```sql
-- 데이터베이스 생성 (utf8mb4 필수)
CREATE DATABASE IF NOT EXISTS `lemaildb` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 전용 계정 생성 및 권한 부여
CREATE USER IF NOT EXISTS 'lemail'@'localhost' IDENTIFIED BY 'StrongDbPassword123!';
CREATE USER IF NOT EXISTS 'lemail'@'127.0.0.1' IDENTIFIED BY 'StrongDbPassword123!';

GRANT ALL PRIVILEGES ON `lemaildb`.* TO 'lemail'@'localhost';
GRANT ALL PRIVILEGES ON `lemaildb`.* TO 'lemail'@'127.0.0.1';
FLUSH PRIVILEGES;
EXIT;
```

---

## 5. 배포 파일(ZIP) 설치 및 초기 구성

> [!IMPORTANT]
> 본 가이드는 소스코드 빌드가 아닌 **공식 배포 패키지 파일(`lemail_vX.Y.Z_YYYYMMDD_obfuscated.zip`)**을 기준으로 설치합니다. 소스코드 컴파일(`yarn build`)을 별도로 수행할 필요가 없습니다.

### 5.1 배포 디렉터리 생성 및 압축 해제
```bash
# 1. 설치 경로 생성 (표준: /opt/lemail)
sudo mkdir -p /opt/lemail
sudo chown -R $USER:$USER /opt/lemail

# 2. 배포 패키지 압축 해제
# (고객사 서버에 업로드한 lemail_vX.Y.Z_obfuscated.zip 파일 경로 지정)
unzip lemail_v1.1.0_20261110_obfuscated.zip -d /opt/lemail/
cd /opt/lemail

# 3. 런타임 저장소 디렉터리 준비
mkdir -p mail-spool mail-archive mail-attachments license
```

### 5.2 운영 전용 의존성 모듈 설치
배포 패키지 내 루트 및 서비스별 운영 의존성을 설치합니다:
```bash
# 운영 모드 설치 (devDependencies 제외)
yarn install --production --frozen-lockfile
```

### 5.3 환경 변수 설정 (`/opt/lemail/.env`)
루트 디렉터리의 `.env.example`을 복사하여 `.env`를 생성합니다:
```bash
cp .env.example .env
nano .env
```

```ini
# ==========================================
# LEMail Production Environment Configuration
# ==========================================
NODE_ENV=production
PORT=9200
WEB_PORT=9000

# 1. MySQL Database
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USERNAME=lemail
DB_PASSWORD=StrongDbPassword123!
DB_DATABASE=lemaildb
DB_POOL_SIZE=30

# 2. Redis Connection (requirepass 일치)
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=YourSuperSecureRedisPassword123!

# 3. ClamAV Antivirus Daemon
CLAMAV_HOST=127.0.0.1
CLAMAV_PORT=3310
CLAMAV_ENABLED=true
CLAMAV_TIMEOUT_MS=3000

# 4. Mail Service TLS Certificates (IMAP / SMTP)
IMAP_PORT=1143
IMAPS_PORT=1993
IMAP_STARTTLS=true
IMAP_TLS_CERT=/etc/letsencrypt/live/mail.yourdomain.com/fullchain.pem
IMAP_TLS_KEY=/etc/letsencrypt/live/mail.yourdomain.com/privkey.pem

# 5. Security & Master Encryption Key
JWT_SECRET=c28f09d84ef478c9320b9e81d714b901a8f9024cba81001928374655
APP_ENCRYPTION_KEY=e83a710bc82491a039d84e9021fa4b7c12093847561a0293847561a029384756

# 6. Default Admin (최초 1회 부트스트랩)
DEFAULT_ADMIN_EMAIL=admin@yourdomain.com
DEFAULT_ADMIN_PASSWORD=AdminStrongPass123!
DEFAULT_ADMIN_NAME=시스템관리자

# 7. 디스크 저장소 경로
SPOOL_DIR=/opt/lemail/mail-spool
ARCHIVE_DIR=/opt/lemail/mail-archive
ATTACHMENTS_DIR=/opt/lemail/mail-attachments
LICENSE_FILE_PATH=/opt/lemail/license/lemail-license.lic
```

### 5.4 데이터베이스 스키마 및 초기 시드 실행
컴파일된 배포 스크립트를 직접 실행하여 DB 테이블 생성 및 관리자 계정을 초기화합니다:
```bash
node apps/api/dist/modules/database/scripts/init-schema.js
```
> 스크립트 실행 후 `[Database] Schema synchronization & initial seeding completed successfully!` 메시지를 확인합니다.

---

## 6. 웹 SSL 및 메일 서비스 TLS 인증서 설치

메일 시스템은 웹(HTTPS) 뿐만 아니라 메일 송수신(SMTP TLS, IMAP SSL/TLS)에도 공인 인증서가 필요합니다.

### 6.1 Let's Encrypt를 통한 무료 인증서 발급
```bash
# Nginx를 잠시 중지하거나 독립 실행(standalone) 모드로 발급
sudo certbot certonly --standalone -d mail.yourdomain.com
```
* 발급 경로:
  * 인증서(Full Chain): `/etc/letsencrypt/live/mail.yourdomain.com/fullchain.pem`
  * 개인키(Private Key): `/etc/letsencrypt/live/mail.yourdomain.com/privkey.pem`

### 6.2 메일 서비스별 TLS 인증서 적용 위치

1. **IMAP 서비스 (`services/imap`)**:
   * `.env` 파일에 발급받은 인증서 경로를 지정합니다:
     ```ini
     IMAP_TLS_CERT=/etc/letsencrypt/live/mail.yourdomain.com/fullchain.pem
     IMAP_TLS_KEY=/etc/letsencrypt/live/mail.yourdomain.com/privkey.pem
     ```
   * *(선택)* 환경변수를 지정하지 않을 경우 `services/imap/certs/imap-cert.pem`, `imap-key.pem`에 인증서 파일을 복사하거나 심볼릭 링크를 생성할 수 있습니다.
2. **Haraka SMTP 아웃바운드 릴레이 (`services/haraka`)**:
   * 발신 메일의 TLS 암호화를 위해 Haraka 설정 디렉터리에 인증서 심볼릭 링크를 연결합니다:
     ```bash
     mkdir -p /opt/lemail/services/haraka/config
     ln -sf /etc/letsencrypt/live/mail.yourdomain.com/fullchain.pem /opt/lemail/services/haraka/config/tls_cert.pem
     ln -sf /etc/letsencrypt/live/mail.yourdomain.com/privkey.pem /opt/lemail/services/haraka/config/tls_key.pem
     ```
   * *(참고)* 인증서 파일이 없으면 Haraka 실행 시 자체 서명(Self-signed) 인증서가 자동 생성되지만, 외부 수신처(Gmail, Naver 등)의 신뢰를 위해 공인 인증서 연결을 권장합니다.

---

## 7. Nginx 리버스 프록시 및 포트 라우팅 구성

### 7.1 웹메일 및 API 프록시 설정 (`/etc/nginx/sites-available/lemail.conf`)
```nginx
# HTTP -> HTTPS 리다이렉트
server {
    listen 80;
    server_name mail.yourdomain.com;
    return 301 https://$host$request_uri;
}

# HTTPS 메인 웹 서버
server {
    listen 443 ssl http2;
    server_name mail.yourdomain.com;

    # SSL 인증서
    ssl_certificate /etc/letsencrypt/live/mail.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mail.yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # 대용량 첨부파일 업로드 제한 해제 (50MB)
    client_max_body_size 50M;

    # 1. Webmail Next.js UI
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

    # 2. REST API & WebSocket
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
```

```bash
# 활성화 및 리로드
sudo ln -sf /etc/nginx/sites-available/lemail.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 7.2 메일 프로토콜 포트 25 포워딩 (Iptables 또는 Nginx Stream)
일반 사용자로 구동되는 LEMail Inbound SMTP(`2525`)를 외부 표준 25번 포트로 연결합니다:
```bash
# Iptables 포트 리다이렉트
sudo iptables -t nat -A PREROUTING -p tcp --dport 25 -j REDIRECT --to-port 2525

# 재부팅 후에도 영구 적용
sudo apt-get install -y iptables-persistent 2>/dev/null || true
sudo netfilter-persistent save 2>/dev/null || sudo iptables-save | sudo tee /etc/sysconfig/iptables
```

---

## 8. 서비스 데몬화 및 프로세스 상시화 (PM2 / systemd)

LEMail의 4대 핵심 서비스(Core API, Webmail UI, IMAP Microservice, Haraka MTA)를 24x365 무중단 운영하기 위한 프로세스 관리 방법입니다.  
**Node.js 표준 프로세스 매니저인 [방법 1] PM2 사용을 적극 권장**하며, OS 표준 서비스 규격을 준수해야 하는 환경에서는 **[방법 2] `systemd` 등록 방식**을 사용할 수 있습니다.

---

### 8.1 [방법 1] PM2 프로세스 매니저를 통한 등록 및 실행 (권장)

PM2는 Node.js 애플리케이션의 프로세스 상시화, 비정상 종료 시 자동 재기동, 메모리 초과 감지 및 자동 재시작, 무중단 리로드(Reload), 통합 로그 스트리밍 및 모니터링을 지원하는 엔터프라이즈급 프로세스 매니저입니다.

#### (1) PM2 글로벌 설치 확인
```bash
sudo npm install -g pm2
pm2 -v
```

#### (2) `ecosystem.config.js` 설정 확인
LEMail 배포 패키지 루트 디렉터리에 `ecosystem.config.js` 파일이 기본 포함되어 있습니다:

```javascript
module.exports = {
  apps: [
    {
      name: 'lemail-api',
      cwd: './apps/api',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      node_args: '--max-old-space-size=4096',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      watch: false,
      max_memory_restart: '4G',
      time: true,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'lemail-web',
      cwd: './apps/web',
      script: 'scripts/start.js',
      instances: 1,
      exec_mode: 'fork',
      node_args: '--max-old-space-size=2048',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      watch: false,
      max_memory_restart: '2G',
      time: true,
      env: {
        NODE_ENV: 'production',
        PORT: 9000,
      },
    },
    {
      name: 'lemail-imap',
      cwd: './services/imap',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      node_args: '--max-old-space-size=2048',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      watch: false,
      max_memory_restart: '2G',
      time: true,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'lemail-haraka',
      cwd: './services/haraka',
      script: 'index.js',
      instances: 1,
      exec_mode: 'fork',
      node_args: '--max-old-space-size=2048',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      watch: false,
      max_memory_restart: '2G',
      time: true,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
```

#### (3) 서비스 일괄 시작 및 등록
루트 디렉터리(`/opt/lemail`)에서 실행합니다:

```bash
cd /opt/lemail

# 1. PM2 설정 파일로 전체 서비스 시작
pm2 start ecosystem.config.js
# 또는 yarn 스크립트로 시작
yarn pm2:start

# 2. 실행 상태 확인
pm2 status
```

출력 예시:
```text
┌────┬────────────────┬─────────────┬─────────┬─────────┬──────────┬────────┬──────┬───────────┬──────────┬──────────┐
│ id │ name           │ namespace   │ version │ mode    │ pid      │ uptime │ ↺    │ status    │ cpu      │ mem      │
├────┼────────────────┼─────────────┼─────────┼─────────┼──────────┼────────┼──────┼───────────┼──────────┼──────────┤
│ 0  │ lemail-api     │ default     │ 1.1.0   │ fork    │ 12345    │ 10s    │ 0    │ online    │ 0.5%     │ 120.4 MB │
│ 1  │ lemail-web     │ default     │ 1.1.0   │ fork    │ 12346    │ 10s    │ 0    │ online    │ 0.2%     │ 85.1 MB  │
│ 2  │ lemail-imap    │ default     │ 1.1.0   │ fork    │ 12347    │ 10s    │ 0    │ online    │ 0.1%     │ 65.8 MB  │
│ 3  │ lemail-haraka  │ default     │ 1.1.0   │ fork    │ 12348    │ 10s    │ 0    │ online    │ 0.1%     │ 72.3 MB  │
└────┴────────────────┴─────────────┴─────────┴─────────┴──────────┴────────┴──────┴───────────┴──────────┴──────────┘
```

#### (4) OS 부팅 시 자동 시작 등록 (Startup Service)
서버가 재부팅되어도 LEMail 서비스가 자동으로 복구되도록 등록합니다:

```bash
# 1. 부팅 시작 스크립트 생성 명령 생성
pm2 startup

# 안내되는 sudo 명령어를 복사하여 실행 (예: sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u lemail --hp /opt/lemail)

# 2. 현재 실행 중인 프로세스 목록을 시작 리스트에 저장
pm2 save
```

#### (5) PM2 운영 관리 명령어 가이드

| 작업 구분 | CLI 명령어 | 설명 |
| :--- | :--- | :--- |
| **전체 프로세스 기동** | `pm2 start ecosystem.config.js` | 4대 서비스 일괄 등록 및 기동 |
| **실행 상태 확인** | `pm2 status` 또는 `pm2 list` | CPU, 메모리, 업타임, 재시작 횟수 확인 |
| **실시간 로그 모니터링** | `pm2 logs` | 전체 서비스의 통합 실시간 로그 스트리밍 |
| **특정 서비스 로그** | `pm2 logs lemail-api` | 지정 서비스(`lemail-api`, `lemail-web`, `lemail-imap`, `lemail-haraka`) 전용 로그 |
| **CPU/메모리 실시간 대시보드** | `pm2 monit` | 터미널 기반 실시간 자원 모니터링 대시보드 |
| **무중단 리로드** | `pm2 reload ecosystem.config.js` | 신규 배포 시 세션 끊김 없는 순차적 재기동 |
| **서비스 재시작** | `pm2 restart ecosystem.config.js` | 전체 프로세스 재시작 |
| **특정 서비스만 재시작** | `pm2 restart lemail-api` | 특정 서비스만 단독 재시작 |
| **서비스 일시 중지** | `pm2 stop ecosystem.config.js` | 전체 서비스 정지 (설정 유지) |
| **프로세스 등록 해제** | `pm2 delete ecosystem.config.js` | PM2 프로세스 목록에서 제거 |
| **현재 상태 동기화 저장** | `pm2 save` | 부팅 시 복원될 프로세스 목록 갱신 |

#### (6) PM2 로그 로테이션(Logrotate) 설정 (권장)
로그 파일이 디스크 용량을 지속해서 잠식하지 않도록 `pm2-logrotate` 모듈을 설치합니다:

```bash
# 1. pm2-logrotate 모듈 설치
pm2 install pm2-logrotate

# 2. 최대 파일 크기 50MB 설정
pm2 set pm2-logrotate:max_size 50M

# 3. 보관 파일 개수 10개 유지
pm2 set pm2-logrotate:retain 10

# 4. 압축 보관 활성화 (.gz)
pm2 set pm2-logrotate:compress true
```

---

### 8.2 [방법 2] `systemd` 서비스 등록 및 데몬 상시화 (대안)

OS 레벨의 표준 서비스 데몬으로 직접 등록하여 `systemctl`로 제어하고자 하는 경우 아래 절차를 진행합니다.

#### (1) Core API & Inbound ESMTP (`/etc/systemd/system/lemail-api.service`)
```ini
[Unit]
Description=LEMail Core API and ESMTP Ingestion Service
After=network.target mysql.service redis-server.service clamav-daemon.service

[Service]
Type=simple
User=lemail
WorkingDirectory=/opt/lemail/apps/api
Environment=NODE_ENV=production
Environment=NODE_OPTIONS="--max-old-space-size=4096"
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
```

#### (2) Webmail UI (`/etc/systemd/system/lemail-web.service`)
```ini
[Unit]
Description=LEMail Webmail Next.js Client
After=network.target lemail-api.service

[Service]
Type=simple
User=lemail
WorkingDirectory=/opt/lemail/apps/web
Environment=NODE_ENV=production
ExecStart=/usr/bin/node scripts/start.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

#### (3) IMAP Microservice (`/etc/systemd/system/lemail-imap.service`)
```ini
[Unit]
Description=LEMail IMAP4rev1 Microservice
After=network.target mysql.service redis-server.service

[Service]
Type=simple
User=lemail
WorkingDirectory=/opt/lemail/services/imap
Environment=NODE_ENV=production
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
```

#### (4) Haraka Outbound MTA (`/etc/systemd/system/lemail-haraka.service`)
```ini
[Unit]
Description=LEMail Haraka Outbound Relay MTA
After=network.target

[Service]
Type=simple
User=lemail
WorkingDirectory=/opt/lemail/services/haraka
Environment=NODE_ENV=production
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

#### (5) 서비스 일괄 등록 및 시작
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now lemail-api lemail-web lemail-imap lemail-haraka

# 구동 상태 확인
sudo systemctl status lemail-api lemail-web lemail-imap lemail-haraka
```

---

## 9. 방화벽 포트 개방

```bash
# Ubuntu (UFW)
sudo ufw allow 80/tcp       # HTTP
sudo ufw allow 443/tcp      # HTTPS
sudo ufw allow 25/tcp       # Inbound SMTP
sudo ufw allow 143/tcp      # IMAP (STARTTLS)
sudo ufw allow 993/tcp      # IMAPS (TLS)
sudo ufw enable

# Rocky Linux (firewalld)
sudo firewall-cmd --permanent --add-service={http,https}
sudo firewall-cmd --permanent --add-port={25/tcp,143/tcp,993/tcp}
sudo firewall-cmd --reload
```

---

## 10. 설치 후 최종 검증

1. **웹 브라우저 접속**: `https://mail.yourdomain.com` 접속 확인.
2. **관리자 로그인**: `admin@yourdomain.com` 및 설정한 비밀번호로 로그인.
3. **보안 및 연동 점검**:
   * 관리자 콘솔 ➔ **스팸 & 보안 관리 (`/admin/spam-rules`)** 접속.
   * **ClamAV 안티바이러스 연동 설정**에서 `127.0.0.1:3310` **"연결 테스트"** 클릭 ➔ "ClamAV 데몬 연결 성공" 확인.
4. **메일 송수신 테스트**: 도메인 및 사서함 계정을 추가하여 외부 메일 송수신 및 IMAP 클라이언트 연동을 확인합니다.
