import * as net from 'net';
import * as tls from 'tls';
import { ImapServer } from '../src/server/imap-server';
import { ImapServerConfig } from '../src/config/imap-config';
import { DbService } from '../src/services/db.service';

const TEST_CONFIG: ImapServerConfig = {
  host: '127.0.0.1',
  port: 11431,
  securePort: 19931,
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
  console.log('=== [PHASE 3 TEST] IMAP Authentication & Mailbox Management Verification ===\n');

  const server = new ImapServer(TEST_CONFIG);
  await server.start();
  console.log('[Server] Test IMAP server started on ports 11431 (Plain) and 19931 (IMAPS).\n');

  try {
    const client = net.createConnection({ host: '127.0.0.1', port: 11431 });
    await readUntil(client, '\r\n');

    // 1. Test unauthenticated command rejection
    console.log('[1] Testing Unauthenticated Command Guard...');
    client.write('A001 LIST "" "*"\r\n');
    const unauthResp = await readUntil(client, 'A001 NO');
    console.log(`  Received guard response: ${unauthResp.trim()}`);
    if (!unauthResp.includes('A001 NO')) {
      throw new Error(`Expected A001 NO, got: ${unauthResp}`);
    }
    console.log('  -> [PASS] Unauthenticated request correctly rejected.\n');

    // 2. Test invalid login
    console.log('[2] Testing Invalid Credentials...');
    client.write('A002 LOGIN admin@lineedge.com wrongpass\r\n');
    const invalidLoginResp = await readUntil(client, 'A002 NO');
    console.log(`  Received rejection: ${invalidLoginResp.trim()}`);
    if (!invalidLoginResp.includes('AUTHENTICATIONFAILED')) {
      throw new Error(`Expected AUTHENTICATIONFAILED, got: ${invalidLoginResp}`);
    }
    console.log('  -> [PASS] Invalid password rejected.\n');

    // 3. Test valid login
    console.log('[3] Testing Valid LOGIN...');
    client.write('A003 LOGIN admin@lineedge.com admin1234!\r\n');
    const validLoginResp = await readUntil(client, 'A003 OK');
    console.log(`  Received login success: ${validLoginResp.trim()}`);
    if (!validLoginResp.includes('A003 OK')) {
      throw new Error(`Expected A003 OK, got: ${validLoginResp}`);
    }
    console.log('  -> [PASS] User authenticated successfully.\n');

    // 4. Test LIST and LSUB
    console.log('[4] Testing LIST & LSUB Mailboxes...');
    client.write('A004 LIST "" "*"\r\n');
    const listResp = await readUntil(client, 'A004 OK');
    console.log(`  Received Mailbox List:\n    ${listResp.trim().replace(/\r\n/g, '\n    ')}`);
    if (!listResp.includes('"INBOX"') || !listResp.includes('A004 OK')) {
      throw new Error(`LIST response missing INBOX: ${listResp}`);
    }

    client.write('A005 LSUB "" "*"\r\n');
    const lsubResp = await readUntil(client, 'A005 OK');
    if (!lsubResp.includes('A005 OK')) {
      throw new Error(`LSUB failed: ${lsubResp}`);
    }
    console.log('  -> [PASS] LIST and LSUB verified.\n');

    // 5. Test STATUS
    console.log('[5] Testing STATUS Command on INBOX...');
    client.write('A006 STATUS INBOX (MESSAGES RECENT UIDNEXT UIDVALIDITY UNSEEN)\r\n');
    const statusResp = await readUntil(client, 'A006 OK');
    console.log(`  Received STATUS response: ${statusResp.trim()}`);
    if (!statusResp.includes('* STATUS') || !statusResp.includes('UIDVALIDITY')) {
      throw new Error(`Invalid STATUS response: ${statusResp}`);
    }
    console.log('  -> [PASS] STATUS command verified.\n');

    // 6. Test SELECT and EXAMINE
    console.log('[6] Testing SELECT & EXAMINE Mailbox...');
    client.write('A007 SELECT INBOX\r\n');
    const selectResp = await readUntil(client, 'A007 OK');
    console.log(`  Received SELECT response:\n    ${selectResp.trim().replace(/\r\n/g, '\n    ')}`);
    if (!selectResp.includes('EXISTS') || !selectResp.includes('READ-WRITE')) {
      throw new Error(`Invalid SELECT response: ${selectResp}`);
    }

    client.write('A008 EXAMINE Sent\r\n');
    const examineResp = await readUntil(client, 'A008 OK');
    console.log(`  Received EXAMINE response: ${examineResp.trim()}`);
    if (!examineResp.includes('READ-ONLY')) {
      throw new Error(`Invalid EXAMINE response: ${examineResp}`);
    }
    console.log('  -> [PASS] SELECT and EXAMINE verified.\n');

    // 7. Test CREATE, RENAME, DELETE Mailbox
    console.log('[7] Testing Folder Lifecycle (CREATE, RENAME, DELETE)...');
    const customName1 = `TestFolder_${Date.now()}`;
    const customName2 = `${customName1}_Renamed`;

    client.write(`A009 CREATE "${customName1}"\r\n`);
    const createResp = await readUntil(client, 'A009 OK');
    console.log(`  CREATE folder response: ${createResp.trim()}`);

    client.write(`A010 RENAME "${customName1}" "${customName2}"\r\n`);
    const renameResp = await readUntil(client, 'A010 OK');
    console.log(`  RENAME folder response: ${renameResp.trim()}`);

    client.write(`A011 DELETE "${customName2}"\r\n`);
    const deleteResp = await readUntil(client, 'A011 OK');
    console.log(`  DELETE folder response: ${deleteResp.trim()}`);
    console.log('  -> [PASS] CREATE, RENAME, DELETE verified.\n');

    client.write('A012 LOGOUT\r\n');
    await readUntil(client, 'A012 OK');
    client.end();

    // 8. Test AUTHENTICATE PLAIN on direct TLS port (19931)
    console.log('[8] Testing AUTHENTICATE PLAIN over TLS/IMAPS...');
    const tlsClient = tls.connect({
      host: '127.0.0.1',
      port: 19931,
      rejectUnauthorized: false,
    });
    await readUntil(tlsClient, '\r\n');

    // Base64 payload for \0admin@lineedge.com\0admin1234!
    const authPayload = Buffer.from('\0admin@lineedge.com\0admin1234!').toString('base64');
    tlsClient.write(`B001 AUTHENTICATE PLAIN ${authPayload}\r\n`);
    const authResp = await readUntil(tlsClient, 'B001 OK');
    console.log(`  Received AUTHENTICATE response: ${authResp.trim()}`);
    if (!authResp.includes('B001 OK')) {
      throw new Error(`AUTHENTICATE PLAIN failed: ${authResp}`);
    }

    tlsClient.write('B002 LOGOUT\r\n');
    await readUntil(tlsClient, 'B002 OK');
    tlsClient.end();
    console.log('  -> [PASS] AUTHENTICATE PLAIN over TLS verified.\n');

    console.log('=== ALL PHASE 3 TESTS PASSED SUCCESSFULLY! ===');
  } finally {
    await server.stop();
    await DbService.close();
  }
}

runTests().catch((err) => {
  console.error('\n❌ Phase 3 Test Failed:', err);
  process.exit(1);
});
