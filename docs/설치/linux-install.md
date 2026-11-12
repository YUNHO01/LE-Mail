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

## 2. ClamAV 안티바이러스 데몬 구성 (선택 및 필수 권장)

LEMail은 메일 수신 시 첨부파일의 바이러스/악성코드를 실시간 검사하기 위해 ClamAV 데몬(`clamd`, 기본 TCP 포트 `3310`)과 통신합니다.

> [!IMPORTANT]
> **시스템 메모리(RAM) 요구사항 및 사전 점검**
> * ClamAV 데몬(`clamd`)은 고속 실시간 스캔을 위해 수백만 개의 바이러스 시그니처 데이터베이스를 **RAM(인메모리)에 통째로 상주**시킵니다.
> * 구동 즉시 **최소 1.2GB ~ 1.5GB의 물리 메모리를 상시 점유**하며, 첨부파일 검사 시 순간적으로 2GB 이상까지 메모리가 치솟을 수 있습니다.
> * 따라서 ClamAV를 활성화하려면 **서버의 전체 메모리가 최소 4GB RAM 이상 (권장 8GB 이상)**이어야 합니다.
> * **메모리 부족 시 대안**: 만약 AWS EC2 `t3.small`(2GB) 등 저사양 인스턴스이거나 백신 검사가 불필요한 사내 테스트 환경이라면, 본 2단계를 건너뛰고 `.env` 파일에서 `CLAMAV_ENABLED=false`로 설정하여 비활성화하십시오.

### 2.1 스왑 메모리(Swap) 4GB 구성 (RAM 4GB 이하 인스턴스 필수)
ClamAV 구동 시 리눅스 커널의 OOM(Out Of Memory) Killer에 의해 프로세스가 강제 종료되는 현상을 방지하기 위해 4GB 스왑 공간을 필수로 확보합니다:
```bash
# 1. 기존 스왑 확인
sudo swapon --show

# 2. 4GB 스왑 파일 생성 및 활성화
sudo fallocate -l 4G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=4096
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# 3. 부팅 시 자동 마운트 등록
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 2.2 바이러스 시그니처 데이터베이스 업데이트
```bash
sudo systemctl stop clamav-freshclam 2>/dev/null || true
sudo freshclam
sudo systemctl enable --now clamav-freshclam
```

### 2.3 TCP 소켓 포트(3310) 활성화

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

### 2.4 ClamAV TCP 데몬 동작 검증
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

-- [주의] SSL 강제 옵션(require_secure_transport) 해제 (로컬 통신용)
-- 만약 require_secure_transport가 ON으로 설정되어 있으면 아래 명령으로 OFF 처리합니다.
SET GLOBAL require_secure_transport = OFF;

EXIT;
```

> [!NOTE]
> **MySQL `require_secure_transport` 설정 안내**
> * 보안 정책이나 클라우드 환경(AWS EC2/RDS 등)에 따라 MySQL의 `require_secure_transport=ON`이 활성화되어 있을 경우, 스키마 초기화(`init-schema.js`) 시 `ER_SECURE_TRANSPORT_REQUIRED` 에러가 발생할 수 있습니다.
> * 로컬 통신 환경에서는 위 SQL과 같이 `SET GLOBAL require_secure_transport = OFF;`를 실행하거나, `/etc/mysql/mysql.conf.d/mysqld.cnf` 파일의 `[mysqld]` 섹션에 `require_secure_transport = OFF`를 추가하여 주십시오.
> * **AWS RDS**를 사용하시는 경우, RDS 파라미터 그룹(Parameter Group)에서 `require_secure_transport`를 `0`(OFF)으로 설정해야 합니다.

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
unzip lemail_v1.2.0_*_obfuscated.zip -d /opt/lemail/

# ※ ZIP 파일 내부의 최상위 버전 디렉터리(예: lemail_v1.2.0)로 진입합니다:
cd /opt/lemail/lemail_v*

# 3. 런타임 공용 저장소 및 인증서 디렉터리 준비
mkdir -p /opt/lemail/mail-spool /opt/lemail/mail-archive /opt/lemail/mail-attachments /opt/lemail/license /opt/lemail/certs
```

### 5.2 운영 전용 의존성 모듈 설치
배포 패키지 내 루트 및 서비스별 운영 의존성을 설치합니다:
```bash
# 운영 모드 설치 (devDependencies 제외)
yarn install --production

# (참고) 만약 lockfile 충돌 에러 발생 시 아래 명령으로 설치:
# yarn install --production --no-lockfile
```

### 5.3 환경 변수 설정 (`.env`)
루트 디렉터리의 `.env.example`을 복사하여 `.env`를 생성합니다:
```bash
cp .env.example .env
nano .env
```

```ini
# ==========================================
# LEMail Production Environment Configuration
# ==========================================
# ※ API Core(9200) 및 Webmail(9000) 포트는 ecosystem.config.js 에서 각 서비스별로 설정됩니다.
NODE_ENV=production

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

