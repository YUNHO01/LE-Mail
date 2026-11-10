# 🐳 LEMail Docker & Docker Compose 설치 가이드

본 문서는 **Docker Engine 및 Docker Compose**를 기반으로 LEMail의 전 서비스(웹메일, API, IMAP, Haraka MTA, MySQL, Redis, Nginx 프록시)를 컨테이너화하여 격리된 환경에서 원클릭으로 간편하게 구축하고 운영하는 방법을 안내합니다.

> [!NOTE]
> 호스트 OS에 직접(Baremetal/VM) 서비스를 설치하고자 하시는 경우 [Linux 설치 가이드](linux-install.md) 또는 [Windows 설치 가이드](windows-install.md)를 참조하십시오.

---

## 1. 사전 요구사항 (Prerequisites)

- **Docker Engine**: v24.0 이상 설치 ([공식 설치 가이드](https://docs.docker.com/engine/install/))
- **Docker Compose**: v2.20 이상 (Compose V2 플러그인)
- **호스트 방화벽 포트 개방**:
  - `80`, `443` (HTTP/HTTPS 웹메일)
  - `25` (Inbound SMTP 메일 수신)
  - `143` (IMAP STARTTLS)
  - `993` (IMAPS SSL/TLS)

---

## 2. 배포 디렉터리 구성

호스트 서버에 배포 디렉터리를 생성하고 영속성(Persistence) 데이터 볼륨 디렉터리를 준비합니다:

```bash
mkdir -p /opt/lemail-docker/{data/mysql,data/redis,data/spool,data/archive,data/attachments,license,ssl}
cd /opt/lemail-docker
```

---

## 3. `docker-compose.yml` 완전체 구성

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
      MYSQL_ROOT_PASSWORD: RootPassword123!
      MYSQL_DATABASE: lemaildb
      MYSQL_USER: lemail
      MYSQL_PASSWORD: StrongPassword123!
    command:
      - --character-set-server=utf8mb4
      - --collation-server=utf8mb4_unicode_ci
      - --default-authentication-plugin=mysql_native_password
      - --max_connections=500
      - --innodb_buffer_pool_size=4G
    volumes:
      - ./data/mysql:/var/lib/mysql
    networks:
      - lemail-net
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5

  # 2. Redis 7.0 (BullMQ 큐 및 사서함 캐시)
  redis:
    image: redis:7-alpine
    container_name: lemail-redis
    restart: always
    command: redis-server --appendonly yes --maxmemory 2gb --maxmemory-policy noeviction
    volumes:
      - ./data/redis:/data
    networks:
      - lemail-net
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

  # 3. Core API & Inbound ESMTP (NestJS)
  api:
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

  # 4. Webmail UI (Next.js 14)
  web:
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

  # 5. IMAP4rev1 Microservice
  imap:
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
      - ./ssl:/app/certs
    ports:
      - "1143:1143"   # IMAP Plain / STARTTLS
      - "1993:1993"   # IMAPS (TLS)
    networks:
      - lemail-net

  # 6. Haraka Outbound MTA
  haraka:
    build:
      context: .
      dockerfile: services/haraka/Dockerfile
    container_name: lemail-haraka
    restart: always
    depends_on:
      - api
    volumes:
      - ./license:/app/license
    ports:
      - "2526:2526"
    networks:
      - lemail-net

  # 7. Nginx Frontend Proxy & SSL Termination
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
      - "25:25"       # Public SMTP Inbound (Port Forward to API:2525)
      - "143:143"     # Public IMAP (Port Forward to IMAP:1143)
      - "993:993"     # Public IMAPS (Port Forward to IMAP:1993)
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

## 4. 환경 변수 파일(`.env`) 작성

`/opt/lemail-docker/.env` 파일을 작성합니다:

```ini
NODE_ENV=production
SYSTEM_DOMAIN=yourdomain.com

# Database Connection (Docker 컨테이너 호스트명 사용)
DB_HOST=mysql
DB_PORT=3306
DB_USERNAME=lemail
DB_PASSWORD=StrongPassword123!
DB_DATABASE=lemaildb
DB_POOL_SIZE=30

# Redis Connection
REDIS_HOST=redis
REDIS_PORT=6379

# Security Secrets (최소 32자 이상 랜덤값)
JWT_SECRET=c28f09d84ef478c9320b9e81d714b901a8f9024cba81
ENCRYPTION_KEY=e83a710bc82491a039d84e9021fa4b7c12093847561a0293847561a029384756

# Storage Paths inside Containers
SPOOL_DIR=/app/mail-spool
ARCHIVE_DIR=/app/mail-archive
ATTACHMENTS_DIR=/app/mail-attachments
LICENSE_FILE_PATH=/app/license/lemail-license.lic
```

---

## 5. Nginx 리버스 프록시 설정 (`nginx.conf`)

`/opt/lemail-docker/nginx.conf`를 작성하여 웹과 메일 프로토콜을 동시에 라우팅합니다:

```nginx
events {
    worker_connections 4096;
}

# TCP Stream 프록시 (SMTP 포트 25 및 IMAP 포트 143/993 라우팅)
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

# HTTP / HTTPS 웹메일 프록시
http {
    include /etc/nginx/mime.types;
    client_max_body_size 50M;

    server {
        listen 80;
        server_name mail.yourdomain.com;
        return 301 https://$host$request_uri;
    }

    server {
        listen 443 ssl;
        server_name mail.yourdomain.com;

        ssl_certificate /etc/ssl/certs/fullchain.pem;
        ssl_certificate_key /etc/ssl/certs/privkey.pem;

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
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
```

---

## 6. 컨테이너 일괄 기동 및 초기화

```bash
# 1. 컨테이너 백그라운드 빌드 및 기동
docker compose up -d

# 2. 컨테이너 실행 상태 확인
docker compose ps

# 3. DB 스키마 초기화 실행 (API 컨테이너 내부 실행)
docker compose exec api yarn --cwd apps/api ts-node src/modules/database/scripts/init-schema.ts
```

---

## 7. 서비스 정상 동작 확인

1. 웹 브라우저를 열고 `https://mail.yourdomain.com` 접속.
2. 기본 관리자 계정으로 로그인 (Seed 기본값: `admin@yourdomain.com`).
3. 관리자 대시보드 및 시스템 상태가 정상적으로 가동 중인지 확인합니다.
4. 관리자 메뉴에서 도메인을 추가하고 사용자 계정을 생성하여 메일 송수신 및 IMAP 서비스를 시작합니다.

---

## 8. 컨테이너 백업 및 업그레이드

### 데이터 백업
호스트의 `./data` 디렉터리에 모든 영속성 데이터가 매핑되어 있으므로 표준 백업 도구(rsync, tar)로 안전하게 백업할 수 있습니다:
```bash
# MySQL 덤프 백업
docker compose exec mysql mysqldump -u lemail -pStrongPassword123! lemaildb > backup_lemaildb_$(date +%Y%m%d).sql

# EML 원본 및 첨부파일 백업
tar -czvf lemail_storage_$(date +%Y%m%d).tar.gz ./data/archive ./data/attachments
```

### 무중단 롤링 업데이트
```bash
git pull origin main
docker compose build
docker compose up -d --no-deps api web imap haraka
```
