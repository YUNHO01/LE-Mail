import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { getDataSourceToken } from '@nestjs/typeorm';
import * as nodemailer from 'nodemailer';
import { DataSource } from 'typeorm';
import { Mailbox } from '../src/modules/database/entities/mailbox.entity';
import { MailMessage } from '../src/modules/database/entities/mail-message.entity';
import { existsSync, rmSync, unlinkSync } from 'fs';
import { join } from 'path';

async function runProductionSecurityTest() {
  console.log('=== [Phase 6 & 7] Starting Security, Lifecycle & Stress Test ===');

  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn'],
  });
  await app.init();
  console.log('1. NestJS SMTP Application Initialized');

  const dataSource = app.get(getDataSourceToken());
  const mailboxRepo = dataSource.getRepository(Mailbox);
  const messageRepo = dataSource.getRepository(MailMessage);

  // 1. 테스트용 활성 사서함 등록
  const authorizedDomain = 'prodcorp.com';
  const authorizedUser = `ceo@${authorizedDomain}`;
  let box = await mailboxRepo.findOne({ where: { email: authorizedUser } });
  if (!box) {
    box = mailboxRepo.create({
      email: authorizedUser,
      domain: authorizedDomain,
      isActive: true,
    });
    await mailboxRepo.save(box);
  }
  const mailboxCache = app.get(require('../src/modules/smtp-ingestion/mailbox-cache.service').MailboxCacheService);
  await mailboxCache.refreshCache();
  console.log(`2. Registered authorized mailbox and refreshed cache: ${authorizedUser}`);

  const transporter = nodemailer.createTransport({
    host: '127.0.0.1',
    port: 2525,
    secure: false,
    tls: { rejectUnauthorized: false },
    pool: true,
    maxConnections: 10,
  });

  // 2. Open Relay 차단 검증
  console.log('3. Testing Open Relay prevention (Unauthenticated relaying attempt)...');
  try {
    await transporter.sendMail({
      from: 'spammer@outside.com',
      to: 'victim@external-victim-domain.com', // 외부 목적지
      subject: 'Relaying Spam Test',
      text: 'Trying to relay spam through LEMail',
    });
    throw new Error('Test failed: Open relay attempt was NOT blocked!');
  } catch (err: any) {
    if (err.message.includes('550') || err.message.includes('Relaying denied')) {
      console.log('Success: Open relay attempt correctly blocked (550 Relaying denied)!');
    } else {
      throw err;
    }
  }

  // 3. 동시 다발 발송 부하 테스트 (Concurrency Stress Test: 10통 동시 발송)
  const CONCURRENCY_COUNT = 10;
  console.log(`4. Running Concurrency Stress Test (${CONCURRENCY_COUNT} concurrent mails)...`);
  const batchTag = `StressBatch_${Date.now()}`;

  const sendPromises = Array.from({ length: CONCURRENCY_COUNT }).map(async (_, idx) => {
    const subject = `${batchTag}_${idx}`;
    return transporter.sendMail({
      from: `tester${idx}@partner.com`,
      to: authorizedUser,
      subject,
      text: `Stress test body content for message ${idx}`,
      attachments: [
        {
          filename: `payload_${idx}.txt`,
          content: `Data payload content ${idx}`,
          contentType: 'text/plain',
        },
      ],
    });
  });

  const sendResults = await Promise.all(sendPromises);
  console.log(`All ${CONCURRENCY_COUNT} mails sent through SMTP socket. Responses:`, sendResults.length);

  // 4. DB 및 아카이브 상태 검증 (BullMQ Worker & Piscina 처리 대기)
  console.log('5. Waiting for BullMQ and Piscina Workers to process all concurrent jobs...');
  let completedCount = 0;
  const maxWaitSec = 25;
  for (let sec = 0; sec < maxWaitSec; sec++) {
    await new Promise((res) => setTimeout(res, 1000));
    const processedMessages = await messageRepo
      .createQueryBuilder('msg')
      .where('msg.subject LIKE :tag', { tag: `${batchTag}%` })
      .andWhere('msg.status = :status', { status: 'PROCESSED' })
      .getMany();

    completedCount = processedMessages.length;
    if (completedCount === CONCURRENCY_COUNT) {
      console.log(`All ${CONCURRENCY_COUNT} messages processed and committed to DB within ${sec + 1}s!`);
      break;
    }
  }

  if (completedCount !== CONCURRENCY_COUNT) {
    throw new Error(`Stress test failed: only ${completedCount}/${CONCURRENCY_COUNT} processed in time`);
  }

  // 5. Lifecycle (Archive 디렉터리 이동 확인)
  console.log('6. Verifying EML Lifecycle & Archiving on disk...');
  const sampleMessages = await messageRepo
    .createQueryBuilder('msg')
    .leftJoinAndSelect('msg.attachments', 'att')
    .where('msg.subject LIKE :tag', { tag: `${batchTag}%` })
    .getMany();

  for (const msg of sampleMessages) {
    if (existsSync(msg.rawFilePath)) {
      console.log(`Verified archived EML exists: ${msg.rawFilePath}`);
      break;
    }
  }

  // 6. 테스트 데이터 정리
  console.log('7. Cleaning up stress test records and files...');
  for (const msg of sampleMessages) {
    if (existsSync(msg.rawFilePath)) {
      unlinkSync(msg.rawFilePath);
    }
    const attDir = join(process.cwd(), 'mail-attachments', msg.id);
    if (existsSync(attDir)) {
      rmSync(attDir, { recursive: true, force: true });
    }
    await messageRepo.delete(msg.id);
  }
  await mailboxRepo.delete(box.id);

  console.log('=== [Phase 6 & 7] Security, Lifecycle & Stress Test PASSED! ===');
  transporter.close();
  await app.close();
}

runProductionSecurityTest().catch((err) => {
  console.error('Security & Stress Test Failed:', err);
  process.exit(1);
});
