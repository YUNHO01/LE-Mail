import * as net from 'net';
import * as tls from 'tls';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { ImapServer } from '../src/server/imap-server';
import { ImapServerConfig } from '../src/config/imap-config';
import { DbService } from '../src/services/db.service';
import { RedisService } from '../src/services/redis.service';

const TEST_CONFIG: ImapServerConfig = {
  host: '127.0.0.1',
  port: 11434,
  securePort: 19934,
  enableStartTls: true,
  maxConnections: 50,
  authTimeoutMs: 15000,
  archiveDir: './mail-archive',
};

function readUntil(socket: net.Socket | tls.TLSSocket, expectedMatch: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let accumulated = '';
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting for '${expectedMatch}'. Received so far: ${accumulated}`));
    }, 10000);

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

async function runE2ETests() {
  console.log('================================================================');
  console.log('🚀 [PHASE 6] LEMail Comprehensive IMAP E2E Integration Suite');
  console.log('================================================================\n');

  const server = new ImapServer(TEST_CONFIG);
  await server.start();
  console.log('[Server] IMAP server running on ports 11434 (Plain/STARTTLS) and 19934 (IMAPS Direct TLS).\n');

  // Load Admin User
  const users = await DbService.query('SELECT id, email FROM user WHERE email = ? LIMIT 1', [
    'admin@lineedge.com',
  ]);
  if (!users || users.length === 0) throw new Error('admin user not found in DB!');
  const adminId = users[0].id;
  const adminEmail = users[0].email;

  const folders = await DbService.query(
    'SELECT id, uidvalidity, uidnext FROM mail_folder WHERE user_id = ? AND type = ? LIMIT 1',
    [adminId, 'INBOX'],
  );
  if (!folders || folders.length === 0) throw new Error('INBOX not found for admin user!');
  const inboxId = folders[0].id;

  let redisPublisher: Redis | null = null;
  let socket: net.Socket | null = null;
  let tlsSocket: tls.TLSSocket | null = null;

  try {
    // ------------------------------------------------------------------
    // TEST SECTION A: Plain TCP & STARTTLS Upgrade
    // ------------------------------------------------------------------
    console.log('--- [PART 1] Connection, Capability & STARTTLS Handshake ---');
    socket = net.createConnection({ host: TEST_CONFIG.host, port: TEST_CONFIG.port });
    let res = await readUntil(socket, '* OK');
    console.log(`  < Server Greeting: ${res.trim()}`);

    socket.write('T001 CAPABILITY\r\n');
    res = await readUntil(socket, 'T001 OK');
    console.log(`  < Capability: ${res.trim().split('\r\n')[0]}`);

    console.log('  -> Upgrading connection via STARTTLS...');
    socket.write('T002 STARTTLS\r\n');
    res = await readUntil(socket, 'T002 OK');

    const upgradedSocket = tls.connect({
      socket,
      rejectUnauthorized: false,
    });
    await new Promise<void>((resolve, reject) => {
      upgradedSocket.on('secureConnect', () => resolve());
      upgradedSocket.on('error', reject);
    });
    console.log('  ✓ Successfully upgraded to TLS over port 11434!\n');

    // ------------------------------------------------------------------
    // TEST SECTION B: Authentication & Folder Management
    // ------------------------------------------------------------------
    console.log('--- [PART 2] Authentication & Folder Management ---');
    upgradedSocket.write('A001 LOGIN admin@lineedge.com admin1234!\r\n');
    res = await readUntil(upgradedSocket, 'A001 OK');
    console.log(`  < ${res.trim()}`);

    // LIST Folders
    upgradedSocket.write('A002 LIST "" "*"\r\n');
    res = await readUntil(upgradedSocket, 'A002 OK');
    console.log('  ✓ Folders listed successfully.');

    // CREATE, RENAME, DELETE Custom Mailbox
    console.log('  -> Creating mailbox "Projects"...');
    upgradedSocket.write('A003 CREATE "Projects"\r\n');
    res = await readUntil(upgradedSocket, 'A003 OK');

    console.log('  -> Renaming "Projects" to "ArchiveProjects"...');
    upgradedSocket.write('A004 RENAME "Projects" "ArchiveProjects"\r\n');
    res = await readUntil(upgradedSocket, 'A004 OK');

    console.log('  -> Deleting "ArchiveProjects"...');
    upgradedSocket.write('A005 DELETE "ArchiveProjects"\r\n');
    res = await readUntil(upgradedSocket, 'A005 OK');
    console.log('  ✓ Folder lifecycle (CREATE -> RENAME -> DELETE) verified.\n');

    // ------------------------------------------------------------------
    // TEST SECTION C: SELECT INBOX & Real-time IDLE Push
    // ------------------------------------------------------------------
    console.log('--- [PART 3] SELECT INBOX & Real-time IDLE Notification ---');
    upgradedSocket.write('B001 SELECT INBOX\r\n');
    res = await readUntil(upgradedSocket, 'B001 OK');
    console.log(`  < ${res.trim().split('\r\n').slice(-1)[0]}`);

    console.log('  -> Entering IDLE state...');
    upgradedSocket.write('B002 IDLE\r\n');
    res = await readUntil(upgradedSocket, '+ idling');
    console.log(`  < ${res.trim()}`);

    // Simulate Inbound Email processing
    console.log('  -> Simulating inbound mail arrival in pipeline...');
    const simulatedMsgId = randomUUID();
    const currentFolder = (await DbService.query('SELECT uidnext FROM mail_folder WHERE id = ?', [inboxId]))[0];
    const assignedUid = currentFolder.uidnext || 1;
    await DbService.query('UPDATE mail_folder SET uidnext = ? WHERE id = ?', [assignedUid + 1, inboxId]);

    const emlFilePath = `mail-archive/simulated-${simulatedMsgId}.eml`;
    fs.writeFileSync(emlFilePath, 'From: test@external.com\r\nTo: admin@lineedge.com\r\nSubject: Realtime Test\r\n\r\nE2E IDLE Body');

    await DbService.query(
      `INSERT INTO mail_message (id, direction, message_id, sender, subject, raw_file_path, status, created_at)
       VALUES (?, 'INBOUND', ?, 'test@external.com', 'Realtime Test', ?, 'PROCESSED', NOW())`,
      [simulatedMsgId, `<${simulatedMsgId}@external.com>`, emlFilePath],
    );
    await DbService.query(
      `INSERT INTO user_mail (id, user_id, folder_id, message_id, uid, is_read, is_starred, is_deleted, created_at)
       VALUES (UUID(), ?, ?, ?, ?, 0, 0, 0, NOW())`,
      [adminId, inboxId, simulatedMsgId, assignedUid],
    );

    // Publish event via Redis
    redisPublisher = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
    });
    await new Promise((r) => setTimeout(r, 200));
    await redisPublisher.publish(
      `mailbox:events:${adminId}`,
      JSON.stringify({
        type: 'NEW_MAIL',
        userId: adminId,
        folderId: inboxId,
        uid: assignedUid,
        messageId: simulatedMsgId,
      }),
    );

    // Expect untagged EXISTS response
    res = await readUntil(upgradedSocket, 'EXISTS');
    console.log(`  < Real-time push received: ${res.trim()}`);

    // Exit IDLE
    upgradedSocket.write('DONE\r\n');
    res = await readUntil(upgradedSocket, 'B002 OK');
    console.log(`  < ${res.trim()}`);
    console.log('  ✓ IDLE and real-time push verified.\n');

    // ------------------------------------------------------------------
    // TEST SECTION D: FETCH, STORE Flags & EXPUNGE
    // ------------------------------------------------------------------
    console.log('--- [PART 4] Message FETCH, Flag Manipulation & EXPUNGE ---');
    upgradedSocket.write(`C001 UID FETCH ${assignedUid} (FLAGS RFC822)\r\n`);
    res = await readUntil(upgradedSocket, 'C001 OK');
    console.log('  ✓ UID FETCH returned RFC822 body.');

    // Add \Flagged
    upgradedSocket.write(`C002 UID STORE ${assignedUid} +FLAGS (\\Flagged)\r\n`);
    res = await readUntil(upgradedSocket, 'C002 OK');
    console.log(`  < ${res.trim()}`);

    // Mark \Deleted
    upgradedSocket.write(`C003 UID STORE ${assignedUid} +FLAGS (\\Deleted)\r\n`);
    res = await readUntil(upgradedSocket, 'C003 OK');

    // EXPUNGE
    upgradedSocket.write('C004 EXPUNGE\r\n');
    res = await readUntil(upgradedSocket, 'C004 OK');
    console.log(`  < EXPUNGE response: ${res.trim()}`);
    console.log('  ✓ Message lifecycle (FETCH -> STORE -> EXPUNGE) verified.\n');

    // Cleanup simulated eml
    if (fs.existsSync(emlFilePath)) fs.unlinkSync(emlFilePath);

    // Logout connection 1
    upgradedSocket.write('C005 LOGOUT\r\n');
    await readUntil(upgradedSocket, 'C005 OK');
    upgradedSocket.destroy();

    // ------------------------------------------------------------------
    // TEST SECTION E: Direct TLS (IMAPS on port 19934) & APPEND Upload
    // ------------------------------------------------------------------
    console.log('--- [PART 5] Direct TLS (IMAPS :19934) & APPEND Upload ---');
    tlsSocket = tls.connect({
      host: TEST_CONFIG.host,
      port: TEST_CONFIG.securePort,
      rejectUnauthorized: false,
    });
    res = await readUntil(tlsSocket, '* OK');
    console.log(`  < Direct TLS Greeting: ${res.trim()}`);

    tlsSocket.write('D001 LOGIN admin@lineedge.com admin1234!\r\n');
    res = await readUntil(tlsSocket, 'D001 OK');

    const appendData = 'From: client@apple.com\r\nTo: admin@lineedge.com\r\nSubject: IMAPS Upload\r\n\r\nUploaded over IMAPS SSL';
    const appendBytes = Buffer.from(appendData, 'utf8');

    tlsSocket.write(`D002 APPEND INBOX (\\Seen) {${appendBytes.length}}\r\n`);
    res = await readUntil(tlsSocket, '+');

    tlsSocket.write(Buffer.concat([appendBytes, Buffer.from('\r\n')]));
    res = await readUntil(tlsSocket, 'D002 OK');
    console.log(`  < APPEND response: ${res.trim()}`);
    console.log('  ✓ Direct TLS IMAPS & APPEND literal upload verified.\n');

    tlsSocket.write('D003 LOGOUT\r\n');
    await readUntil(tlsSocket, 'D003 OK');
    tlsSocket.destroy();

    console.log('================================================================');
    console.log('🎉 [PHASE 6 E2E] ALL INTEGRATION TESTS PASSED 100% SUCCESSFULLY!');
    console.log('================================================================\n');
  } finally {
    if (socket) socket.destroy();
    if (tlsSocket) tlsSocket.destroy();
    if (redisPublisher) await redisPublisher.quit();
    await RedisService.close();
    await server.stop();
    await DbService.close();
  }
}

runE2ETests().catch((err) => {
  console.error('\n❌ E2E TEST FAILED:', err);
  process.exit(1);
});
