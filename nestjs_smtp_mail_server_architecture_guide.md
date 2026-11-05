# NestJS + TypeORM(MySQL) + BullMQ/Redis 기반 SMTP 메일 서버 아키텍처

본 문서는 **NestJS, TypeORM (MySQL), BullMQ (Redis), Piscina (Worker Threads)** 기반의 엔터프라이즈급 SMTP 메일 수신/발송 서버 아키텍처 설계 및 구현 가이드입니다.

---

## 1. 시스템 아키텍처 개요

시스템은 **수신 계층(Ingestion)**, **버퍼/큐 계층(Queue)**, **연산/파싱 계층(Processing Worker)**, **데이터 계층(Storage/DB)**으로 명확히 관심사를 분리합니다.

```
                           [ External MTA / Client ]
                                      │ (TCP 25 / 587 / 465)
                                      ▼
             ┌──────────────────────────────────────────────────┐
             │       Ingestion Layer (NestJS SMTP Server)       │
             │   - Fast Handshake (HELO/EHLO, AUTH, STARTTLS)   │
             │   - Early Reject (DNSBL, SPF Check, Mailbox OK)  │
             │   - Stream Raw EML directly to Disk/ObjectStore  │
             └────────────────────────┬─────────────────────────┘
                                      │ Enqueue Metadata Only
                                      ▼
                        ┌───────────────────────────┐
                        │    Redis (BullMQ Queue)   │
                        │    'mail-inbound-queue'   │
                        └─────────────┬─────────────┘
                                      │ Job Dispatch
                                      ▼
             ┌──────────────────────────────────────────────────┐
             │       Processing Worker (NestJS Consumer)        │
             │   - BullMQ Processor (Task Scheduling)           │
             │   - Piscina Worker Threads (Off-thread CPU Load) │
             │     ├─ MIME Parsing (mailparser)                 │
             │     ├─ DKIM Verification & DMARC Validation      │
             │     └─ Attachment Extractor                      │
             └────────────────────────┬─────────────────────────┘
                                      │ Persist Entity
                                      ▼
                        ┌───────────────────────────┐
                        │       MySQL Database      │
                        │ (TypeORM Entities: Mails) │
                        └───────────────────────────┘
```

---

## 2. 데이터베이스 스키마 설계 (TypeORM / MySQL)

### ERD 구조
- **Mailbox**: 도메인 및 수신 계정 관리
- **MailMessage**: 수신/발송된 원본 메일 메타데이터
- **MailRecipient**: 수신자(To, Cc, Bcc) 관계 테이블
- **MailAttachment**: 첨부파일 메타데이터 및 스토리지 경로

```sql
CREATE TABLE `mailbox` (
  `id` VARCHAR(36) PRIMARY KEY,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `domain` VARCHAR(255) NOT NULL,
  `is_active` BOOLEAN DEFAULT TRUE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE `mail_message` (
  `id` VARCHAR(36) PRIMARY KEY,
  `direction` ENUM('INBOUND', 'OUTBOUND') NOT NULL,
  `message_id` VARCHAR(255) NULL,
  `sender` VARCHAR(255) NOT NULL,
  `subject` VARCHAR(500) NULL,
  `raw_file_path` VARCHAR(500) NOT NULL,
  `spf_result` ENUM('PASS', 'FAIL', 'SOFTFAIL', 'NEUTRAL', 'NONE') DEFAULT 'NONE',
  `dkim_result` ENUM('PASS', 'FAIL', 'NONE') DEFAULT 'NONE',
  `dmarc_result` ENUM('PASS', 'FAIL', 'NONE') DEFAULT 'NONE',
  `status` ENUM('QUEUED', 'PROCESSED', 'FAILED') DEFAULT 'QUEUED',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_sender` (`sender`),
  INDEX `idx_created_at` (`created_at`)
);

CREATE TABLE `mail_recipient` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `message_id` VARCHAR(36) NOT NULL,
  `type` ENUM('TO', 'CC', 'BCC') NOT NULL,
  `address` VARCHAR(255) NOT NULL,
  FOREIGN KEY (`message_id`) REFERENCES `mail_message`(`id`) ON DELETE CASCADE
);

