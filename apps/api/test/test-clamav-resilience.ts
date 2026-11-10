import { AttachmentSecurityService } from '../src/modules/spam/attachment-security.service';
import { SpamConfigService } from '../src/modules/spam/spam-config.service';
import { ConfigService } from '@nestjs/config';

async function runClamavResilienceTests() {
  console.log('====================================================');
  console.log('   LEMail ClamAV Resilience & Fail-Safe Verification');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, title: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`[PASS] ${title}`);
      passed++;
    } else {
      console.error(`[FAIL] ${title} ${detail ? `(${detail})` : ''}`);
    }
  }

  // --------------------------------------------------------------------------
  // SCENARIO 1: ClamAV가 비활성화된 경우 (CLAMAV_ENABLED=false)
  // --------------------------------------------------------------------------
  console.log('--- Scenario 1: ClamAV Disabled (CLAMAV_ENABLED=false) ---');
  const disabledConfigService = {
    get: (key: string) => {
      if (key === 'CLAMAV_ENABLED') return 'false';
      if (key === 'CLAMAV_HOST') return '127.0.0.1';
      if (key === 'CLAMAV_PORT') return '3310';
      return null;
    },
  } as unknown as ConfigService;

  const disabledSpamConfig = new SpamConfigService(disabledConfigService);
  const disabledAttService = new AttachmentSecurityService(disabledConfigService, disabledSpamConfig);

  // 1-1. Ping 테스트 - 비활성화 시 예외 없이 안전하게 DTO 반환 확인
  const pingDisabled = await disabledAttService.pingClamAV();
  assert(
    !pingDisabled.enabled && !pingDisabled.isHealthy,
    'pingClamAV returns enabled: false without throwing exception',
    JSON.stringify(pingDisabled),
  );

  // 1-2. 첨부파일 수신 스캔 테스트 - 바이러스 스캔 생략 및 정상 수신 통과
  const dummyPdfBase64 = Buffer.from('%PDF-1.4 sample contract document content').toString('base64');
  const scanResult1 = await disabledAttService.scanAttachments([
    {
      filename: 'contract.pdf',
      contentBase64: dummyPdfBase64,
    },
  ]);
  assert(
    !scanResult1.hasThreat && !scanResult1.infected && scanResult1.score === 0,
    'scanAttachments smoothly processes mail without threats when ClamAV is disabled',
    `score: ${scanResult1.score}, infected: ${scanResult1.infected}`,
  );

  // --------------------------------------------------------------------------
  // SCENARIO 2: ClamAV 활성화 상태이나 데몬이 미설치/오프라인인 경우 (ECONNREFUSED)
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 2: ClamAV Enabled but Daemon Unreachable (Fail-safe) ---');
  // 존재하지 않는 가상 포트(59999)로 설정하여 데몬 미응답 상태 시뮬레이션
  const offlineConfigService = {
    get: (key: string) => {
      if (key === 'CLAMAV_ENABLED') return 'true';
      if (key === 'CLAMAV_HOST') return '127.0.0.1';
      if (key === 'CLAMAV_PORT') return '59999'; // Dead port
      if (key === 'CLAMAV_TIMEOUT_MS') return '500';
      return null;
    },
  } as unknown as ConfigService;

  const offlineSpamConfig = new SpamConfigService(offlineConfigService);
  const offlineAttService = new AttachmentSecurityService(offlineConfigService, offlineSpamConfig);

  // 2-1. Ping 테스트 - 데몬 접근 불가 시 예외 없이 isHealthy: false 및 에러 메시지 반환
  const pingOffline = await offlineAttService.pingClamAV(undefined, undefined, 500);
  assert(
    pingOffline.enabled && !pingOffline.isHealthy && !!pingOffline.errorMessage,
    'pingClamAV gracefully returns isHealthy: false with error message when daemon is down',
    pingOffline.errorMessage,
  );

  // 2-2. 정상 첨부파일 수신 시 메일 수신 중단 없이 Graceful Bypass 여부 검증
  const t0 = Date.now();
  const scanResult2 = await offlineAttService.scanAttachments([
    {
      filename: 'quarterly_report.xlsx',
      contentBase64: dummyPdfBase64,
    },
  ]);
  const elapsedFirst = Date.now() - t0;

  assert(
    !scanResult2.infected && !scanResult2.hasThreat && scanResult2.score === 0,
    'Mail attachment safely bypassed ClamAV check and allowed normal mail reception',
    `score: ${scanResult2.score}, infected: ${scanResult2.infected}`,
  );

  // 2-3. Circuit Breaker 검증: 연속 장애 시 이후 첨부파일 스캔 지연 0ms 단축 확인
  // 2회 더 스캔하여 서킷 임계치(3회) 도달
  await offlineAttService.scanAttachments([{ filename: 'doc1.pdf', contentBase64: dummyPdfBase64 }]);
  await offlineAttService.scanAttachments([{ filename: 'doc2.pdf', contentBase64: dummyPdfBase64 }]);

  const tStartCircuit = Date.now();
  const scanResultCircuit = await offlineAttService.scanAttachments([
    { filename: 'doc3.pdf', contentBase64: dummyPdfBase64 },
    { filename: 'doc4.pdf', contentBase64: dummyPdfBase64 },
  ]);
  const elapsedCircuit = Date.now() - tStartCircuit;

  assert(
    !scanResultCircuit.infected && elapsedCircuit < 50,
    `Circuit breaker triggered: 0ms fast-bypass active (${elapsedCircuit}ms elapsed)`,
    `elapsed: ${elapsedCircuit}ms`,
  );

  // --------------------------------------------------------------------------
  // SCENARIO 3: ClamAV가 미설치/오프라인인 상태에서도 다른 보안 검사(확장자, 매크로)는 정상 작동
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 3: Static Attachment Threats Still Detected during AV Outage ---');
  const dangerousResult = await offlineAttService.scanAttachments([
    {
      filename: 'urgent_invoice.pdf.exe', // 이중 확장자
      contentBase64: dummyPdfBase64,
    },
    {
      filename: 'macro_sheet.xlsm', // 매크로 문서
      contentBase64: dummyPdfBase64,
    },
  ]);

  assert(
    dangerousResult.hasThreat && dangerousResult.score >= 28.0,
    'Dangerous extensions and macros are still strictly intercepted even when ClamAV is offline',
    `Detected score: ${dangerousResult.score}`,
  );

  // --------------------------------------------------------------------------
  // SCENARIO 4: 동적 설정 변경(Hot Reload) 테스트
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 4: Dynamic Configuration Update (Hot Reload) ---');
  await offlineSpamConfig.updateConfig({
    clamavEnabled: false,
  });

  assert(
    !offlineAttService.isClamavEnabled,
    'AttachmentSecurityService dynamically reflects disabled status from SpamConfigService without server restart',
  );

  console.log('\n====================================================');
  console.log(`   Verification Finished: ${passed} / ${total} Passed`);
  console.log('====================================================\n');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runClamavResilienceTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
