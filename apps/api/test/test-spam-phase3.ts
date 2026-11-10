import { AttachmentSecurityService } from '../src/modules/spam/attachment-security.service';
import { OutboundRateLimitService } from '../src/modules/spam/outbound-rate-limit.service';
import { DkimSignService } from '../src/modules/spam/dkim-sign.service';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

async function runPhase3Tests() {
  console.log('====================================================');
  console.log('   LEMail Phase 3 Security & Outbound Verification  ');
  console.log('====================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`[FAIL] ${testName} ${detail ? `(${detail})` : ''}`);
    }
  }

  const mockConfigService = {
    get: (key: string) => {
      if (key === 'CLAMAV_ENABLED') return 'false'; // offline test mode
      if (key === 'CLAMAV_PORT') return '3310';
      if (key === 'OUTBOUND_RATE_LIMIT_PER_MINUTE') return '3';
      if (key === 'OUTBOUND_RATE_LIMIT_PER_DAY') return '10';
      return null;
    },
  } as unknown as ConfigService;

  // --------------------------------------------------------------------------
  // TEST 1: Attachment Security - Extension & Obfuscation Analysis
  // --------------------------------------------------------------------------
  console.log('--- 1. Testing Attachment Security (Dangerous, Macro, Double Ext) ---');
  const attService = new AttachmentSecurityService(mockConfigService);

  // 1-1. Clean files
  const cleanExt = attService.checkExtension('invoice_20261110.pdf');
  assert(!cleanExt.isDangerousExt && !cleanExt.isMacro && !cleanExt.isDoubleExt, 'Clean PDF file recognized correctly');

  const cleanJpg = attService.checkExtension('profile_photo.JPG');
  assert(!cleanJpg.isDangerousExt && !cleanJpg.isMacro && !cleanJpg.isDoubleExt, 'Clean JPG file recognized correctly');

  // 1-2. Executable / script high-risk files
  const dangerousExe = attService.checkExtension('invoice_update.exe');
  assert(dangerousExe.isDangerousExt, 'Dangerous .exe extension recognized');

  const dangerousScr = attService.checkExtension('screen_saver_photo.scr');
  assert(dangerousScr.isDangerousExt, 'Dangerous .scr extension recognized');

  const dangerousBat = attService.checkExtension('install.bat');
  assert(dangerousBat.isDangerousExt, 'Dangerous .bat extension recognized');

  const dangerousVbs = attService.checkExtension('script.vbs');
  assert(dangerousVbs.isDangerousExt, 'Dangerous .vbs extension recognized');

  const dangerousPs1 = attService.checkExtension('payload.ps1');
  assert(dangerousPs1.isDangerousExt, 'Dangerous PowerShell .ps1 recognized');

  // 1-3. Macro documents
  const macroXlsm = attService.checkExtension('financial_report.xlsm');
  assert(macroXlsm.isMacro, 'Macro-enabled Excel .xlsm recognized');

  const macroDocm = attService.checkExtension('contract_draft.docm');
  assert(macroDocm.isMacro, 'Macro-enabled Word .docm recognized');

  // 1-4. Double extension obfuscation attacks
  const doublePdfExe = attService.checkExtension('Tax_Invoice.pdf.exe');
  assert(doublePdfExe.isDoubleExt, 'Double extension .pdf.exe obfuscation recognized');

  const doubleDocxVbs = attService.checkExtension('Receipt.docx.vbs');
  assert(doubleDocxVbs.isDoubleExt, 'Double extension .docx.vbs obfuscation recognized');

  const doubleJpgScr = attService.checkExtension('FamilyPhoto.jpg.scr');
  assert(doubleJpgScr.isDoubleExt, 'Double extension .jpg.scr obfuscation recognized');

  // 1-5. Batch scan with scoring
  const scanResult = await attService.scanAttachments([
    { filename: 'normal_report.pdf' },
    { filename: 'urgent_invoice.pdf.exe' },
    { filename: 'macro_sheet.xlsm' },
  ]);
  assert(scanResult.hasThreat, 'Batch scan detects threats');
  assert(scanResult.score >= 28.0, `Score is elevated for threats (score: ${scanResult.score})`);
  assert(scanResult.reasons.length >= 2, `Reasons populated (${scanResult.reasons.length} reasons)`);

  // --------------------------------------------------------------------------
  // TEST 2: DKIM 2048-bit Key Pair Generation & Signing
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Testing DKIM 2048-bit RSA Generation & Outbound Signing ---');
  const mockDomainRepo = {
    findOne: async () => null,
  } as any;

  const dkimService = new DkimSignService(mockDomainRepo);
  const dkimKeys = dkimService.generateDkimKeyPair('lemail2026', 'lemail.local');

  assert(
    dkimKeys.privateKey.startsWith('-----BEGIN PRIVATE KEY-----') ||
    dkimKeys.privateKey.startsWith('-----BEGIN RSA PRIVATE KEY-----'),
    'DKIM private key generated in valid PEM format',
  );
  assert(dkimKeys.dnsTxtRecord.startsWith('v=DKIM1; k=rsa; p='), 'DKIM DNS TXT record generated correctly');
  assert(dkimKeys.dnsHostRecord === 'lemail2026._domainkey.lemail.local', 'DKIM DNS Host record formatted correctly');

  // Test Nodemailer RFC822 DKIM signing
  const transporter = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: 'windows',
  });

  const signedMail = await transporter.sendMail({
    from: '"DKIM Test" <sender@lemail.local>',
    to: 'recipient@remote.com',
    subject: 'DKIM Sign Test',
    text: 'Hello, this is a test message with cryptographic DKIM signature.',
    dkim: {
      domainName: 'lemail.local',
      keySelector: dkimKeys.selector,
      privateKey: dkimKeys.privateKey,
      cacheDir: false,
    },
  });

  const emlOutput = (signedMail.message as Buffer).toString('utf-8');
  assert(emlOutput.includes('DKIM-Signature:'), 'Generated EML contains DKIM-Signature header');
  assert(emlOutput.includes('s=lemail2026;'), 'DKIM-Signature matches configured selector');
  assert(emlOutput.includes('d=lemail.local;'), 'DKIM-Signature matches configured domain');

  // --------------------------------------------------------------------------
  // TEST 3: Outbound Rate Limiting Fallback & Logic
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Testing Outbound Rate Limiting & Graceful Fallback ---');
  const rateLimitService = new OutboundRateLimitService(mockConfigService);

  // When Redis is not connected / fail-open mode
  const failOpenCheck = await rateLimitService.checkAndIncrement('test-user-1', 1);
  assert(failOpenCheck.allowed, 'Outbound sending operates safely in fail-open mode when Redis is offline');

  const usage = await rateLimitService.getUsage('test-user-1');
  assert(usage.minute.limit === 3, 'Rate limit per minute respects config');
  assert(usage.day.limit === 10, 'Rate limit per day respects config');

  console.log('\n====================================================');
  console.log(`   Phase 3 Results: ${passedTests}/${totalTests} Passed`);
  console.log('====================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runPhase3Tests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
