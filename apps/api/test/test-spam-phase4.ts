import { SpamAnalyticsService } from '../src/modules/spam/spam-analytics.service';
import { DomainHealthService } from '../src/modules/domain/domain-health.service';
import { QuarantineService } from '../src/modules/spam/quarantine.service';
import { MailStatus, Direction, SpfResult, DkimResult, DmarcResult } from '../src/modules/database/entities/mail-message.entity';
import { SpamRuleType, SpamRuleTargetType } from '../src/modules/database/entities/spam-rule.entity';

async function runPhase4Tests() {
  console.log('====================================================');
  console.log('   LEMail Phase 4 Analytics & Health Verification  ');
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

  // --------------------------------------------------------------------------
  // TEST 1: SpamAnalyticsService - Aggregation & Threat Breakdown
  // --------------------------------------------------------------------------
  console.log('--- 1. Testing Spam Analytics & Threat Breakdown ---');

  const now = new Date();
  const mockMessages = [
    {
      id: 'm1',
      sender: 'spammer1@bad.com',
      direction: Direction.INBOUND,
      status: MailStatus.QUARANTINED,
      spamScore: 18.0,
      spamReasons: '["실행/스크립트 고위험 확장자 첨부파일 감지 [invoice.exe] (+15.0)"]',
      spfResult: SpfResult.NONE,
      dkimResult: DkimResult.NONE,
      dmarcResult: DmarcResult.NONE,
      createdAt: new Date(now.getTime() - 1000 * 60 * 60),
    },
    {
      id: 'm2',
      sender: 'phisher@fakebank.com',
      direction: Direction.INBOUND,
      status: MailStatus.PROCESSED,
      spamScore: 8.0,
      spamReasons: '["계정 탈취/피싱 의심 키워드 감지 [계정 정지] (+4.0)"]',
      spfResult: SpfResult.FAIL,
      dkimResult: DkimResult.NONE,
      dmarcResult: DmarcResult.FAIL,
      createdAt: new Date(now.getTime() - 1000 * 60 * 120),
    },
    {
      id: 'm3',
      sender: 'partner@trusted.com',
      direction: Direction.INBOUND,
      status: MailStatus.PROCESSED,
      spamScore: 0.0,
      spamReasons: null,
      spfResult: SpfResult.PASS,
      dkimResult: DkimResult.PASS,
      dmarcResult: DmarcResult.PASS,
      createdAt: new Date(now.getTime() - 1000 * 60 * 180),
    },
  ];

  const mockMessageRepo = {
    find: async () => mockMessages,
    count: async () => 3,
  } as any;

  const mockRuleRepo = {
    count: async ({ where }: any) => {
      if (where.type === SpamRuleType.WHITELIST) return 2;
      if (where.type === SpamRuleType.BLACKLIST) return 5;
      return 0;
    },
  } as any;

  const analyticsService = new SpamAnalyticsService(mockMessageRepo, mockRuleRepo);
  const analytics = await analyticsService.getAnalytics('7d');

  assert(analytics.kpi.totalInbound === 3, 'Total inbound mail counted accurately (3)');
  assert(analytics.kpi.cleanMails === 1, 'Clean mails counted accurately (1)');
  assert(analytics.kpi.spamMails === 1, 'Spam mails counted accurately (1)');
  assert(analytics.kpi.quarantinedMails === 1, 'Quarantined mails counted accurately (1)');
  assert(analytics.kpi.blockRatePercent === 66.7, 'Block rate calculated accurately (66.7%)');
  assert(analytics.threatBreakdown.malwareAttachment >= 1, 'Malware attachment threat classified');
  assert(analytics.threatBreakdown.phishingKeyword >= 1, 'Phishing keyword threat classified');
  assert(analytics.kpi.activeRulesCount.whitelist === 2, 'Active whitelist rules counted (2)');
  assert(analytics.kpi.activeRulesCount.blacklist === 5, 'Active blacklist rules counted (5)');
  assert(analytics.dailyTrends.length > 0, 'Daily trends populated');
  assert(analytics.topSpammers.length > 0, 'Top spam senders ranked');

  // --------------------------------------------------------------------------
  // TEST 2: DomainHealthService - DNS Security Checklist & Score
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Testing Domain Health & Reputation Checker ---');

  const mockDomain = {
    id: 'dom-1',
    name: 'google.com', // use a real domain known to have valid MX, SPF, DMARC
    dkimSelector: 'default',
  };

  const mockDomainRepo = {
    findOne: async () => mockDomain,
  } as any;

  const healthService = new DomainHealthService(mockDomainRepo);
  const healthReport = await healthService.checkDomainHealth('dom-1');

  assert(healthReport.domainName === 'google.com', 'Report generated for target domain');
  assert(healthReport.items.mx.status === 'PASS', 'Google MX record checked and PASS');
  assert(healthReport.items.spf.status === 'PASS', 'Google SPF record checked and PASS');
  assert(healthReport.items.dmarc.status === 'PASS', 'Google DMARC record checked and PASS');
  assert(healthReport.overallScore >= 50, `Overall score evaluated (${healthReport.overallScore}/100)`);
  assert(healthReport.recommendations.some(r => r.includes('KISA')), 'KISA white domain recommendation included');

  // --------------------------------------------------------------------------
  // TEST 3: QuarantineService - Expired Mails Cleanup
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Testing Quarantine Retention & Expired Purge ---');

  let removedCount = 0;
  const mockQuarantineRepo = {
    find: async () => [
      { id: 'old-1', status: MailStatus.QUARANTINED, rawFilePath: null },
      { id: 'old-2', status: MailStatus.QUARANTINED, rawFilePath: null },
    ],
    remove: async () => {
      removedCount++;
    },
    count: async () => 2,
    createQueryBuilder: () => ({
      where: () => ({ getCount: async () => 1 }),
    }),
  } as any;

  const mockConfigService = {
    get: () => null,
  } as any;

  const quarantineService = new QuarantineService(
    mockQuarantineRepo,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    mockConfigService,
  );

  const purgeResult = await quarantineService.purgeExpiredQuarantine(30);
  assert(purgeResult.purgedCount === 2, 'Expired quarantined mails purged (2 items)');
  assert(removedCount === 2, 'Entities removed from repository');

  console.log('\n====================================================');
  console.log(`   Phase 4 Results: ${passedTests}/${totalTests} Passed`);
  console.log('====================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runPhase4Tests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
