# 🐳 LEMail Docker & Docker Compose 배포 가이드

본 문서는 **Docker Engine 및 Docker Compose**를 기반으로 LEMail의 핵심 서비스(Webmail, Core API, IMAP, Haraka MTA), 인프라(MySQL, Redis), 보안 백신(ClamAV), 프록시(Nginx) 전 구성을 컨테이너화하여 원클릭으로 구축하고 운영하는 방법을 안내합니다.

> [!NOTE]
> 호스트 OS에 직접 설치(Baremetal/VM)하고자 하시는 경우 [Linux 설치 가이드](linux-install.md) 또는 [Windows 설치 가이드](windows-install.md)를 참조하십시오.

---

## 📌 구성 아키텍처 및 포함 컴포넌트

* **Frontend Proxy**: Nginx (Web HTTPS 443 + Stream 프록시: SMTP 25, IMAP 143/993)
* **Security Antivirus**: ClamAV 1.x (`clamav/clamav:latest`, TCP 3310 첨부파일 실시간 백신 검사)
* **Database**: MySQL 8.0 (영속성 볼륨 및 utf8mb4 인코딩)
* **Cache & Message Queue**: Redis 7.0 (`requirepass` 비밀번호 인증, AOF 지속성, `noeviction` 큐 보호)
* **Mail Services**:
  * Core API & Inbound ESMTP (포트 2525, 9200)
  * Webmail UI Next.js (포트 9000)
  * IMAP4rev1 Microservice (포트 1143, 1993, STARTTLS/IMAPS 지원)
  * Haraka Outbound Relay MTA (포트 2526, TLS 아웃바운드)

---

## 1. 사전 요구사항

