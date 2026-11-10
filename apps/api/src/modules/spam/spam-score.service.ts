import { Injectable, Logger, Optional } from '@nestjs/common';
import { SpfResult, DkimResult, DmarcResult } from '@lemail/shared-types';
import { SpamConfigService } from './spam-config.service';

export interface SpamEvaluationParams {
  subject: string | null;
  text: string | null;
  html: string | null;
  from: string;
  spfResult?: SpfResult;
  dkimResult?: DkimResult;
  dmarcResult?: DmarcResult;
  rblBlocked?: boolean;
  attachmentThreatScore?: number;
  attachmentThreatReasons?: string[];
  bayesianScore?: number;
  bayesianReason?: string;
}

export interface SpamEvaluationResult {
  score: number;
  action: 'INBOX' | 'SPAM' | 'QUARANTINE';
  reasons: string[];
}

@Injectable()
export class SpamScoreService {
  private readonly logger = new Logger(SpamScoreService.name);

  constructor(@Optional() private readonly spamConfigService?: SpamConfigService) {}

  // 피싱/금융 사기 의심 키워드
  private readonly phishingKeywords = [
    '계정 정지',
    '계정 일시 정지',
    '비밀번호 만료',
    '보안 업데이트',
    '계좌 인증',
    '긴급 송금',
    '송금 확인',
    '인증 실패',
    '결제 승인 대기',
    'account suspended',
    'verify your account',
    'security alert',
    'unauthorized login',
    'password expired',
    'wire transfer required',
  ];

  // 불법 도박/코인/대출/광고 스팸 키워드
  private readonly promoKeywords = [
    '고수익 보장',
    '비트코인 에어드랍',
    '코인 무료',
    '무담보 대출',
    '당첨 축하',
    '카지노',
    '바카라',
    '성인 인증',
    '단속 없는',
    'lottery winner',
    'free bonus',
    'crypto giveaway',
    'casino online',
    'viagra',
  ];

  evaluateMail(params: SpamEvaluationParams): SpamEvaluationResult {
    let score = 0;
    const reasons: string[] = [];

    const subject = params.subject || '';
    const bodyContent = `${params.text || ''} ${params.html || ''}`;

    // 1. 발신자 인증 (SPF / DKIM / DMARC) 점수 산정
    if (params.spfResult === SpfResult.FAIL) {
      score += 4.0;
      reasons.push('SPF 발신자 인증 실패 (+4.0)');
    } else if (params.spfResult === SpfResult.SOFTFAIL) {
      score += 2.0;
      reasons.push('SPF 발신자 인증 SoftFail (+2.0)');
    } else if (params.spfResult === SpfResult.PASS) {
      score -= 1.5;
    }

    if (params.dmarcResult === DmarcResult.FAIL) {
      score += 5.0;
      reasons.push('DMARC 정책 위반 및 인증 실패 (+5.0)');
    }

    if (params.dkimResult === DkimResult.FAIL) {
      score += 3.5;
      reasons.push('DKIM 도메인 서명 위조/불일치 (+3.5)');
    } else if (params.dkimResult === DkimResult.PASS) {
      score -= 2.0;
    }

    // 2. RBL 필터링 결과 반영
    if (params.rblBlocked) {
      score += 6.0;
      reasons.push('글로벌/KISA RBL 스팸 IP 목록 등록 (+6.0)');
    }

    // 3. 제목(Subject) 휴리스틱 점검
    if (!subject.trim()) {
      score += 1.5;
      reasons.push('메일 제목 누락 (+1.5)');
    } else {
      // 영문 대문자 남발 점검
      const letters = subject.replace(/[^a-zA-Z]/g, '');
      if (letters.length >= 8 && letters === letters.toUpperCase()) {
        score += 2.5;
        reasons.push('제목 전체 영문 대문자 표기 (+2.5)');
      }

      // 과도한 특수문자/기호 사용 (!!!, ???, $$$ 등)
      if (/(!{3,}|\?{3,}|\${2,}|★{2,}|♥{2,})/.test(subject)) {
        score += 1.5;
        reasons.push('제목 내 과도한 특수문자/강조 기호 사용 (+1.5)');
      }
    }

    // 4. 본문 및 URL 휴리스틱 점검
    // IP 주소 직링 (피싱 단골 수법: e.g. http://192.168.1.1 or http://45.33.22.11)
    const ipUrlRegex = /https?:\/\/\b(?:\d{1,3}\.){3}\d{1,3}\b/i;
    if (ipUrlRegex.test(bodyContent)) {
      score += 4.5;
      reasons.push('IP 직접 지정 의심 링크(Phishing URL) 포함 (+4.5)');
    }

    // 단축 URL 사용 점검
    const shortenerRegex = /https?:\/\/(bit\.ly|tinyurl\.com|t\.co|cutt\.ly|is\.gd)\//i;
    if (shortenerRegex.test(bodyContent)) {
      score += 2.0;
      reasons.push('단축 URL 링크 사용 (+2.0)');
    }

    // 피싱 키워드 매칭
    const matchedPhishing = this.phishingKeywords.filter((kw) =>
      subject.toLowerCase().includes(kw) || bodyContent.toLowerCase().includes(kw),
    );
    if (matchedPhishing.length > 0) {
      const kwScore = Math.min(4.0, matchedPhishing.length * 2.0);
      score += kwScore;
      reasons.push(
        `계정 탈취/피싱 의심 키워드 감지 [${matchedPhishing.slice(0, 3).join(', ')}] (+${kwScore})`,
      );
    }

    // 광고/불법 스팸 키워드 매칭
    const matchedPromo = this.promoKeywords.filter((kw) =>
      subject.toLowerCase().includes(kw) || bodyContent.toLowerCase().includes(kw),
    );
    if (matchedPromo.length > 0) {
      const promoScore = Math.min(4.5, matchedPromo.length * 2.5);
      score += promoScore;
      reasons.push(
        `광고/불법 도박/사기 의심 키워드 감지 [${matchedPromo.slice(0, 3).join(', ')}] (+${promoScore})`,
      );
    }

    // 첨부파일 위험도(악성코드, 바이러스, 위험/이중 확장자) 가산
    if (params.attachmentThreatScore && params.attachmentThreatScore > 0) {
      score += params.attachmentThreatScore;
      if (params.attachmentThreatReasons && params.attachmentThreatReasons.length > 0) {
        reasons.push(...params.attachmentThreatReasons);
      }
    }

    // 베이지안(Bayesian) 통계 기계학습 확률 가감점 반영
    if (params.bayesianScore !== undefined && params.bayesianScore !== 0) {
      score += params.bayesianScore;
      if (params.bayesianReason) {
        reasons.push(params.bayesianReason);
      }
    }

    // 점수 정규화 (최소 0점)
    const finalScore = Math.max(0, Math.round(score * 10) / 10);

    const config = this.spamConfigService?.getConfig();
    const quarantineThreshold = config?.quarantineScoreThreshold ?? 10.0;
    const spamThreshold = config?.spamScoreThreshold ?? 5.0;

    let action: 'INBOX' | 'SPAM' | 'QUARANTINE' = 'INBOX';
    if (finalScore >= quarantineThreshold) {
      action = 'QUARANTINE';
    } else if (finalScore >= spamThreshold) {
      action = 'SPAM';
    } else {
      action = 'INBOX';
    }

    return {
      score: finalScore,
      action,
      reasons,
    };
  }
}
