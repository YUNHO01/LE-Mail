import { SpamScoreService } from '../src/modules/spam/spam-score.service';
import { SpfResult, DkimResult, DmarcResult } from '@lemail/shared-types';

async function runPhase2Tests() {
  console.log('=== [LEMail Phase 2 Spam Scoring & Quarantine Tests] ===\n');

  const scorer = new SpamScoreService();

  // Test 1: 정상 메일
  console.log('1. Evaluating clean regular email...');
  const cleanResult = scorer.evaluateMail({
    subject: '프로젝트 진행 현황 보고서',
    text: '안녕하세요, 요청하신 이번 주 진행 현황 공유드립니다.',
    html: '<p>안녕하세요, 요청하신 이번 주 진행 현황 공유드립니다.</p>',
    from: 'colleague@lineedge.com',
    spfResult: SpfResult.PASS,
    dkimResult: DkimResult.PASS,
    dmarcResult: DmarcResult.PASS,
  });

  console.log(' - Clean Mail Score:', cleanResult.score, 'Action:', cleanResult.action);
  if (cleanResult.action !== 'INBOX') {
    throw new Error(`Clean mail should be INBOX, got: ${cleanResult.action}`);
  }
  console.log(' ✔ Clean email test passed!\n');

  // Test 2: 중위험 의심 스팸 메일 (5.0 ~ 9.9점) -> SPAM 메일함
  console.log('2. Evaluating suspicious marketing/soft spam email...');
  const suspiciousResult = scorer.evaluateMail({
    subject: 'URGENT: 계정 일시 정지 안내 확인 요망!!!',
    text: '고객님의 계정 정지 전 확인이 필요합니다. bit.ly/check 로 접속하세요.',
    html: '<p>고객님의 계정 정지 전 확인이 필요합니다. bit.ly/check 로 접속하세요.</p>',
    from: 'noreply@random-promo.xyz',
    spfResult: SpfResult.SOFTFAIL,
    dkimResult: DkimResult.NONE,
    dmarcResult: DmarcResult.NONE,
  });

  console.log(' - Suspicious Mail Score:', suspiciousResult.score, 'Action:', suspiciousResult.action);
  console.log(' - Reasons:', suspiciousResult.reasons);
  if (suspiciousResult.action !== 'SPAM') {
    throw new Error(`Suspicious mail should be SPAM, got: ${suspiciousResult.action}`);
  }
  console.log(' ✔ Suspicious email test passed!\n');

  // Test 3: 고위험 피싱 및 위조 메일 (10.0점 이상) -> QUARANTINE 격리
  console.log('3. Evaluating high-risk critical phishing email (Quarantine)...');
  const criticalResult = scorer.evaluateMail({
    subject: 'URGENT: UNLAWFUL TRANSACTION ALERT!!!',
    text: '긴급 송금 안내: 귀하의 계좌 인증 및 비밀번호 만료 처리가 진행 중입니다. http://192.168.1.100/login 접속하여 송금 확인 바랍니다. 당첨 축하 이벤트와 고수익 보장.',
    html: '<a href="http://192.168.1.100/login">http://192.168.1.100/login</a>',
    from: 'security@fake-bank.cc',
    spfResult: SpfResult.FAIL,
    dkimResult: DkimResult.FAIL,
    dmarcResult: DmarcResult.FAIL,
    rblBlocked: true,
  });

  console.log(' - Critical Mail Score:', criticalResult.score, 'Action:', criticalResult.action);
  console.log(' - Reasons:', criticalResult.reasons);
  if (criticalResult.action !== 'QUARANTINE') {
    throw new Error(`Critical mail should be QUARANTINE, got: ${criticalResult.action}`);
  }
  if (criticalResult.score < 10.0) {
    throw new Error(`Critical score should be >= 10.0, got: ${criticalResult.score}`);
  }
  console.log(' ✔ Critical email quarantine test passed!\n');

  console.log('=== All Phase 2 Scoring & Quarantine Tests Passed Successfully! ===');
}

runPhase2Tests().catch((err) => {
  console.error('Test Failed:', err);
  process.exit(1);
});
