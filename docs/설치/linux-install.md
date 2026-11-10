# 🐧 LEMail Linux (Baremetal / VM) 설치 가이드

본 문서는 Linux 운영체제(Ubuntu 22.04 LTS 또는 Rocky Linux / RHEL 9) 환경에서 LEMail을 직접(Baremetal / VM) 설치하고 `systemd` 서비스 데몬으로 등록하여 무중단 운영하는 방법을 안내합니다.

> [!NOTE]
> Docker 컨테이너 기반으로 설치하고자 하시는 경우 [Docker 설치 가이드](docker-install.md)를 참조하십시오.

---

## 1. 시스템 사전 필수 패키지 설치

### 1.1 Ubuntu 22.04 / 24.04 LTS
```bash
# 1. 시스템 업데이트
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y curl wget git build-essential nginx certbot python3-certbot-nginx

# 2. Node.js 20.x LTS 설치 (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g yarn

# 3. MySQL 8.0 및 Redis 7.x 설치
sudo apt-get install -y mysql-server redis-server
sudo systemctl enable --now mysql redis-server
```

### 1.2 Rocky Linux 9 / RHEL 9
```bash
sudo dnf update -y
sudo dnf groupinstall -y "Development Tools"
sudo dnf install -y git nginx curl wget

# Node.js 20 설치
sudo dnf module enable -y nodejs:20
sudo dnf install -y nodejs
sudo npm install -g yarn

# MySQL 8.0 & Redis 7
sudo dnf install -y mysql-server redis
sudo systemctl enable --now mysqld redis
```

---

## 2. 방화벽 포트 설정

```bash
# Ubuntu (UFW)
sudo ufw allow 22/tcp       # SSH
sudo ufw allow 80/tcp       # HTTP
sudo ufw allow 443/tcp      # HTTPS
sudo ufw allow 25/tcp       # Inbound SMTP
sudo ufw allow 143/tcp      # IMAP (STARTTLS)
sudo ufw allow 993/tcp      # IMAPS (TLS)
sudo ufw enable

# Rocky Linux (firewalld)
sudo firewall-cmd --permanent --add-service={http,https,ssh}
sudo firewall-cmd --permanent --add-port={25/tcp,143/tcp,993/tcp}
sudo firewall-cmd --reload
```

---

## 3. 데이터베이스 생성 및 권한 부여

```bash
sudo mysql -u root
```

```sql
CREATE DATABASE IF NOT EXISTS `lemaildb` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'lemail'@'localhost' IDENTIFIED BY 'StrongPassword123!';
CREATE USER IF NOT EXISTS 'lemail'@'127.0.0.1' IDENTIFIED BY 'StrongPassword123!';
GRANT ALL PRIVILEGES ON `lemaildb`.* TO 'lemail'@'localhost';
GRANT ALL PRIVILEGES ON `lemaildb`.* TO 'lemail'@'127.0.0.1';
FLUSH PRIVILEGES;
EXIT;
```

---

## 4. 소스코드 배포 및 빌드

```bash
# 1. 설치 디렉터리 준비 (예: /opt/lemail)
sudo mkdir -p /opt/lemail
sudo chown -R $USER:$USER /opt/lemail
cd /opt/lemail

# 2. 소스코드 복사 또는 Git Clone
git clone <repository_url> .

# 3. 의존성 패키지 설치
yarn install

# 4. 환경 변수 파일(.env) 작성
cp .env.example .env
nano .env
```

### 주요 `.env` 설정 확인
```ini
NODE_ENV=production
PORT=9200
WEB_PORT=9000

# 데이터베이스
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USERNAME=lemail
DB_PASSWORD=StrongPassword123!
DB_DATABASE=lemaildb
DB_POOL_SIZE=30

# Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# 암호화 및 세션
JWT_SECRET=YOUR_SUPER_SECURE_JWT_SECRET_KEY_MIN_32_CHAR
ENCRYPTION_KEY=YOUR_HEX_ENCRYPTION_KEY_64_CHAR

# 메일 도메인 및 디스크 경로
SYSTEM_DOMAIN=yourdomain.com
SPOOL_DIR=/opt/lemail/mail-spool
ARCHIVE_DIR=/opt/lemail/mail-archive
ATTACHMENTS_DIR=/opt/lemail/mail-attachments
LICENSE_FILE_PATH=/opt/lemail/license/lemail-license.lic
```

