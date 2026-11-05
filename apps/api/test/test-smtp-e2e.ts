import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import * as nodemailer from 'nodemailer';
import { DataSource } from 'typeorm';
import { Mailbox } from '../src/modules/database/entities/mailbox.entity';
import { MailMessage } from '../src/modules/database/entities/mail-message.entity';
import { existsSync, rmSync, unlinkSync } from 'fs';
import { join } from 'path';

async function runSmtpE2ETest() {
  console.log('=== [Phase 5] Starting SMTP Ingestion Server E2E Test ===');

  // 1. NestJS 전체 애플리케이션 시작 (SMTP Ingestion Server가 2525 포트에서 listen)
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn'],
  });
  await app.init();
  console.log('1. NestJS Application and SMTP Server initialized');

  const dataSource = app.get(getDataSourceToken());
  const mailboxRepo = dataSource.getRepository(Mailbox);
  const messageRepo = dataSource.getRepository(MailMessage);

  // 2. 테스트용 사서함 등록
  const testEmail = 'validuser@example.com';
  let mailbox = await mailboxRepo.findOne({ where: { email: testEmail } });
  if (!mailbox) {
    mailbox = mailboxRepo.create({
      email: testEmail,
      domain: 'example.com',
      isActive: true,
    });
    await mailboxRepo.save(mailbox);
  }
  const mailboxCache = app.get(require('../src/modules/smtp-ingestion/mailbox-cache.service').MailboxCacheService);
  await mailboxCache.refreshCache();
  console.log(`2. Registered active mailbox and refreshed cache: ${testEmail}`);

  // 3. SMTP Transporter 설정 (로컬 2525 포트)
  const transporter = nodemailer.createTransport({
    host: '127.0.0.1',
    port: 2525,
    secure: false,
    tls: {
      rejectUnauthorized: false,
    },
  });

  // 4. 시나리오 A: 유효하지 않은 수신자로 발송 시 Early Reject (550) 확인
  console.log('3. Testing Early Reject for unknown mailbox...');
  try {
    await transporter.sendMail({
      from: 'attacker@external.com',
      to: 'unknown_nonexistent@example.com',
      subject: 'Should be rejected',
      text: 'This email must be rejected by Early Reject',
    });
    throw new Error('Test failed: Unknown mailbox was NOT rejected!');
  } catch (err: any) {
    if (err.message.includes('550') || err.responseCode === 550) {
      console.log('Success: Unknown mailbox was correctly rejected with 550!');
    } else {
      throw err;
    }
  }

  // 5. 시나리오 B: 정상 수신자에게 첨부파일이 포함된 메일 발송
  console.log('4. Testing Valid Mail transmission with attachment...');
  const testSubject = `SMTP E2E Test Message ${Date.now()}`;
  const sendResult = await transporter.sendMail({
    from: 'sender@client.com',
    to: testEmail,
    subject: testSubject,
    text: 'This email is transmitted via SMTP TCP socket and processed by BullMQ & Piscina.',
    attachments: [
      {
        filename: 'contract.pdf',
        content: 'Dummy PDF Content for SMTP Test',
        contentType: 'application/pdf',
      },
    ],
  });

  console.log('SMTP Server accepted message:', sendResult.response);

  // 6. DB에 최종적으로 도달하여 PROCESSED 처리되었는지 폴링 확인
  console.log('5. Verifying DB persistence through BullMQ & WorkerPool...');
  let savedMsg: MailMessage | null = null;
  const maxRetries = 15;
  for (let i = 0; i < maxRetries; i++) {
    await new Promise((res) => setTimeout(res, 1000));
    savedMsg = await messageRepo.findOne({
      where: { subject: testSubject },
      relations: { recipients: true, attachments: true },
    });
    if (savedMsg && savedMsg.status === 'PROCESSED') {
      break;
    }
  }

  if (!savedMsg || savedMsg.status !== 'PROCESSED') {
    throw new Error('Message processing failed or timed out in database');
  }

  console.log('Verified persisted message:');
  console.log('- Message ID:', savedMsg.id);
  console.log('- Sender:', savedMsg.sender);
  console.log('- Subject:', savedMsg.subject);
  console.log('- Recipients:', savedMsg.recipients.map((r) => `${r.type}: ${r.address}`));
  console.log(
    '- Attachments:',
    savedMsg.attachments.map(
      (a) => `${a.filename} (${a.sizeBytes} bytes, path: ${a.storagePath})`,
    ),
  );

  // 첨부파일 실물 확인
  if (savedMsg.attachments.length > 0) {
    const attPath = savedMsg.attachments[0].storagePath;
    if (existsSync(attPath)) {
      console.log('Verified attachment exists on filesystem:', attPath);
    }
  }

  // 7. 테스트 데이터 정리
  console.log('6. Cleaning up test data...');
  const messageId = savedMsg.id;
  const rawPath = savedMsg.rawFilePath;

  await messageRepo.delete(messageId);
  await mailboxRepo.delete(mailbox.id);

  if (existsSync(rawPath)) {
    unlinkSync(rawPath);
  }
  const attDir = join(process.cwd(), 'mail-attachments', messageId);
  if (existsSync(attDir)) {
    rmSync(attDir, { recursive: true, force: true });
  }

  console.log('=== [Phase 5] SMTP Ingestion Server E2E Test PASSED! ===');
  transporter.close();
  await app.close();
}

runSmtpE2ETest().catch((err) => {
  console.error('SMTP E2E Test Failed:', err);
  process.exit(1);
});