# 4. Mail Service TLS Certificates (LEMail certs 디렉터리 권장)
IMAP_PORT=1143
IMAPS_PORT=1993
IMAP_STARTTLS=true
IMAP_TLS_CERT=/opt/lemail/certs/fullchain.pem
IMAP_TLS_KEY=/opt/lemail/certs/privkey.pem

# 5. Security & Master Encryption Key
JWT_SECRET=c28f09d84ef478c9320b9e81d714b901a8f9024cba81001928374655
APP_ENCRYPTION_KEY=e83a710bc82491a039d84e9021fa4b7c12093847561a0293847561a029384756

# 6. Default Admin (최초 1회 부트스트랩)
DEFAULT_ADMIN_EMAIL=admin@yourdomain.com
DEFAULT_ADMIN_PASSWORD=AdminStrongPass123!
DEFAULT_ADMIN_NAME=시스템관리자

# 7. 디스크 저장소 경로 (마이크로서비스 공통 중앙 절대경로 필수 지정)
MAIL_SPOOL_DIR=/opt/lemail/mail-spool
MAIL_ARCHIVE_DIR=/opt/lemail/mail-archive
MAIL_ATTACHMENT_DIR=/opt/lemail/mail-attachments
LICENSE_FILE_PATH=/opt/lemail/license/lemail-license.lic
```

> [!IMPORTANT]
> **디스크 저장소 절대 경로 설정 주의사항**
> LEMail은 Core API, Webmail UI, IMAP Microservice, Haraka MTA가 프로세스별로 분리 구동됩니다.
> 메일 본문(EML) 및 첨부파일 저장소가 각 서비스별 작업 디렉터리로 격리되지 않고 공유될 수 있도록, `MAIL_ARCHIVE_DIR`, `MAIL_ATTACHMENT_DIR`, `MAIL_SPOOL_DIR`는 반드시 `/opt/lemail/...`과 같은 **절대 경로(Absolute Path)**로 구성하십시오.

### 5.4 데이터베이스 스키마 및 초기 시드 실행
컴파일된 배포 스크립트를 직접 실행하여 DB 테이블 생성 및 관리자 계정을 초기화합니다:
```bash
node apps/api/dist/modules/database/scripts/init-schema.js
```
> 스크립트 실행 후 `[Database] Schema synchronization & initial seeding completed successfully!` 메시지를 확인합니다.

> [!TIP]
> **`Connections using insecure transport are prohibited while --require_secure_transport=ON` 에러 발생 시**
> MySQL 서버에 SSL 암호화 연결이 강제되어 발생하는 오류입니다.
> 1. 로컬 MySQL인 경우: `sudo mysql -u root` 접속 후 `SET GLOBAL require_secure_transport = OFF;` 실행
> 2. AWS RDS인 경우: RDS 파라미터 그룹에서 `require_secure_transport`를 `0`(OFF)으로 설정 후 다시 실행합니다.

---

## 6. 웹 SSL 및 메일 서비스 TLS 인증서 설치

메일 시스템은 웹(HTTPS: 443) 뿐만 아니라 메일 송수신(Inbound/Outbound SMTP TLS, IMAP SSL/TLS: 1143/1993)에도 공인 인증서가 필요합니다.

> [!IMPORTANT]
> **1. AWS 등 Cloud 환경 인바운드 80 포트 사전 개방 (필수)**
> * Let's Encrypt(`certbot --standalone`)는 도메인의 80번 포트(HTTP-01 Challenge)를 통해 도메인 소유권을 검증합니다.
> * **AWS EC2 보안 그룹(Security Group)**, **GCP 방화벽**, **NCP/Azure NSG**에서 인바운드 **HTTP (TCP 80, 0.0.0.0/0)** 포트가 사전 개방되어 있어야 합니다. 개방되지 않은 경우 인증서 발급 시 `Timeout during connect` 오류가 발생합니다.
> * OS 로컬 방화벽에서도 80 포트를 개방해야 합니다:
>   * Ubuntu (UFW): `sudo ufw allow 80/tcp && sudo ufw allow 443/tcp`
>   * Rocky Linux / RHEL (firewalld): `sudo firewall-cmd --add-service=http --add-service=https --permanent && sudo firewall-cmd --reload`
> * Certbot 독립 실행(standalone) 모드 구동 시 80 포트 점유 충돌을 방지하기 위해 Nginx가 실행 중이라면 일시 정지(`sudo systemctl stop nginx`) 후 발급해야 합니다.

> [!WARNING]
> **2. Root 권한 파일 생성 및 일반 사용자 실행 모듈 권한(EACCES) 문제 해결**
> * Certbot으로 발급받은 원본 파일(`/etc/letsencrypt/live/`, `/etc/letsencrypt/archive/`)은 `root:root` 소유 및 `0700` / `0600` 권한으로 생성됩니다.
> * 그러나 LEMail 서비스(특히 IMAP `services/imap` 및 Haraka `services/haraka`)는 일반 사용자 계정(`$USER`)의 PM2 프로세스로 실행되므로, 원본 경로를 직접 참조하면 `EACCES: permission denied` 권한 오류로 인해 서버가 크래시되거나 TLS 연결이 거부됩니다.
> * 따라서 **발급된 인증서를 LEMail 전용 인증서 디렉터리(`/opt/lemail/certs/`)로 복사하고 일반 사용자(`$USER:$USER`) 소유권 및 읽기 권한(`chmod 600 privkey.pem`)을 부여**하여 사용하는 것이 표준 보안 절차입니다.

### 6.1 Let's Encrypt를 통한 무료 인증서 발급
```bash
# 1. 80 포트 점유 방지를 위해 Nginx가 실행 중인 경우 일시 정지
sudo systemctl stop nginx 2>/dev/null || true