```bash
# 5. DB 스키마 초기화 실행
yarn --cwd apps/api ts-node src/modules/database/scripts/init-schema.ts

# 6. 전체 프로젝트 프로덕션 빌드 (Turborepo)
yarn build
```

---

## 5. 라이선스 발급 및 초기 등록

```bash
# 1. LEMail 전용 RSA-2048 비대칭 키 생성
yarn license:generate-keys

# 2. 발급 환경(dev 또는 prod)에 맞는 정품 라이선스 발급
# 예: (주)고객사용 500명 정원, 등록유효기간 14일, 영구 라이선스 발급
yarn license:issue:prod --org "(주)고객사" --users 500 --days 14 --expires unlimited --out ./license_install.lic
```

---

## 6. Nginx 리버스 프록시 및 SSL 설정

### 6.1 웹 및 API 프록시 설정 (`/etc/nginx/sites-available/lemail.conf`)
```nginx
server {
    listen 80;
    server_name mail.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name mail.yourdomain.com;

    # SSL 인증서 (Let's Encrypt 또는 공인 인증서)
    ssl_certificate /etc/letsencrypt/live/mail.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mail.yourdomain.com/privkey.pem;

    client_max_body_size 50M;

    # Webmail Client
    location / {
        proxy_pass http://127.0.0.1:9000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # REST API & WebSocket
    location /api {
        proxy_pass http://127.0.0.1:9200;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/lemail.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 6.2 표준 SMTP 포트 25 포워딩 (Iptables / AuthBind)
리눅스에서 1024 이하 포트는 root 권한이 필요하므로, LEMail Inbound SMTP(`2525`)로 포트 포워딩을 적용합니다:
```bash
sudo iptables -t nat -A PREROUTING -p tcp --dport 25 -j REDIRECT --to-port 2525
sudo iptables-save | sudo tee /etc/iptables.rules
```

---

## 7. `systemd` 서비스 등록 및 프로세스 상시화

LEMail의 4대 핵심 서비스를 각각 독립적인 systemd 서비스로 등록합니다.

### 7.1 Core API & Inbound ESMTP (`/etc/systemd/system/lemail-api.service`)
```ini
[Unit]
Description=LEMail Core API and ESMTP Ingestion Service
After=network.target mysql.service redis.service

[Service]
Type=simple
User=lemail
WorkingDirectory=/opt/lemail/apps/api
Environment=NODE_ENV=production
Environment=NODE_OPTIONS="--max-old-space-size=4096"
ExecStart=/usr/bin/node dist/main.js
Restart=always
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
```

### 7.2 Webmail UI (`/etc/systemd/system/lemail-web.service`)
```ini
[Unit]
Description=LEMail Next.js Webmail Client
After=network.target lemail-api.service

[Service]
Type=simple
User=lemail
WorkingDirectory=/opt/lemail/apps/web
Environment=NODE_ENV=production
ExecStart=/usr/bin/yarn start -p 9000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### 7.3 IMAP Service (`/etc/systemd/system/lemail-imap.service`)
```ini
[Unit]
Description=LEMail IMAP4rev1 Microservice
After=network.target mysql.service redis.service

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

### 7.4 Haraka Outbound MTA (`/etc/systemd/system/lemail-haraka.service`)
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

### 7.5 서비스 일괄 활성화 및 시작
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now lemail-api lemail-web lemail-imap lemail-haraka

# 구동 상태 확인
sudo systemctl status lemail-api lemail-web lemail-imap lemail-haraka
```

---

## 8. 초기 라이선스 파일 등록 및 서비스 개시

1. 웹 브라우저를 열고 `https://mail.yourdomain.com/login` 접속.
2. 초기 관리자 계정으로 로그인 (Seed 기본값: `admin@yourdomain.com`).
3. 관리자 사이드바의 **[라이선스 관리] (`/admin/license`)** 메뉴로 이동.
4. 앞서 5단계에서 발급한 `license_install.lic` 파일을 업로드.
5. 시스템 상태 배지가 **"정품 인증 완료 (파일 ↔ DB 일치)"**로 전환되면 모든 메일 송수신 및 IMAP 서비스가 정상 개시됩니다.
