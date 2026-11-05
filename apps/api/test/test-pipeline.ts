import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { InboundMailProducer } from '../src/modules/queue/inbound-mail.producer';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { MailMessage } from '../src/modules/database/entities/mail-message.entity';
import { MailRecipient } from '../src/modules/database/entities/mail-recipient.entity';
import { MailAttachment } from '../src/modules/database/entities/mail-attachment.entity';
import { writeFileSync, mkdirSync, existsSync, unlinkSync, rmSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

// MIME 포맷의 실제 EML 데이터 생성 (첨부파일 포함)
function generateSampleEml(boundary: string): string {
  return [
    'From: "Sender Name" <sender@external.com>',
    'To: <receiver1@mycompany.com>, <receiver2@mycompany.com>',
    'Cc: <manager@mycompany.com>',
    'Subject: BullMQ and Piscina Integration Test Mail',
    'Date: Thu, 05 Nov 2026 15:50:00 +0900',
    'Message-ID: <test-msg-12345@external.com>',
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    'Hello, this is a test email processed by NestJS, BullMQ, and Piscina!',
    '',
    `--${boundary}`,
    'Content-Type: text/plain; name="test_attachment.txt"',
    'Content-Disposition: attachment; filename="test_attachment.txt"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from('Hello attachment content inside email!').toString('base64'),
    '',
    `--${boundary}--`,
  ].join('\r\n');
}

async function runPipelineTest() {
  console.log('--- Starting Pipeline Test (Phase 3 & 4) ---');

  const spoolDir = join(process.cwd(), 'mail-spool');
  if (!existsSync(spoolDir)) {
    mkdirSync(spoolDir, { recursive: true });
  }

  const testId = randomUUID();
  const testEmlPath = join(spoolDir, `${testId}.eml`);
  const boundary = '----=_Part_0_123456789.987654321';
  writeFileSync(testEmlPath, generateSampleEml(boundary));
  console.log(`1. Created test EML file: ${testEmlPath}`);

  // NestJS 컨텍스트 실행
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  const producer = app.get(InboundMailProducer);
  const dataSource = app.get(getDataSourceToken());

  console.log('2. Enqueuing test mail job to BullMQ...');
  await producer.enqueueInbound({
    id: testId,
    rawFilePath: testEmlPath,
    from: 'sender@external.com',
    to: ['receiver1@mycompany.com', 'receiver2@mycompany.com'],
    clientIp: '127.0.0.1',
  });

  console.log('3. Waiting for BullMQ processor to consume and complete job...');
  let processed = false;
  const maxWait = 15; // 최대 15초 대기
  for (let i = 0; i < maxWait; i++) {
    await new Promise((res) => setTimeout(res, 1000));
    const msg = await dataSource.getRepository(MailMessage).findOne({
      where: { id: testId },
      relations: { recipients: true, attachments: true },
    });
    if (msg && msg.status === 'PROCESSED') {
      console.log('Job processed successfully by Worker!');
      console.log('MailMessage:', {
        id: msg.id,
        subject: msg.subject,
        sender: msg.sender,
        status: msg.status,
      });
      console.log('Recipients:', msg.recipients.map((r) => `${r.type}: ${r.address}`));
      console.log('Attachments:', msg.attachments.map((a) => `${a.filename} (${a.sizeBytes} bytes, path: ${a.storagePath})`));

      if (msg.attachments.length > 0) {
        const attFile = msg.attachments[0].storagePath;
        if (existsSync(attFile)) {
          console.log(`Verified attachment file exists on disk: ${attFile}`);
        }
      }

      processed = true;
      break;
    }
  }

  if (!processed) {
    throw new Error('Pipeline test timed out waiting for job completion');
  }

  console.log('4. Cleaning up test data...');
  await dataSource.getRepository(MailMessage).delete(testId);
  if (existsSync(testEmlPath)) {
    unlinkSync(testEmlPath);
  }
  const attDir = join(process.cwd(), 'mail-attachments', testId);
  if (existsSync(attDir)) {
    rmSync(attDir, { recursive: true, force: true });
  }

  console.log('--- Pipeline Test (Phase 3 & 4) PASSED Successfully! ---');
  await app.close();
}

runPipelineTest().catch((err) => {
  console.error('Pipeline test failed:', err);
  process.exit(1);
});
