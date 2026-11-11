import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { MailService } from '../src/modules/mail/mail.service';
import { ContactsImportExportService } from '../src/modules/contacts/contacts-import-export.service';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { User, MailMessage, UserMail, MailFolder, UserRole, Direction } from '../src/modules/database/entities';
import { FolderType } from '@lemail/shared-types';
import { ForbiddenException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { randomUUID } from 'crypto';

async function runSecurityRemediationVerification() {
  console.log('=================================================================');
  console.log('=== [Security Remediation Verification Test (P0/P1/P2 Checks)] ===');
  console.log('=================================================================');

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn'],
  });
  await app.init();
  console.log('[1/4] NestJS Security Context Initialized');

  const dataSource = app.get<DataSource>(getDataSourceToken());
  const userRepo = dataSource.getRepository(User);
  const messageRepo = dataSource.getRepository(MailMessage);
  const userMailRepo = dataSource.getRepository(UserMail);
  const folderRepo = dataSource.getRepository(MailFolder);
  const mailService = app.get(MailService);
  const contactsService = app.get(ContactsImportExportService);

  let userA: User | null = null;
  let userB: User | null = null;
  let testFolder: MailFolder | null = null;
  let testMessage: MailMessage | null = null;
  let testUserMail: UserMail | null = null;

  try {
    // 1. BOLA / IDOR 방어 테스트 (User A의 메일을 User B가 무단 열람 시도)
    console.log('[2/4] Testing BOLA/IDOR prevention in MailService...');
    userA = await userRepo.save(
      userRepo.create({
        email: `victim_${Date.now()}@test.com`,
        name: 'Victim User',
        passwordHash: 'hashedpassword',
        role: UserRole.USER,
      }),
    );

    userB = await userRepo.save(
      userRepo.create({
        email: `attacker_${Date.now()}@test.com`,
        name: 'Attacker User',
        passwordHash: 'hashedpassword',
        role: UserRole.USER,
      }),
    );

    testFolder = await folderRepo.save(
      folderRepo.create({
        userId: userA.id,
        name: 'INBOX',
        type: FolderType.INBOX,
      }),
    );

    testMessage = await messageRepo.save(
      messageRepo.create({
        id: randomUUID(),
        direction: Direction.INBOUND,
        sender: userA.email,
        subject: 'Top Secret Confidential Email',
        rawFilePath: '',
      }),
    );

    testUserMail = await userMailRepo.save(
      userMailRepo.create({
        userId: userA.id,
        folderId: testFolder.id,
        messageId: testMessage.id,
        isRead: false,
      }),
    );

    // User A가 조회 시 정상 조회되어야 함
    const accessByUserA = await mailService.findOne(testMessage.id, userA.id);
    if (!accessByUserA || accessByUserA.subject !== 'Top Secret Confidential Email') {
      throw new Error('Test failed: User A could not access their own email');
    }
    console.log('  ✓ Legitimate owner (User A) successfully accessed their email');

    // User B가 조회 시 ForbiddenException 발생해야 함
    try {
      await mailService.findOne(testMessage.id, userB.id);
      throw new Error('Test FAILED: Attacker (User B) was able to read User A email! BOLA vulnerability exists!');
    } catch (err: any) {
      if (err instanceof ForbiddenException || err.message.includes('접근 권한이 없습니다')) {
        console.log('  ✓ BOLA Protected: Attacker (User B) was blocked with ForbiddenException');
      } else {
        throw err;
      }
    }

    // 2. ExcelJS 안전 파싱 테스트 (Prototype Pollution 공격 벡터 검증)
    console.log('[3/4] Testing ExcelJS parsing & Prototype Pollution protection...');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Contacts');
    sheet.addRow(['이름', '회사', '부서', '직급', '메일']);
    sheet.addRow(['홍길동', '보안연구소', '침해대응팀', '선임', 'hong@security.com']);
    sheet.addRow(['__proto__', 'polluted_val', 'test', 'test', 'polluted@evil.com']);

    const excelBuffer = await workbook.xlsx.writeBuffer();
    const parsed = await contactsService.parseImportFile(Buffer.from(excelBuffer), 'contacts.xlsx');

    if (parsed.length > 0 && ({} as any)['polluted_val'] === undefined) {
      console.log(`  ✓ ExcelJS parsed ${parsed.length} contacts without Prototype Pollution`);
    } else {
      throw new Error('Test failed: Prototype Pollution detected or parse failed');
    }

    // 3. 엑셀 내보내기 테스트
    const exportedBuffer = await contactsService.exportToExcel([
      {
        name: '테스트사용자',
        email: 'test@example.com',
        company: 'LEMail Corp',
      },
    ]);
    if (exportedBuffer && exportedBuffer.length > 0) {
      console.log(`  ✓ ExcelJS successfully generated safe .xlsx binary (${exportedBuffer.length} bytes)`);
    }

    console.log('[4/4] All Security Remediation Regression Tests PASSED!');
    console.log('=================================================================');
  } finally {
    // Clean up test data
    if (testUserMail) await userMailRepo.delete(testUserMail.id).catch(() => {});
    if (testMessage) await messageRepo.delete(testMessage.id).catch(() => {});
    if (testFolder) await folderRepo.delete(testFolder.id).catch(() => {});
    if (userA) await userRepo.delete(userA.id).catch(() => {});
    if (userB) await userRepo.delete(userB.id).catch(() => {});
    await app.close();
  }

  process.exit(0);
}

runSecurityRemediationVerification().catch((err) => {
  console.error('Fatal Security Test Error:', err);
  process.exit(1);
});