* **Docker Engine**: v24.0 이상 ([공식 설치 가이드](https://docs.docker.com/engine/install/))
* **Docker Compose**: Compose V2 플러그인 (`docker compose` 지원)
* **호스트 방화벽 포트 개방**:
  * `80`, `443` (HTTP/HTTPS 웹메일)
  * `25` (표준 Inbound SMTP 메일 수신)
  * `143` (IMAP STARTTLS)
  * `993` (IMAPS TLS)

---

## 2. 배포 디렉터리 및 볼륨 준비

호스트 서버에 배포 디렉터리를 생성하고 영속성(Persistence) 데이터 및 SSL 인증서 저장소를 준비합니다:

```bash
# 배포 디렉터리 구조 생성
mkdir -p /opt/lemail-docker/{data/mysql,data/redis,data/clamav,data/spool,data/archive,data/attachments,license,ssl}
cd /opt/lemail-docker
```

---

## 3. SSL/TLS 인증서 파일 배치

`mail.yourdomain.com`의 공인 SSL/TLS 인증서 파일을 `/opt/lemail-docker/ssl` 디렉터리에 복사합니다:
* **인증서 체인**: `/opt/lemail-docker/ssl/fullchain.pem`
* **개인키**: `/opt/lemail-docker/ssl/privkey.pem`

> [!TIP]
> Let's Encrypt를 사용하는 경우 호스트에서 발급받은 인증서를 심볼릭 링크하거나 복사하여 배치합니다:
> ```bash
> sudo cp /etc/letsencrypt/live/mail.yourdomain.com/fullchain.pem /opt/lemail-docker/ssl/
> sudo cp /etc/letsencrypt/live/mail.yourdomain.com/privkey.pem /opt/lemail-docker/ssl/
> sudo chmod 644 /opt/lemail-docker/ssl/fullchain.pem
> sudo chmod 600 /opt/lemail-docker/ssl/privkey.pem
> ```

---

## 4. `docker-compose.yml` 완전체 구성

아래 내용을 `/opt/lemail-docker/docker-compose.yml` 파일로 저장합니다:

```yaml
version: '3.8'

services:
  # 1. MySQL 8.0 데이터베이스
  mysql:
    image: mysql:8.0
    container_name: lemail-mysql
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: RootSecurePassword123!
      MYSQL_DATABASE: lemaildb
      MYSQL_USER: lemail
      MYSQL_PASSWORD: StrongDbPassword123!
    command:
      - --character-set-server=utf8mb4
      - --collation-server=utf8mb4_unicode_ci
      - --default-authentication-plugin=mysql_native_password
      - --max_connections=500
      - --innodb_buffer_pool_size=2G
    volumes:
      - ./data/mysql:/var/lib/mysql
    networks:
      - lemail-net
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5

  # 2. Redis 7.0 (requirepass 비밀번호 인증 & 큐 지속성)
  redis:
    image: redis:7-alpine
    container_name: lemail-redis
    restart: always
    command: >
      redis-server 
      --requirepass SuperSecureRedisPass123!
      --appendonly yes 
      --maxmemory 2gb 
      --maxmemory-policy noeviction
    volumes:
      - ./data/redis:/data
    networks:
      - lemail-net
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "SuperSecureRedisPass123!", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

  # 3. ClamAV 안티바이러스 데몬 (실시간 첨부파일 검사)
  clamav:
    image: clamav/clamav:latest
    container_name: lemail-clamav
    restart: always
    volumes:
      - ./data/clamav:/var/lib/clamav
    networks:
      - lemail-net
    healthcheck:
      test: ["CMD-SHELL", "echo 'zPING\0' | nc 127.0.0.1 3310 || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 60s

  # 4. Core API & Inbound ESMTP (NestJS)
  api:
    image: lemail/api:latest
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    container_name: lemail-api
    restart: always
    depends_on:
      mysql:
        condition: service_healthy
      redis:
        condition: service_healthy
      clamav:
        condition: service_healthy
    env_file:
      - .env
    volumes:
      - ./data/spool:/app/mail-spool
      - ./data/archive:/app/mail-archive
      - ./data/attachments:/app/mail-attachments
      - ./license:/app/license
    ports:
      - "2525:2525"   # 내부 ESMTP 수신 포트
      - "9200:9200"   # REST API 포트
    networks:
      - lemail-net

  # 5. Webmail UI (Next.js)
  web:
    image: lemail/web:latest
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    container_name: lemail-web
    restart: always
    depends_on:
      - api
    env_file:
      - .env
    ports:
      - "9000:9000"
    networks:
      - lemail-net

  # 6. IMAP4rev1 Microservice (SSL/TLS 지원)
  imap:
    image: lemail/imap:latest
    build:
      context: .
      dockerfile: services/imap/Dockerfile
    container_name: lemail-imap
    restart: always
    depends_on:
      mysql:
        condition: service_healthy
      redis:
        condition: service_healthy
    env_file:
      - .env
    volumes:
      - ./data/archive:/app/mail-archive
      - ./data/attachments:/app/mail-attachments
      - ./license:/app/license
      - ./ssl:/app/certs:ro
    ports:
      - "1143:1143"   # IMAP Plain / STARTTLS
      - "1993:1993"   # IMAPS (Direct TLS)
    networks:
      - lemail-net

  # 7. Haraka Outbound MTA (TLS 릴레이)
  haraka:
    image: lemail/haraka:latest
    build:
      context: .
      dockerfile: services/haraka/Dockerfile
    container_name: lemail-haraka
    restart: always
    depends_on:
      - api
    volumes:
      - ./license:/app/license
      - ./ssl/fullchain.pem:/app/config/tls_cert.pem:ro
      - ./ssl/privkey.pem:/app/config/tls_key.pem:ro
    ports:
      - "2526:2526"
    networks:
      - lemail-net

  # 8. Nginx Frontend Proxy & SSL Termination
  nginx:
    image: nginx:alpine
    container_name: lemail-nginx
    restart: always
    depends_on:
      - web
      - api
      - imap
    ports:
      - "80:80"       # HTTP
      - "443:443"     # HTTPS Webmail
      - "25:25"       # Public Inbound SMTP (Stream Proxy -> API:2525)
      - "143:143"     # Public IMAP (Stream Proxy -> IMAP:1143)
      - "993:993"     # Public IMAPS (Stream Proxy -> IMAP:1993)
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/ssl/certs:ro
    networks:
      - lemail-net

networks:
  lemail-net:
    driver: bridge
```

---

## 5. 환경 변수 파일(`.env`) 작성

`/opt/lemail-docker/.env` 파일을 작성합니다:

```ini
NODE_ENV=production
SYSTEM_DOMAIN=yourdomain.com

# Database Connection (Docker 네트워크 서비스명 사용)
DB_HOST=mysql
DB_PORT=3306
DB_USERNAME=lemail
DB_PASSWORD=StrongDbPassword123!
DB_DATABASE=lemaildb
DB_POOL_SIZE=30

# Redis Connection (requirepass 설정 일치)
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=SuperSecureRedisPass123!

# ClamAV Antivirus Daemon
CLAMAV_HOST=clamav
CLAMAV_PORT=3310
CLAMAV_ENABLED=true
CLAMAV_TIMEOUT_MS=3000

# IMAP TLS Certificates
IMAP_PORT=1143
IMAPS_PORT=1993
IMAP_STARTTLS=true
IMAP_TLS_CERT=/app/certs/fullchain.pem
IMAP_TLS_KEY=/app/certs/privkey.pem

# Security Secrets (최소 32자 이상 랜덤값)
JWT_SECRET=c28f09d84ef478c9320b9e81d714b901a8f9024cba81001928374655
APP_ENCRYPTION_KEY=e83a710bc82491a039d84e9021fa4b7c12093847561a0293847561a029384756

# Initial Default Administrator
DEFAULT_ADMIN_EMAIL=admin@yourdomain.com
DEFAULT_ADMIN_PASSWORD=AdminStrongPass123!
DEFAULT_ADMIN_NAME=시스템관리자

# Storage Paths inside Containers
SPOOL_DIR=/app/mail-spool
ARCHIVE_DIR=/app/mail-archive
ATTACHMENTS_DIR=/app/mail-attachments
LICENSE_FILE_PATH=/app/license/lemail-license.lic
```

---

## 6. Nginx 리버스 프록시 설정 (`nginx.conf`)

`/opt/lemail-docker/nginx.conf` 파일을 작성합니다:

```nginx
events {
    worker_connections 4096;
}

# TCP Stream 프록시 (SMTP 25 및 IMAP 143 / 993 라우팅)
stream {
    upstream smtp_backend {
        server api:2525;
    }
    upstream imap_backend {
        server imap:1143;
    }
    upstream imaps_backend {
        server imap:1993;
    }

    server {
        listen 25;
        proxy_pass smtp_backend;
        proxy_timeout 300s;
    }
    server {
        listen 143;
        proxy_pass imap_backend;
        proxy_timeout 600s;
    }
    server {
        listen 993;
        proxy_pass imaps_backend;
        proxy_timeout 600s;
    }
}

# HTTP / HTTPS 웹메일 및 API 프록시
http {
    include /etc/nginx/mime.types;
    client_max_body_size 50M;

    server {
        listen 80;
        server_name mail.yourdomain.com;
        return 301 https://$host$request_uri;
    }

    server {
        listen 443 ssl http2;
        server_name mail.yourdomain.com;

        ssl_certificate /etc/ssl/certs/fullchain.pem;
        ssl_certificate_key /etc/ssl/certs/privkey.pem;
        ssl_protocols TLSv1.2 TLSv1.3;

        location / {
            proxy_pass http://web:9000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        location /api {
            proxy_pass http://api:9200;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_read_timeout 300s;
        }
    }
}
```

---

## 7. 컨테이너 일괄 기동 및 데이터베이스 초기화

```bash
# 1. 컨테이너 일괄 기동
docker compose up -d

# 2. 실행 상태 및 헬스체크 확인
docker compose ps

# 3. 데이터베이스 스키마 및 초기 관리자 시드 초기화 (배포 산출물 스크립트 실행)
docker compose exec api node dist/modules/database/scripts/init-schema.js
```

---

## 8. 최종 동작 확인

1. 브라우저에서 `https://mail.yourdomain.com` 접속 후 관리자 계정으로 로그인.
2. 관리자 메뉴 ➔ **스팸 & 보안 설정 (`/admin/spam-rules`)**에서 ClamAV 연결 테스트 실행 (`clamav:3310` 연결 정상 확인).
3. 외부 메일 발송 및 IMAP 수신 검증.
