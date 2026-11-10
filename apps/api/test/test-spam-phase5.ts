import { BayesianSpamService } from '../src/modules/spam/bayesian-spam.service';
import { AccountDefenseService } from '../src/modules/spam/account-defense.service';
import { DmarcReportService } from '../src/modules/spam/dmarc-report.service';
import { SpamConfigService } from '../src/modules/spam/spam-config.service';
import { SpamScoreService } from '../src/modules/spam/spam-score.service';
import { BayesianToken } from '../src/modules/database/entities/bayesian-token.entity';
import { SpfResult, DkimResult, DmarcResult } from '@lemail/shared-types';

async function runPhase5Tests() {
  console.log('====================================================');
  console.log('   LEMail Phase 5 Bayesian & Account Defense Tests  ');
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
  // TEST 1: BayesianSpamService - Tokenization, Learning & Classification
  // --------------------------------------------------------------------------
  console.log('--- 1. Testing Bayesian Tokenizer, Learning & Classification ---');

  const tokenStore = new Map<string, BayesianToken>();
  let totalSpamCount = 0;
  let totalHamCount = 0;

  const mockTokenRepo: any = {
    create(data: any) {
      return { ...data };
    },
    async findOne(options: any) {
      const token = options?.where?.token;
      return tokenStore.get(token) || null;
    },
    async save(tokenEntity: BayesianToken | BayesianToken[]) {
      if (Array.isArray(tokenEntity)) {
        for (const t of tokenEntity) {
          tokenStore.set(t.token, t);
        }
        return tokenEntity;
      }
      tokenStore.set(tokenEntity.token, tokenEntity);
      return tokenEntity;
    },
    async count() {
      return tokenStore.size;
    },
    async find(options: any) {
      const targetTokens = options?.where?.token?._value;
      if (Array.isArray(targetTokens)) {
        return Array.from(tokenStore.values()).filter((t) => targetTokens.includes(t.token));
      }
      return Array.from(tokenStore.values());
    },
    manager: {
      async query(sql: string) {
        return [{ totalSpam: totalSpamCount, totalHam: totalHamCount }];
      },
    },
  };

  const bayesianService = new BayesianSpamService(mockTokenRepo);

  // Train with spam content
  await bayesianService.learn(
    {
      subject: '긴급 카지노 무료 비트코인 에어드랍 대출',
      text: '지금 즉시 카지노 가입하고 비트코인 보너스를 받으세요. 무담보 대출 당첨',
    },
    true,
  );
  totalSpamCount += 1;

  // Train with ham content
  await bayesianService.learn(
    {
      subject: '주간 업무 보고서 및 회의 안내',
      text: '다음 주 월요일 정기 개발 회의 및 프로젝트 일정 공유드립니다.',
    },
    false,
  );
  totalHamCount += 1;

  assert(tokenStore.size > 0, 'Bayesian learned and extracted tokens into repository', `Tokens: ${tokenStore.size}`);
  assert(tokenStore.has('카지노') && (tokenStore.get('카지노')?.spamCount ?? 0) >= 1, 'Spam token "카지노" tracked with spam count');
  assert(tokenStore.has('보고서') && (tokenStore.get('보고서')?.hamCount ?? 0) >= 1, 'Ham token "보고서" tracked with ham count');

  // Classify a spam mail containing learned tokens
  const spamClassification = await bayesianService.classify({
    subject: '카지노 비트코인 특별 혜택',
    text: '카지노 무료 환전',
  });

  assert(
    spamClassification.probability >= 0.7,
    'Bayesian accurately predicts high spam probability for spam mail',
    `Prob: ${spamClassification.probability}, Score: ${spamClassification.score}`,
  );
  assert(spamClassification.score > 0, 'Bayesian adds positive spam score for spam classification');

  // Classify a ham mail containing ham tokens
  const hamClassification = await bayesianService.classify({
    subject: '주간 프로젝트 보고서 안내',
    text: '개발 일정 회의 내용 확인 부탁드립니다.',
  });

  assert(
    hamClassification.probability <= 0.3,
    'Bayesian accurately predicts low spam probability for ham mail',
    `Prob: ${hamClassification.probability}, Score: ${hamClassification.score}`,
  );
  assert(hamClassification.score <= 0, 'Bayesian reduces or maintains 0 score for legitimate ham mail');

  // --------------------------------------------------------------------------
  // TEST 2: AccountDefenseService - Sliding Window Violations & Auto-Lock
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Testing Account Defense & Abuse Auto-Lock ---');

  const inMemoryRedis = new Map<string, { value: any; expireAt?: number }>();
  const mockDefenseRedis: any = {
    status: 'ready',
    async get(key: string) {
      const item = inMemoryRedis.get(key);
      if (!item) return null;
      if (item.expireAt && item.expireAt < Date.now()) {
        inMemoryRedis.delete(key);
        return null;
      }
      return item.value;
    },
    async set(key: string, value: any, mode?: string, duration?: number) {
      const expireAt = duration ? Date.now() + duration * 1000 : undefined;
      inMemoryRedis.set(key, { value, expireAt });
      return 'OK';
    },
    async incr(key: string) {
      const item = inMemoryRedis.get(key);
      const val = item ? parseInt(item.value, 10) + 1 : 1;
      inMemoryRedis.set(key, { value: String(val) });
      return val;
    },
    async expire(key: string, sec: number) {
      const item = inMemoryRedis.get(key);
      if (item) {
        item.expireAt = Date.now() + sec * 1000;
      }
      return 1;
    },
    async del(...keys: string[]) {
      for (const k of keys) {
        inMemoryRedis.delete(k);
      }
      return keys.length;
    },
    async keys(pattern: string) {
      const prefix = pattern.replace('*', '');
      return Array.from(inMemoryRedis.keys()).filter((k) => k.startsWith(prefix));
    },
    async mget(...keys: string[]) {
      return keys.map((k) => inMemoryRedis.get(k)?.value || null);
    },
  };

  const mockConfigService: any = {
    get: (key: string) => {
      if (key === 'redis.host') return '127.0.0.1';
      if (key === 'redis.port') return 6379;
      return null;
    },
  };

  const mockUserRepo: any = {
    async findOne(options: any) {
      return { id: options?.where?.id, email: 'spammer@lineedge.com', name: 'Spam Bot' };
    },
  };

  const defenseService = new AccountDefenseService(mockConfigService, mockUserRepo);
  (defenseService as any).redisClient = mockDefenseRedis;

  const testUserId = 'user-spammer-999';

  // Initially, account should not be locked
  let lockStatus = await defenseService.isAccountLocked(testUserId);
  assert(!lockStatus.locked, 'Account is initially unlocked');

  // Record 1st and 2nd violations
  await defenseService.recordViolation(testUserId, 'Rate limit burst 1');
  await defenseService.recordViolation(testUserId, 'Rate limit burst 2');
  lockStatus = await defenseService.isAccountLocked(testUserId);
  assert(!lockStatus.locked, 'Account remains unlocked after 2 violations (Threshold is 3)');

  // Record 3rd violation -> Triggers Auto-Lock!
  await defenseService.recordViolation(testUserId, 'Rate limit burst 3');
  lockStatus = await defenseService.isAccountLocked(testUserId);
  assert(lockStatus.locked, 'Account is automatically locked upon 3rd violation within window');

  // Check incidents report
  const incidents = await defenseService.getSecurityIncidents();
  assert(
    incidents.some((inc) => inc.userId === testUserId),
    'Security incidents report lists locked abusive account',
  );

  // Admin unlocks account
  const unlockResult = await defenseService.unlockAccount(testUserId);
  assert(unlockResult, 'Admin successfully unlocks account');
  lockStatus = await defenseService.isAccountLocked(testUserId);
  assert(!lockStatus.locked, 'Account is now verified unlocked');

  // --------------------------------------------------------------------------
  // TEST 3: DmarcReportService - RFC 7489 RUA XML Parser
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Testing RFC 7489 DMARC Aggregate Report (RUA) Parser ---');

  const sampleRuaXml = `<?xml version="1.0" encoding="UTF-8" ?>
<feedback>
  <report_metadata>
    <org_name>google.com</org_name>
    <email>noreply-dmarc-support@google.com</email>
    <report_id>1234567890123456789</report_id>
    <date_range>
      <begin>1700000000</begin>
      <end>1700086400</end>
    </date_range>
  </report_metadata>
  <policy_published>
    <domain>lineedge.com</domain>
    <adkim>r</adkim>
    <aspf>r</aspf>
    <p>reject</p>
    <sp>reject</sp>
    <pct>100</pct>
  </policy_published>
  <record>
    <row>
      <source_ip>123.45.67.89</source_ip>
      <count>150</count>
      <policy_evaluated>
        <disposition>none</disposition>
        <dkim>pass</dkim>
        <spf>pass</spf>
      </policy_evaluated>
    </row>
    <identifiers>
      <header_from>lineedge.com</header_from>
    </identifiers>
    <auth_results>
      <dkim>
        <domain>lineedge.com</domain>
        <result>pass</result>
        <selector>lemail</selector>
      </dkim>
      <spf>
        <domain>lineedge.com</domain>
        <result>pass</result>
      </spf>
    </auth_results>
  </record>
  <record>
    <row>
      <source_ip>203.0.113.195</source_ip>
      <count>10</count>
      <policy_evaluated>
        <disposition>reject</disposition>
        <dkim>fail</dkim>
        <spf>fail</spf>
      </policy_evaluated>
    </row>
    <identifiers>
      <header_from>lineedge.com</header_from>
    </identifiers>
    <auth_results>
      <spf>
        <domain>lineedge.com</domain>
        <result>fail</result>
      </spf>
    </auth_results>
  </record>
</feedback>`;

  const dmarcService = new DmarcReportService();
  const parsedRua = dmarcService.parseDmarcXml(sampleRuaXml);

  assert(parsedRua.orgName === 'google.com', 'DMARC RUA parser extracted org_name: google.com');
  assert(parsedRua.domain === 'lineedge.com', 'Extracted published domain: lineedge.com');
  assert(parsedRua.policy?.p === 'reject', 'Extracted DMARC policy: reject');
  assert(parsedRua.totalCount === 160, `Correct total message count: 160 (Got ${parsedRua.totalCount})`);
  assert(parsedRua.passCount === 150, `Correct pass count: 150 (Got ${parsedRua.passCount})`);
  assert(parsedRua.failCount === 10, `Correct fail count: 10 (Got ${parsedRua.failCount})`);
  assert(parsedRua.passRatePercent === 93.8, `Pass rate computed as 93.8% (Got ${parsedRua.passRatePercent}%)`);
  assert(parsedRua.records.length === 2, '2 individual source IP records parsed');

  // --------------------------------------------------------------------------
  // TEST 4: SpamConfigService & Dynamic Threshold Integration
  // --------------------------------------------------------------------------
  console.log('\n--- 4. Testing SpamConfigService & Dynamic Thresholds ---');

  const spamConfigService = new SpamConfigService(mockConfigService);
  const initialConfig = spamConfigService.getConfig();
  assert(initialConfig.spamScoreThreshold === 5.0, 'Initial spam threshold is 5.0');
  assert(initialConfig.quarantineScoreThreshold === 10.0, 'Initial quarantine threshold is 10.0');

  // Update policy config dynamically
  await spamConfigService.updateConfig({
    quarantineScoreThreshold: 12.0,
    outboundRateLimitMinute: 50,
  });

  const updatedConfig = spamConfigService.getConfig();
  assert(updatedConfig.quarantineScoreThreshold === 12.0, 'Updated quarantine threshold to 12.0');
  assert(updatedConfig.outboundRateLimitMinute === 50, 'Updated minute outbound limit to 50');

  // --------------------------------------------------------------------------
  // TEST 5: SpamScoreService with Bayesian & Dynamic Policy
  // --------------------------------------------------------------------------
  console.log('\n--- 5. Testing SpamScoreService with Bayesian & Dynamic Thresholds ---');

  const spamScoreService = new SpamScoreService(spamConfigService);

  // Email with score 10.5 (SPF FAIL: +4, DKIM FAIL: +3.5, Bayesian: +3.0 = 10.5)
  // With default threshold (10.0), this would be QUARANTINE.
  // With updated threshold (12.0), this is now SPAM!
  const evalResult = spamScoreService.evaluateMail({
    subject: '정기 점검 공지',
    text: '주말 시스템 점검 공지사항입니다.',
    html: null,
    from: 'attacker@evil.com',
    spfResult: SpfResult.FAIL,
    dkimResult: DkimResult.FAIL,
    dmarcResult: DmarcResult.NONE,
    bayesianScore: 3.0,
    bayesianReason: '베이지안(Bayesian) 통계 기계학습 고위험 스팸 판정 (+3.0)',
  });

  assert(evalResult.score === 10.5, `Spam score evaluated as 10.5 (Got ${evalResult.score})`);
  assert(
    evalResult.reasons.some((r) => r.includes('베이지안')),
    'Bayesian reason included in spam evaluation reasons',
  );
  assert(
    evalResult.action === 'SPAM',
    `Dynamic threshold applied: score ${evalResult.score} is SPAM (not QUARANTINE because quarantine threshold is 12.0)`,
  );

  console.log('\n====================================================');
  console.log(`Phase 5 Tests Complete: ${passedTests}/${totalTests} Passed`);
  console.log('====================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runPhase5Tests().catch((err) => {
  console.error('Fatal error during Phase 5 testing:', err);
  process.exit(1);
});
