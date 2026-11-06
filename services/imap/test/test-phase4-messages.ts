import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { ImapServer } from '../src/server/imap-server';
import { ImapServerConfig } from '../src/config/imap-config';
import { DbService } from '../src/services/db.service';

const TEST_CONFIG: ImapServerConfig = {
  host: '127.0.0.1',
  port: 11432,
  securePort: 19932,
  enableStartTls: true,
  maxConnections: 50,
  authTimeoutMs: 15000,
  archiveDir: './mail-archive',
};

function readUntil(socket: net.Socket, expectedMatch: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let accumulated = '';
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting for '${expectedMatch}'. Received so far: ${accumulated}`));
    }, 8000);

    const onData = (chunk: Buffer) => {
      accumulated += chunk.toString('utf8');
      if (accumulated.includes(expectedMatch)) {
        cleanup();
        resolve(accumulated);
      }
    };

    const onError = (err: any) => {
      cleanup();
      reject(err);
    };

    const cleanup = () => {
      clearTimeout(timeout);
      socket.removeListener('data', onData);
      socket.removeListener('error', onError);
    };

    socket.on('data', onData);
    socket.on('error', onError);
  });
}

async function runTests() {
  console.log('=== [PHASE 4 TEST] IMAP Message Fetching & Flag Control Verification ===\n');

  const server = new ImapServer(TEST_CONFIG);
  await server.start();
  console.log('[Server] Test IMAP server started on ports 11432 and 19932.\n');

  // Prepare test data in database and archive
  console.log('[Setup] Creating test messages and raw EML files...');
  const users = await DbService.query('SELECT id, email FROM user WHERE email = ? LIMIT 1', [
    'admin@lineedge.com',
  ]);
  if (!users || users.length === 0) throw new Error('admin user not found!');
  const adminId = users[0].id;

  const folders = await DbService.query(
    'SELECT id, uidnext FROM mail_folder WHERE user_id = ? AND type = ? LIMIT 1',
    [adminId, 'INBOX'],
  );
  if (!folders || folders.length === 0) throw new Error('INBOX not found!');
  const inboxId = folders[0].id;

  const archiveDir = path.resolve(process.cwd(), './mail-archive/test-phase4');
  if (!fs.existsSync(archiveDir)) {
    fs.mkdirSync(archiveDir, { recursive: true });
  }

  const msgId1 = randomUUID();
  const emlPath1 = path.join(archiveDir, `${msgId1}.eml`);
  const rawEml1 = `From: "Alice Smith" <alice@lineedge.com>\r\nTo: "Admin" <admin@lineedge.com>\r\nSubject: Phase 4 Test Mail 1\r\nMessage-ID: <${msgId1}@test.local>\r\nDate: Fri, 06 Nov 2026 17:00:00 +0900\r\n\r\nHello Admin, this is test email number 1.\r\n`;
  fs.writeFileSync(emlPath1, rawEml1, 'utf8');

  const msgId2 = randomUUID();
  const emlPath2 = path.join(archiveDir, `${msgId2}.eml`);
  const rawEml2 = `From: "Bob Jones" <bob@lineedge.com>\r\nTo: "Admin" <admin@lineedge.com>\r\nSubject: Phase 4 Test Mail 2\r\nMessage-ID: <${msgId2}@test.local>\r\nDate: Fri, 06 Nov 2026 17:05:00 +0900\r\n\r\nHello Admin, this is test email number 2.\r\n`;
  fs.writeFileSync(emlPath2, rawEml2, 'utf8');

  // Insert into mail_message
  await DbService.query(
    `INSERT INTO mail_message (id, direction, message_id, sender, subject, raw_file_path, status, created_at)
     VALUES (?, 'INBOUND', ?, 'alice@lineedge.com', 'Phase 4 Test Mail 1', ?, 'PROCESSED', NOW())`,
    [msgId1, `<${msgId1}@test.local>`, emlPath1],
  );
  await DbService.query(
    `INSERT INTO mail_message (id, direction, message_id, sender, subject, raw_file_path, status, created_at)
     VALUES (?, 'INBOUND', ?, 'bob@lineedge.com', 'Phase 4 Test Mail 2', ?, 'PROCESSED', NOW())`,
    [msgId2, `<${msgId2}@test.local>`, emlPath2],
  );

  // Allocate UIDs
  const startUid = folders[0].uidnext || 1;
  const uid1 = startUid;
  const uid2 = startUid + 1;
  await DbService.query('UPDATE mail_folder SET uidnext = ? WHERE id = ?', [uid2 + 1, inboxId]);

  const umId1 = randomUUID();
  const umId2 = randomUUID();
  await DbService.query(
    `INSERT INTO user_mail (id, user_id, folder_id, message_id, uid, is_read, is_starred, is_deleted, is_answered, is_draft, created_at)
     VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 0, NOW())`,
    [umId1, adminId, inboxId, msgId1, uid1],
  );
  await DbService.query(
    `INSERT INTO user_mail (id, user_id, folder_id, message_id, uid, is_read, is_starred, is_deleted, is_answered, is_draft, created_at)
     VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 0, NOW())`,
    [umId2, adminId, inboxId, msgId2, uid2],
  );

  console.log(`  Inserted Mail 1 (UID: ${uid1}) and Mail 2 (UID: ${uid2}) into INBOX.\n`);

  try {
    const client = net.createConnection({ host: '127.0.0.1', port: 11432 });
    await readUntil(client, '\r\n');

    // 1. Login & SELECT INBOX
    console.log('[1] Logging in & SELECT INBOX...');
    client.write('A001 LOGIN admin@lineedge.com admin1234!\r\n');
    await readUntil(client, 'A001 OK');

    client.write('A002 SELECT INBOX\r\n');
    const selectResp = await readUntil(client, 'A002 OK');
    console.log(`  SELECT response received: ${selectResp.split('\r\n')[0]}`);
    console.log('  -> [PASS] INBOX selected successfully.\n');

    // 2. Test FETCH Metadata (FLAGS, UID, RFC822.SIZE, ENVELOPE)
    console.log('[2] Testing FETCH Metadata (FLAGS, UID, RFC822.SIZE, ENVELOPE)...');
    client.write(`A003 FETCH 1:* (FLAGS UID RFC822.SIZE ENVELOPE)\r\n`);
    const fetchResp = await readUntil(client, 'A003 OK');
    console.log(`  FETCH response received (first 2 lines):\n    ${fetchResp.split('\r\n').slice(0, 2).join('\n    ')}`);
    if (!fetchResp.includes('RFC822.SIZE') || !fetchResp.includes('ENVELOPE') || !fetchResp.includes(`UID ${uid1}`)) {
      throw new Error(`FETCH metadata verification failed: ${fetchResp}`);
    }
    console.log('  -> [PASS] FETCH metadata correctly parsed and formatted.\n');

    // 3. Test UID FETCH EML Body Streaming (BODY.PEEK[] and BODY[])
    console.log('[3] Testing UID FETCH Body Streaming (BODY.PEEK[] & BODY[])...');
    client.write(`A004 UID FETCH ${uid1} (BODY.PEEK[])\r\n`);
    const peekResp = await readUntil(client, 'A004 OK');
    if (!peekResp.includes('Hello Admin, this is test email number 1')) {
      throw new Error(`BODY.PEEK[] did not return expected body: ${peekResp}`);
    }
    console.log('  BODY.PEEK[] streamed successfully without modifying \\Seen flag.');

    // Verify Mail 1 is still unread
    let checkRead = await DbService.query('SELECT is_read FROM user_mail WHERE id = ?', [umId1]);
    if (Boolean(checkRead[0]?.is_read) !== false) {
      throw new Error('BODY.PEEK[] incorrectly marked message as read!');
    }

    // Now test BODY[] (should mark message as read)
    client.write(`A005 UID FETCH ${uid1} (BODY[])\r\n`);
    await readUntil(client, 'A005 OK');
    checkRead = await DbService.query('SELECT is_read FROM user_mail WHERE id = ?', [umId1]);
    if (Boolean(checkRead[0]?.is_read) !== true) {
      throw new Error('BODY[] failed to mark message as \\Seen!');
    }
    console.log('  BODY[] streamed successfully and auto-marked message as \\Seen.');
    console.log('  -> [PASS] EML streaming and read-flag trigger verified.\n');

    // 4. Test STORE and UID STORE Flags (+FLAGS, -FLAGS)
    console.log('[4] Testing Flag Control (STORE +FLAGS, -FLAGS)...');
    client.write(`A006 UID STORE ${uid1} +FLAGS (\\Flagged)\r\n`);
    const storeResp = await readUntil(client, 'A006 OK');
    console.log(`  STORE response: ${storeResp.trim()}`);
    if (!storeResp.includes('\\Flagged')) {
      throw new Error(`Flag \\Flagged not found in STORE response: ${storeResp}`);
    }

    let checkStarred = await DbService.query('SELECT is_starred FROM user_mail WHERE id = ?', [umId1]);
    if (Boolean(checkStarred[0]?.is_starred) !== true) {
      throw new Error('Database is_starred flag did not update!');
    }
    console.log('  -> [PASS] STORE +FLAGS (\\Flagged) verified in DB.\n');

    // 5. Test SEARCH
    console.log('[5] Testing SEARCH & UID SEARCH...');
    client.write('A007 SEARCH FLAGGED\r\n');
    const searchResp = await readUntil(client, 'A007 OK');
    console.log(`  SEARCH FLAGGED response: ${searchResp.trim()}`);
    if (!searchResp.includes('* SEARCH')) {
      throw new Error(`Invalid SEARCH response: ${searchResp}`);
    }

    client.write('A008 UID SEARCH SUBJECT "Test Mail 2"\r\n');
    const searchSubjectResp = await readUntil(client, 'A008 OK');
    console.log(`  UID SEARCH SUBJECT response: ${searchSubjectResp.trim()}`);
    if (!searchSubjectResp.includes(String(uid2))) {
      throw new Error(`Expected UID ${uid2} in search result: ${searchSubjectResp}`);
    }
    console.log('  -> [PASS] SEARCH commands verified.\n');

    // 6. Test COPY / MOVE to Sent folder
    console.log('[6] Testing UID COPY to Sent folder...');
    client.write(`A009 UID COPY ${uid1} Sent\r\n`);
    const copyResp = await readUntil(client, 'A009 OK');
    console.log(`  UID COPY response: ${copyResp.trim()}`);

    const sentFolder = await DbService.query(
      'SELECT id FROM mail_folder WHERE user_id = ? AND type = "SENT" LIMIT 1',
      [adminId],
    );
    const copiedMails = await DbService.query(
      'SELECT id, uid FROM user_mail WHERE folder_id = ? AND message_id = ?',
      [sentFolder[0].id, msgId1],
    );
    if (!copiedMails || copiedMails.length === 0) {
      throw new Error('Copied mail not found in Sent folder!');
    }
    console.log(`  Mail copied to Sent folder with new UID: ${copiedMails[0].uid}`);
    console.log('  -> [PASS] UID COPY verified.\n');

    // 7. Test EXPUNGE
    console.log('[7] Testing EXPUNGE (Soft delete -> Purge)...');
    // Mark Mail 2 as deleted
    client.write(`A010 UID STORE ${uid2} +FLAGS (\\Deleted)\r\n`);
    await readUntil(client, 'A010 OK');

    client.write('A011 EXPUNGE\r\n');
    const expungeResp = await readUntil(client, 'A011 OK');
    console.log(`  EXPUNGE response: ${expungeResp.trim()}`);
    if (!expungeResp.includes('EXPUNGE')) {
      throw new Error(`EXPUNGE response invalid: ${expungeResp}`);
    }

    const checkExpunged = await DbService.query('SELECT id FROM user_mail WHERE id = ?', [umId2]);
    if (checkExpunged && checkExpunged.length > 0) {
      throw new Error('Mail record still exists after EXPUNGE!');
    }
    console.log('  -> [PASS] EXPUNGE verified and record removed from user_mail.\n');

    client.write('A012 LOGOUT\r\n');
    await readUntil(client, 'A012 OK');
    client.end();

    console.log('=== ALL PHASE 4 TESTS PASSED SUCCESSFULLY! ===');
  } finally {
    // Cleanup test files and records
    if (fs.existsSync(emlPath1)) fs.unlinkSync(emlPath1);
    if (fs.existsSync(emlPath2)) fs.unlinkSync(emlPath2);
    await DbService.query('DELETE FROM user_mail WHERE id IN (?, ?)', [umId1, umId2]);
    await DbService.query('DELETE FROM mail_message WHERE id IN (?, ?)', [msgId1, msgId2]);

    await server.stop();
    await DbService.close();
  }
}

runTests().catch((err) => {
  console.error('\n❌ Phase 4 Test Failed:', err);
  process.exit(1);
});