CREATE TABLE `mail_attachment` (
  `id` VARCHAR(36) PRIMARY KEY,
  `message_id` VARCHAR(36) NOT NULL,
  `filename` VARCHAR(255) NOT NULL,
  `content_type` VARCHAR(100) NOT NULL,
  `size_bytes` BIGINT NOT NULL,
  `storage_path` VARCHAR(500) NOT NULL,
  FOREIGN KEY (`message_id`) REFERENCES `mail_message`(`id`) ON DELETE CASCADE
);
```

---

## 3. 핵심 디렉토리 구조

```text
src/
├── config/                  # 환경 변수, DB, Redis 설정
├── modules/
│   ├── database/            # TypeORM 연결 및 엔티티
│   │   └── entities/
│   │       ├── mailbox.entity.ts
│   │       ├── mail-message.entity.ts
│   │       ├── mail-recipient.entity.ts
│   │       └── mail-attachment.entity.ts
│   ├── smtp-ingestion/      # SMTP TCP 수신 엔진
│   │   ├── smtp-ingestion.service.ts
│   │   └── smtp-ingestion.module.ts
│   ├── queue/               # BullMQ Producer/Consumer
│   │   ├── inbound-mail.producer.ts
│   │   ├── inbound-mail.processor.ts
│   │   └── queue.module.ts
│   └── worker-pool/         # CPU 바운드 오프로딩 (Piscina)
│       ├── worker-pool.service.ts
│       ├── mail-parser.worker.ts  # Worker Thread 파일
│       └── worker-pool.module.ts
├── common/                  # 인터페이스, 유틸, 상수
└── app.module.ts
```

---

## 4. 핵심 컴포넌트 구현 가이드

### 4.1. SMTP Ingestion Service (`smtp-ingestion.service.ts`)
`smtp-server` 라이브러리를 NestJS 라이프사이클에 연결하고, 수신 데이터를 디스크/스토리지 스트림으로 직결합니다.

```typescript
import { Injectable, OnApplicationBootstrap, OnApplicationShutdown, Logger } from '@nestjs/common';
import { SMTPServer, SMTPServerSession, SMTPServerDataStream } from 'smtp-server';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { InboundMailProducer } from '../queue/inbound-mail.producer';

@Injectable()
export class SmtpIngestionService implements OnApplicationBootstrap, OnApplicationShutdown {
  private server: SMTPServer;
  private readonly logger = new Logger(SmtpIngestionService.name);
  private readonly spoolDir = process.env.MAIL_SPOOL_DIR || '/tmp/mail-spool';

  constructor(private readonly mailProducer: InboundMailProducer) {}

  onApplicationBootstrap() {
    if (!existsSync(this.spoolDir)) {
      mkdirSync(this.spoolDir, { recursive: true });
    }

    this.server = new SMTPServer({
      banner: 'ESMTP Mail Server Ready',
      size: 25 * 1024 * 1024, // 25MB
      authOptional: true,
      disabledCommands: ['VRFY'],

      // 1. 수신자 검증 단계 (Early Reject)
      onRcptTo: (address, session, callback) => {
        // 도메인/메일함 활성화 여부 검증 (In-memory 캐시/Redis 확인 권장)
        callback();
      },

      // 2. 본문 스트리밍 수신 (Non-blocking I/O)
      onData: (stream: SMTPServerDataStream, session: SMTPServerSession, callback) => {
        const id = randomUUID();
        const rawFilePath = join(this.spoolDir, `${id}.eml`);
        const fileStream = createWriteStream(rawFilePath);

        stream.pipe(fileStream);

        stream.on('end', async () => {
          try {
            await this.mailProducer.enqueueInbound({
              id,
              rawFilePath,
              from: session.envelope.mailFrom ? session.envelope.mailFrom.address : '',
              to: session.envelope.rcptTo.map((rcpt) => rcpt.address),
              clientIp: session.remoteAddress,
            });
            callback(null, '250 2.0.0 OK: Message queued');
          } catch (err) {
            this.logger.error(`Enqueue failed: ${err.message}`);
            callback(new Error('451 4.3.0 Local queue failure'));
          }
        });

        stream.on('error', (err) => {
          this.logger.error(`Stream error: ${err.message}`);
          callback(new Error('451 4.4.2 Stream transfer aborted'));
        });
      },
    });

    const port = Number(process.env.SMTP_PORT) || 2525;
    this.server.listen(port, () => {
      this.logger.log(`SMTP Ingestion Engine listening on port ${port}`);
    });
  }

  async onApplicationShutdown() {
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}
```

---

### 4.2. BullMQ Producer (`inbound-mail.producer.ts`)
메타데이터만 큐에 넣어 Redis 메모리 누수를 방지합니다.

```typescript
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

export interface InboundMailJobData {
  id: string;
  rawFilePath: string;
  from: string;
  to: string[];
  clientIp: string;
}

@Injectable()
export class InboundMailProducer {
  constructor(@InjectQueue('mail-inbound') private readonly queue: Queue) {}

