import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UsersService } from '../src/modules/users/users.service';
import { MailFolderService } from '../src/modules/mail-folder/mail-folder.service';
import { MailService } from '../src/modules/mail/mail.service';
import { User, MailFolder, UserMail, MailMessage } from '../src/modules/database/entities';
import { Direction, FolderType, MailStatus } from '@lemail/shared-types';
import { randomUUID } from 'crypto';

async function runTest() {
  console.log('=== [PHASE 1 TEST] IMAP Database Schema & UID Allocation Verification ===\n');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const dataSource = app.get<DataSource>(getDataSourceToken());
  const usersService = app.get(UsersService);
  const folderService = app.get(MailFolderService);
  const mailService = app.get(MailService);

  const userRepo = dataSource.getRepository(User);
  const folderRepo = dataSource.getRepository(MailFolder);
  const userMailRepo = dataSource.getRepository(UserMail);
  const messageRepo = dataSource.getRepository(MailMessage);

  try {
    // 1. Verify table columns via information_schema
    console.log('[1] Verifying Database Columns for IMAP...');
    const folderColumns: any[] = await dataSource.query(`
      SELECT COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mail_folder' 
      AND COLUMN_NAME IN ('uidvalidity', 'uidnext');
    `);
    console.log('  mail_folder IMAP columns:', folderColumns.map((c) => c.COLUMN_NAME).join(', '));
    if (folderColumns.length < 2) {
      throw new Error('Missing uidvalidity or uidnext in mail_folder table!');
    }

    const userMailColumns: any[] = await dataSource.query(`
      SELECT COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_mail' 
      AND COLUMN_NAME IN ('uid', 'is_deleted', 'is_answered', 'is_draft');
    `);
    console.log('  user_mail IMAP columns:', userMailColumns.map((c) => c.COLUMN_NAME).join(', '));
    if (userMailColumns.length < 4) {
      throw new Error('Missing uid, is_deleted, is_answered, or is_draft in user_mail table!');
    }
    console.log('  -> [PASS] Schema columns verified.\n');

    // 2. Create test user and verify folder initialization
    console.log('[2] Creating Test User & Verifying Default Folder UID Parameters...');
    const testEmail = `imap_phase1_${Date.now()}@lineedge.com`;
    const user = await usersService.create({
      email: testEmail,
      name: 'IMAP Phase1 Tester',
      password: 'password123!',
    });
    console.log(`  Created test user: ${user.email} (ID: ${user.id})`);

    const userFolders = await folderRepo.find({ where: { userId: user.id } });
    console.log(`  Initialized ${userFolders.length} default folders.`);
    for (const f of userFolders) {
      if (!f.uidvalidity || f.uidvalidity <= 0) {
        throw new Error(`Folder ${f.name} has invalid uidvalidity: ${f.uidvalidity}`);
      }
      if (f.uidnext !== 1) {
        throw new Error(`Folder ${f.name} has invalid initial uidnext: ${f.uidnext}`);
      }
    }
    console.log('  -> [PASS] Default folders properly initialized with valid uidvalidity and uidnext=1.\n');

    // 3. Test sequential UID allocation in INBOX
    console.log('[3] Testing Monotonic Sequential UID Allocation in INBOX...');
    const inbox = userFolders.find((f) => f.type === FolderType.INBOX);
    if (!inbox) throw new Error('INBOX not found for user!');

    const createdUids: number[] = [];
    for (let i = 1; i <= 3; i++) {
      const msgId = randomUUID();
      const msg = new MailMessage();
      msg.id = msgId;
      msg.direction = Direction.INBOUND as any;
      msg.messageId = `<msg-${i}-${Date.now()}@test.local>`;
      msg.sender = 'sender@example.com';
      msg.subject = `Test Mail #${i}`;
      msg.rawFilePath = `./mail-archive/test-${msgId}.eml`;
      msg.status = MailStatus.PROCESSED as any;
      await messageRepo.save(msg);

      // Allocate UID atomically
      const currentUid = inbox.uidnext || 1;
      inbox.uidnext = currentUid + 1;
      await folderRepo.save(inbox);

      const um = userMailRepo.create({
        userId: user.id,
        folderId: inbox.id,
        messageId: msgId,
        uid: currentUid,
        isRead: false,
        isStarred: false,
        isDeleted: false,
        isAnswered: false,
        isDraft: false,
      });
      await userMailRepo.save(um);
      createdUids.push(currentUid);
      console.log(`  Saved Mail #${i} -> Assigned UID: ${currentUid}, Folder uidnext is now: ${inbox.uidnext}`);
    }

    if (JSON.stringify(createdUids) !== JSON.stringify([1, 2, 3])) {
      throw new Error(`UID sequence mismatch! Expected [1, 2, 3], got: ${JSON.stringify(createdUids)}`);
    }

    const reloadedInbox = await folderRepo.findOne({ where: { id: inbox.id } });
    if (reloadedInbox?.uidnext !== 4) {
      throw new Error(`Expected inbox uidnext to be 4, but found: ${reloadedInbox?.uidnext}`);
    }
    console.log('  -> [PASS] Sequential UIDs (1, 2, 3) and uidnext=4 successfully verified.\n');

    // 4. Test unique constraint on (folder_id, uid)
    console.log('[4] Testing Unique Constraint on (folder_id, uid)...');
    let duplicateRejected = false;
    try {
      const dupMsgId = randomUUID();
      const dupMsg = new MailMessage();
      dupMsg.id = dupMsgId;
      dupMsg.direction = Direction.INBOUND as any;
      dupMsg.sender = 'dup@example.com';
      dupMsg.rawFilePath = './mail-archive/dup.eml';
      dupMsg.status = MailStatus.PROCESSED as any;
      await messageRepo.save(dupMsg);
      // Attempt to save with existing UID = 1 in the same inbox
      await userMailRepo.save(
        userMailRepo.create({
          userId: user.id,
          folderId: inbox.id,
          messageId: dupMsgId,
          uid: 1, // Duplicate!
        }),
      );
    } catch (err: any) {
      duplicateRejected = true;
      console.log(`  Duplicate rejected as expected with error code: ${err.errno || err.code}`);
    }
    if (!duplicateRejected) {
      throw new Error('Unique constraint failed! Duplicate (folder_id, uid) was allowed!');
    }
    console.log('  -> [PASS] Unique constraint idx_folder_uid successfully prevented duplicate.\n');

    // 5. Test Mail Move & UID re-allocation in target folder
    console.log('[5] Testing Mail Move & Target Folder UID Allocation...');
    const trash = userFolders.find((f) => f.type === FolderType.TRASH);
    if (!trash) throw new Error('TRASH folder not found!');

    const inboxMails = await userMailRepo.find({ where: { folderId: inbox.id } });
    const mailToMove = inboxMails[0];

    await mailService.moveMail(user.id, mailToMove.messageId, trash.id);

    const movedMail = await userMailRepo.findOne({
      where: { userId: user.id, messageId: mailToMove.messageId },
    });
    console.log(`  Mail moved to TRASH. New folderId: ${movedMail?.folderId}, New UID: ${movedMail?.uid}`);
    if (movedMail?.folderId !== trash.id || movedMail?.uid !== 1) {
      throw new Error(`Expected moved mail to have UID 1 in TRASH, got: ${movedMail?.uid}`);
    }

    const reloadedTrash = await folderRepo.findOne({ where: { id: trash.id } });
    console.log(`  TRASH uidnext is now: ${reloadedTrash?.uidnext}`);
    if (reloadedTrash?.uidnext !== 2) {
      throw new Error(`Expected TRASH uidnext to be 2, got: ${reloadedTrash?.uidnext}`);
    }
    console.log('  -> [PASS] Move operation correctly re-allocated UID in target folder.\n');

    // 6. Test IMAP Flags
    console.log('[6] Testing IMAP Flags (is_deleted, is_answered, is_draft)...');
    movedMail.isDeleted = true;
    movedMail.isAnswered = true;
    movedMail.isDraft = true;
    await userMailRepo.save(movedMail);

    const checkFlags = await userMailRepo.findOne({ where: { id: movedMail.id } });
    if (!checkFlags?.isDeleted || !checkFlags?.isAnswered || !checkFlags?.isDraft) {
      throw new Error('IMAP flags failed to persist!');
    }
    console.log(`  Flags persisted: isDeleted=${checkFlags.isDeleted}, isAnswered=${checkFlags.isAnswered}, isDraft=${checkFlags.isDraft}`);
    console.log('  -> [PASS] IMAP flag persistence verified.\n');

    // Cleanup test data
    console.log('[7] Cleaning up test data...');
    await userRepo.delete({ id: user.id });
    console.log('  Test user and cascaded records deleted successfully.');

    console.log('\n=== ALL PHASE 1 TESTS PASSED SUCCESSFULLY! ===');
  } finally {
    await app.close();
  }
}

runTest().catch((err) => {
  console.error('\n❌ Phase 1 Test failed:', err);
  process.exit(1);
});
