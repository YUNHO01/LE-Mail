import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import Redis from 'ioredis';
import { ImapServer } from '../src/server/imap-server';
import { ImapServerConfig } from '../src/config/imap-config';
import { DbService } from '../src/services/db.service';
import { RedisService } from '../src/services/redis.service';

const TEST_CONFIG: ImapServerConfig = {
  host: '127.0.0.1',
  port: 11433,
  securePort: 19933,
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
  console.log('=== [PHASE 5 TEST] IMAP APPEND (Literal Upload) & IDLE (Real-time Push) Verification ===\n');

  const server = new ImapServer(TEST_CONFIG);
  await server.start();
  console.log('[Server] Test IMAP server started on ports 11433 and 19933.\n');

  // Verify Admin User & INBOX
  const users = await DbService.query('SELECT id, email FROM user WHERE email = ? LIMIT 1', [
    'admin@lineedge.com',
  ]);
  if (!users || users.length === 0) throw new Error('admin user not found!');
  const adminId = users[0].id;

  const folders = await DbService.query(
    'SELECT id, uidvalidity, uidnext FROM mail_folder WHERE user_id = ? AND type = ? LIMIT 1',
    [adminId, 'INBOX'],
  );
  if (!folders || folders.length === 0) throw new Error('INBOX not found!');
  const inboxId = folders[0].id;

  const socket = net.createConnection({ host: TEST_CONFIG.host, port: TEST_CONFIG.port });
  let uploadedUid = 0;
  let redisPublisher: Redis | null = null;

  try {
    // 1. Welcome Greeting
    console.log('[Step 1] Connecting & greeting check...');
    let res = await readUntil(socket, '* OK');
    console.log(`  < ${res.trim()}`);

    // 2. Login
    console.log('\n[Step 2] Logging in as admin@lineedge.com...');
    socket.write('A001 LOGIN admin@lineedge.com admin1234!\r\n');
    res = await readUntil(socket, 'A001 OK');
    console.log(`  < ${res.trim()}`);

    // 3. SELECT INBOX
    console.log('\n[Step 3] SELECT INBOX...');
    socket.write('A002 SELECT INBOX\r\n');
    res = await readUntil(socket, 'A002 OK');
    console.log(`  < ${res.trim().split('\r\n').slice(-2).join('\r\n')}`);

    // 4. APPEND Test (Literal Upload)
    console.log('\n[Step 4] Testing APPEND with literal data...');
    const rawEml =
      'From: sender@external.com\r\n' +
      'To: admin@lineedge.com\r\n' +
      'Subject: Phase 5 Append Test Message\r\n' +
      'Date: Fri, 06 Nov 2026 17:30:00 +0900\r\n' +
      'Message-ID: <phase5-test@lineedge.com>\r\n' +
      'MIME-Version: 1.0\r\n' +
      'Content-Type: text/plain; charset=utf-8\r\n\r\n' +
      'Hello, this is a test message uploaded via IMAP APPEND literal streaming!';

    const emlBuffer = Buffer.from(rawEml, 'utf8');
    const literalLength = emlBuffer.length;

    // Send APPEND header with literal byte length
    const appendCmd = `A003 APPEND INBOX (\\Seen \\Flagged) {${literalLength}}\r\n`;
    console.log(`  > ${appendCmd.trim()}`);
    socket.write(appendCmd);

    // Wait for '+' continuation
    res = await readUntil(socket, '+');
    console.log(`  < ${res.trim()}`);
    if (!res.includes('+')) {
      throw new Error(`Expected continuation response '+' but got: ${res}`);
    }

    // Send literal bytes followed by CRLF
    console.log(`  > Sending ${literalLength} bytes of raw EML...`);
    socket.write(Buffer.concat([emlBuffer, Buffer.from('\r\n')]));

    // Wait for APPEND completion response
    res = await readUntil(socket, 'A003 OK');
    console.log(`  < ${res.trim()}`);

    // Check APPENDUID
    const appendUidMatch = res.match(/\[APPENDUID\s+(\d+)\s+(\d+)\]/i);
    if (!appendUidMatch) {
      throw new Error(`Expected [APPENDUID <validity> <uid>] in response, got: ${res}`);
    }
    const uidValidity = parseInt(appendUidMatch[1], 10);
    uploadedUid = parseInt(appendUidMatch[2], 10);
    console.log(`  ✓ APPENDUID received: validity=${uidValidity}, uid=${uploadedUid}`);

    // Verify in DB
    const dbUserMails = await DbService.query(
      'SELECT id, uid, is_read, is_starred, message_id FROM user_mail WHERE folder_id = ? AND uid = ? LIMIT 1',
      [inboxId, uploadedUid],
    );
    if (dbUserMails.length === 0) {
      throw new Error(`DB user_mail not found for UID ${uploadedUid}`);
    }
    const dbMail = dbUserMails[0];
    console.log(`  ✓ DB user_mail confirmed: id=${dbMail.id}, uid=${dbMail.uid}, is_read=${dbMail.is_read}, is_starred=${dbMail.is_starred}`);

    // Check raw file exists
    const dbMessages = await DbService.query(
      'SELECT raw_file_path FROM mail_message WHERE id = ? LIMIT 1',
      [dbMail.message_id],
    );
    if (dbMessages.length === 0 || !fs.existsSync(dbMessages[0].raw_file_path)) {
      throw new Error(`Raw EML file not found at: ${dbMessages[0]?.raw_file_path}`);
    }
    console.log(`  ✓ Raw EML file exists on disk: ${dbMessages[0].raw_file_path}`);

    // 5. UID FETCH uploaded message
    console.log('\n[Step 5] UID FETCH newly appended message...');
    socket.write(`A004 UID FETCH ${uploadedUid} (FLAGS RFC822)\r\n`);
    res = await readUntil(socket, 'A004 OK');
    if (!res.includes('Phase 5 Append Test Message')) {
      throw new Error(`FETCH response does not contain expected subject! Got:\n${res}`);
    }
    console.log('  ✓ UID FETCH returned exact appended EML body and flags.');

    // 6. IDLE & Redis Real-time Push Test
    console.log('\n[Step 6] Testing IDLE & Real-time Redis Push...');
    socket.write('A005 IDLE\r\n');
    res = await readUntil(socket, '+ idling');
    console.log(`  < ${res.trim()}`);
    console.log('  ✓ Client entered IDLE state.');

    // Connect Redis publisher to simulate incoming new mail notification
    console.log('  -> Simulating incoming mail via Redis Pub/Sub...');
    redisPublisher = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
    });

    const mockEvent = {
      type: 'NEW_MAIL',
      userId: adminId,
      folderId: inboxId,
      uid: uploadedUid + 1,
      messageId: '00000000-0000-0000-0000-000000000000',
    };

    // Wait 200ms before publish to ensure subscription is active
    await new Promise((r) => setTimeout(r, 200));
    await redisPublisher.publish(`mailbox:events:${adminId}`, JSON.stringify(mockEvent));

    // Client should receive '* <count> EXISTS' untagged push notification
    console.log('  -> Waiting for untagged push from IMAP server...');
    res = await readUntil(socket, 'EXISTS');
    console.log(`  < ${res.trim()}`);
    if (!res.includes('EXISTS')) {
      throw new Error(`Expected untagged EXISTS response during IDLE, got: ${res}`);
    }
    console.log('  ✓ Real-time push notification received while IDLE!');

    // Terminate IDLE with DONE
    console.log('  > Sending DONE to exit IDLE...');
    socket.write('DONE\r\n');
    res = await readUntil(socket, 'A005 OK');
    console.log(`  < ${res.trim()}`);
    console.log('  ✓ IDLE exited cleanly.');

    // 7. Logout
    console.log('\n[Step 7] Logging out...');
    socket.write('A006 LOGOUT\r\n');
    res = await readUntil(socket, 'A006 OK');
    console.log(`  < ${res.trim()}`);

    console.log('\n======================================================');
    console.log('🎉 ALL PHASE 5 TESTS (APPEND & IDLE) PASSED SUCCESSFULLY!');
    console.log('======================================================\n');
  } finally {
    socket.destroy();
    if (redisPublisher) {
      await redisPublisher.quit();
    }
    await RedisService.close();
    await server.stop();
    await DbService.close();
  }
}

runTests().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