# 2. Let's Encrypt 인증서 발급 (도메인명 변경)
sudo certbot certonly --standalone -d mail.yourdomain.com
```
* 발급 원본 경로:
  * 인증서(Full Chain): `/etc/letsencrypt/live/mail.yourdomain.com/fullchain.pem`
  * 개인키(Private Key): `/etc/letsencrypt/live/mail.yourdomain.com/privkey.pem`

### 6.2 LEMail 전용 `certs` 디렉터리로 복사 및 권한 설정
발급된 인증서를 LEMail 서비스가 안전하게 접근할 수 있도록 `/opt/lemail/certs/` 디렉터리로 복사하고 소유권을 변경합니다:
```bash
# 1. LEMail 전용 certs 디렉터리 준비
mkdir -p /opt/lemail/certs

# 2. 원본 심볼릭 링크의 실체 파일(dereference: -L)을 복사
sudo cp -L /etc/letsencrypt/live/mail.yourdomain.com/fullchain.pem /opt/lemail/certs/fullchain.pem
sudo cp -L /etc/letsencrypt/live/mail.yourdomain.com/privkey.pem /opt/lemail/certs/privkey.pem

# 3. LEMail 실행 사용자($USER)에게 소유권 및 안전한 권한 부여
sudo chown -R $USER:$USER /opt/lemail/certs
chmod 644 /opt/lemail/certs/fullchain.pem
chmod 600 /opt/lemail/certs/privkey.pem
```

### 6.3 메일 서비스별 TLS 인증서 연동

1. **IMAP 마이크로서비스 (`services/imap`)**:
   * `.env` 파일에 복사한 인증서 경로를 지정합니다:
     ```ini
     IMAP_TLS_CERT=/opt/lemail/certs/fullchain.pem
     IMAP_TLS_KEY=/opt/lemail/certs/privkey.pem
     ```
2. **Haraka SMTP 아웃바운드 릴레이 (`services/haraka`)**:
   * 발신 메일의 TLS 암호화를 위해 Haraka 설정 디렉터리에 인증서를 복사합니다:
     ```bash
     # 배포 패키지 디렉터리(/opt/lemail/lemail_v*)에서 실행:
     mkdir -p services/haraka/config
     cp /opt/lemail/certs/fullchain.pem services/haraka/config/tls_cert.pem
     cp /opt/lemail/certs/privkey.pem services/haraka/config/tls_key.pem
     ```
   * > [!TIP]
     > Haraka는 기동 시 `/opt/lemail/certs/` 및 `.env`의 인증서 설정을 자동으로 감지하여 `services/haraka/config/`로 자동 동기화하므로, `/opt/lemail/certs`에 인증서가 있다면 별도 수동 복사 없이도 자동으로 공인 인증서가 적용됩니다.

### 6.4 Certbot 자동 갱신 및 LEMail 인증서 동기화 훅(Deploy Hook) 등록
Let's Encrypt 인증서는 90일마다 갱신됩니다. 갱신될 때마다 자동으로 LEMail 전용 디렉터리로 복사되고 서비스가 리로드되도록 갱신 후크 스크립트를 등록합니다:

```bash
sudo mkdir -p /etc/letsencrypt/renewal-hooks/deploy
sudo bash -c 'cat << "EOF" > /etc/letsencrypt/renewal-hooks/deploy/lemail-cert-sync.sh
#!/bin/bash
DOMAIN="mail.yourdomain.com"
LEMAIL_CERTS="/opt/lemail/certs"
RUN_USER="'"$USER"'"

