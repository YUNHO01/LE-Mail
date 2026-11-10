import { RblCheckService } from '../src/modules/smtp-ingestion/rbl-check.service';
import parseMailWorker from '../src/modules/worker-pool/mail-parser.worker';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';

async function runTests() {
  console.log('=== [LEMail Phase 1 Spam Defense Unit Tests] ===\n');

  // 1. RblCheckService Test
  console.log('1. Testing RblCheckService...');
  const fakeConfigService: any = {
    get: (key: string) => {
      if (key === 'smtp.rblEnabled') return true;
      if (key === 'smtp.rblServers') return 'zen.spamhaus.org,spamlist.or.kr';
      return null;
    },
  };

  const rblService = new RblCheckService(fakeConfigService);

  // Private/Loopback IP check
  const loopbackCheck = rblService.isPrivateOrLoopbackIp('127.0.0.1');
  const privateCheck1 = rblService.isPrivateOrLoopbackIp('192.168.0.100');
  const privateCheck2 = rblService.isPrivateOrLoopbackIp('10.20.30.40');
  const publicCheck = rblService.isPrivateOrLoopbackIp('8.8.8.8');

  console.log(' - isPrivateOrLoopback(127.0.0.1):', loopbackCheck, '(expected true)');
  console.log(' - isPrivateOrLoopback(192.168.0.100):', privateCheck1, '(expected true)');
  console.log(' - isPrivateOrLoopback(10.20.30.40):', privateCheck2, '(expected true)');
  console.log(' - isPrivateOrLoopback(8.8.8.8):', publicCheck, '(expected false)');

  if (!loopbackCheck || !privateCheck1 || !privateCheck2 || publicCheck) {
    throw new Error('RblCheckService IP classification failed');
  }

  const loopbackResult = await rblService.checkIp('127.0.0.1');
  console.log(' - checkIp(127.0.0.1) result isBlocked:', loopbackResult.isBlocked, '(expected false)');
  if (loopbackResult.isBlocked) {
    throw new Error('Loopback IP should never be blocked by RBL');
  }
  console.log(' ✔ RblCheckService passed!\n');

  // 2. MIME Parser & mailauth Integration Test
  console.log('2. Testing WorkerPool Mail Parser & mailauth Integration...');
  const tempEmlPath = join(process.cwd(), 'temp-test-auth.eml');
  const rawEmailContent = [
    'From: "Sender Name" <sender@test-domain.com>',
    'To: "Recipient" <recipient@lineedge.com>',
    'Subject: Test Security Subject',
    'Date: Mon, 10 Nov 2026 09:00:00 +0900',
    'Message-ID: <test-12345@test-domain.com>',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Hello, this is a test email for security authentication.',
  ].join('\r\n');

  writeFileSync(tempEmlPath, rawEmailContent, 'utf8');

  try {
    const parseResult = await parseMailWorker({
      filePath: tempEmlPath,
      clientIp: '127.0.0.1',
      sender: 'sender@test-domain.com',
    });

    console.log(' - Parsed Subject:', parseResult.subject);
    console.log(' - Parsed From:', parseResult.from);
    console.log(' - Parsed SPF Result:', parseResult.spfResult);
    console.log(' - Parsed DKIM Result:', parseResult.dkimResult);
    console.log(' - Parsed DMARC Result:', parseResult.dmarcResult);

    if (parseResult.subject !== 'Test Security Subject') {
      throw new Error('Subject mismatch in parsed email');
    }
    if (parseResult.from !== 'sender@test-domain.com') {
      throw new Error('Sender mismatch in parsed email');
    }
    console.log(' ✔ Mail Parser & mailauth execution passed!\n');
  } finally {
    try {
      unlinkSync(tempEmlPath);
    } catch {}
  }

  console.log('=== All Phase 1 Spam Verification Tests Passed Successfully! ===');
}

runTests().catch((err) => {
  console.error('Test Failed:', err);
  process.exit(1);
});