  async enqueueInbound(data: InboundMailJobData) {
    await this.queue.add('process-mail', data, {
      jobId: data.id,
      removeOnComplete: true,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    });
  }
}
```

---

### 4.3. Piscina Worker Thread Service (`worker-pool.service.ts`)
MIME 파싱 및 서명 검증 같은 CPU 바운드 작업을 워커 풀로 위임합니다.

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Piscina from 'piscina';
import { resolve } from 'path';

@Injectable()
export class WorkerPoolService implements OnModuleInit, OnModuleDestroy {
  private pool: Piscina;

  onModuleInit() {
    this.pool = new Piscina({
      filename: resolve(__dirname, 'mail-parser.worker.js'),
      minThreads: 2,
      maxThreads: 4, // 서버 vCPU 수에 맞게 조정
      idleTimeout: 30000,
    });
  }

  async parseMail(filePath: string): Promise<any> {
    return this.pool.run({ filePath });
  }

  async onModuleDestroy() {
    await this.pool.destroy();
  }
}
```

#### 워커 스크립트 (`mail-parser.worker.ts`)
```typescript
import { createReadStream } from 'fs';
import { simpleParser } from 'mailparser';

module.exports = async ({ filePath }: { filePath: string }) => {
  const stream = createReadStream(filePath);
  const parsed = await simpleParser(stream);

  return {
    subject: parsed.subject,
    messageId: parsed.messageId,
    text: parsed.text,
    html: parsed.html,
    attachments: (parsed.attachments || []).map((att) => ({
      filename: att.filename,
      contentType: att.contentType,
      size: att.size,
    })),
  };
};
```

---

### 4.4. BullMQ Processor & TypeORM 저장 (`inbound-mail.processor.ts`)

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MailMessage, MailStatus, Direction } from '../database/entities/mail-message.entity';
import { MailRecipient, RecipientType } from '../database/entities/mail-recipient.entity';
import { WorkerPoolService } from '../worker-pool/worker-pool.service';
import { InboundMailJobData } from './inbound-mail.producer';

@Processor('mail-inbound')
export class InboundMailProcessor extends WorkerHost {
  constructor(
    private readonly workerPool: WorkerPoolService,
    @InjectRepository(MailMessage) private readonly mailRepo: Repository<MailMessage>,
    @InjectRepository(MailRecipient) private readonly recipientRepo: Repository<MailRecipient>,
  ) {
    super();
  }

  async process(job: Job<InboundMailJobData>): Promise<void> {
    const { id, rawFilePath, from, to } = job.data;

    // 1. Worker Thread에서 무거운 MIME 파싱 수행
    const parsedData = await this.workerPool.parseMail(rawFilePath);

    // 2. MySQL 트랜잭션으로 엔티티 영속화
    const message = this.mailRepo.create({
      id,
      direction: Direction.INBOUND,
      messageId: parsedData.messageId,
      sender: from,
      subject: parsedData.subject,
      rawFilePath,
      status: MailStatus.PROCESSED,
    });
    await this.mailRepo.save(message);

    const recipients = to.map((addr) =>
      this.recipientRepo.create({
        message,
        type: RecipientType.TO,
        address: addr,
      }),
    );
    await this.recipientRepo.save(recipients);
  }
}
```

---

## 5. 설치 및 실행 가이드

### 5.1. 의존성 설치
```bash
npm install @nestjs/typeorm typeorm mysql2
npm install @nestjs/bullmq bullmq ioredis
npm install smtp-server mailparser piscina
npm install -D @types/smtp-server @types/mailparser
```

### 5.2. 환경 변수 설정 (`.env`)
```env
SMTP_PORT=2525
MAIL_SPOOL_DIR=/tmp/mail-spool

DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=secret
DB_DATABASE=smtp_mail

REDIS_HOST=localhost
REDIS_PORT=6379
```

---

## 6. 프로덕션 배포 체크리스트

1. **Slowloris DoS 방어**: `smtp-server`의 `socketTimeout` 및 `closeTimeout`을 기본 30초 이하로 강제.
2. **Reverse Proxy & Client IP**: HAProxy 또는 Nginx Stream 뒤에 배치 시 `useProxy: true` 옵션 활성화(PROXY Protocol v1/v2).
3. **디스크 I/O 최적화**: 스풀 디렉토리(`/tmp/mail-spool`)는 고속 NVMe 또는 RAM 디스크(tmpfs)를 마운트하여 수신 병목 최소화.
4. **Open Relay 차단**: 아웃바운드 릴레이가 필요할 경우 인증(`onAuth`)이 통과된 세션에 한해서만 외부 도메인 발신 허용.