if [ -d "$LEMAIL_CERTS" ] && [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    cp -L /etc/letsencrypt/live/$DOMAIN/fullchain.pem "$LEMAIL_CERTS/fullchain.pem"
    cp -L /etc/letsencrypt/live/$DOMAIN/privkey.pem "$LEMAIL_CERTS/privkey.pem"
    chown -R $RUN_USER:$RUN_USER "$LEMAIL_CERTS"
    chmod 644 "$LEMAIL_CERTS/fullchain.pem"
    chmod 600 "$LEMAIL_CERTS/privkey.pem"
    
    # Haraka 인증서 동기화 (배포 버전 경로)
    cp "$LEMAIL_CERTS/fullchain.pem" /opt/lemail/lemail_v*/services/haraka/config/tls_cert.pem 2>/dev/null || true
    cp "$LEMAIL_CERTS/privkey.pem" /opt/lemail/lemail_v*/services/haraka/config/tls_key.pem 2>/dev/null || true
    
    # 웹 서버 및 메일 서비스 리로드
    systemctl reload nginx 2>/dev/null || true
    pm2 restart lemail-imap lemail-haraka 2>/dev/null || true
fi
EOF'
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/lemail-cert-sync.sh
```

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

    # SSL 인증서 (/opt/lemail/certs 또는 /etc/letsencrypt/live 원본 경로)
    ssl_certificate /opt/lemail/certs/fullchain.pem;
    ssl_certificate_key /opt/lemail/certs/privkey.pem;
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
        PORT: 9200,
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

---

## 11. 트러블슈팅 및 자주 묻는 질문 (FAQ)

### Q1. 스키마 초기화 시 `require_secure_transport=ON` 에러가 발생합니다.
* **증상**:
  ```
  Schema initialization failed: Error: Connections using insecure transport are prohibited while --require_secure_transport=ON.
  code: 'ER_SECURE_TRANSPORT_REQUIRED', errno: 3159
  ```
* **원인**: MySQL 서버에 SSL/TLS 보안 연결 옵션(`require_secure_transport`)이 강제되어 있어 일반 평문 연결을 거부하는 경우입니다.
* **해결 방법**:
  1. **로컬 MySQL 8.0**:
     ```bash
     sudo mysql -u root
     ```
     ```sql
     SET GLOBAL require_secure_transport = OFF;
     EXIT;
     ```
     영구 설정을 위해 `/etc/mysql/mysql.conf.d/mysqld.cnf` 파일의 `[mysqld]` 섹션에 `require_secure_transport = OFF`를 추가하고 `sudo systemctl restart mysql`을 실행합니다.
  2. **AWS RDS / Aurora**: AWS 콘솔의 RDS 파라미터 그룹(Parameter Group)에서 `require_secure_transport` 값을 `0` (OFF)으로 변경 및 저장합니다.

### Q2. ClamAV 설치 후 3310 포트가 활성화되지 않거나 메모리가 부족합니다.
* **증상**: `sudo ss -tulpn | grep 3310` 에 아무것도 출력되지 않거나 `clamav-daemon`이 중지됨.
* **원인 1 (바이러스 DB 미다운로드)**:
  최초 설치 시 바이러스 DB가 비어있으면 데몬이 기동되지 않습니다.
  ```bash
  sudo systemctl stop clamav-freshclam
  sudo freshclam
  sudo systemctl enable --now clamav-freshclam
  sudo systemctl restart clamav-daemon
  ```
* **원인 2 (메모리 부족 OOM)**:
  ClamAV는 구동 시 약 1.2GB~1.5GB의 RAM을 사용합니다. RAM이 부족한 저사양 서버의 경우:
  * 스왑(Swap) 메모리 2GB~4GB 추가:
    ```bash
    sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
    ```
  * 또는 ClamAV를 삭제하고 LEMail 설정에서 비활성화:
    ```bash
    # ClamAV 서비스 및 패키지 삭제
    sudo systemctl stop clamav-daemon clamav-freshclam 2>/dev/null || true
    sudo apt-get purge -y "clamav*"
    sudo apt-get autoremove -y --purge

    # /opt/lemail/.env 파일에서 ClamAV 비활성화
    # CLAMAV_ENABLED=false
    ```

### Q3. `yarn install` 시 `Your lockfile needs to be updated` 에러가 발생합니다.
* **원인**: `--frozen-lockfile` 옵션 사용 시 배포 패키지 내 lockfile 체크섬 불일치로 발생합니다.
* **해결 방법**:
  ```bash
  yarn install --production
  # 또는
  yarn install --production --no-lockfile
  ```
