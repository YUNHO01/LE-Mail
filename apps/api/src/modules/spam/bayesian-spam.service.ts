import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { BayesianToken } from '../database/entities/bayesian-token.entity';

export interface BayesianClassificationResult {
  probability: number; // 0.0 ~ 1.0 (1.0 = 확실한 스팸)
  score: number;       // 가감점수 (+4.5 ~ -2.0)
  reason?: string;
  topTokens: Array<{ token: string; spamProbability: number }>;
}

@Injectable()
export class BayesianSpamService {
  private readonly logger = new Logger(BayesianSpamService.name);

  constructor(
    @InjectRepository(BayesianToken)
    private readonly tokenRepo: Repository<BayesianToken>,
  ) {}

  /**
   * 베이지안 학습 토큰 통계 조회
   */
  async getStats(): Promise<{ totalTokens: number; totalSpamTokens: number; totalHamTokens: number }> {
    try {
      const totalTokens = await this.tokenRepo.count();
      const stats = await this.tokenRepo
        .createQueryBuilder('bt')
        .select('SUM(bt.spamCount)', 'totalSpam')
        .addSelect('SUM(bt.hamCount)', 'totalHam')
        .getRawOne();

      return {
        totalTokens,
        totalSpamTokens: parseInt(stats?.totalSpam || '0', 10),
        totalHamTokens: parseInt(stats?.totalHam || '0', 10),
      };
    } catch {
      return { totalTokens: 0, totalSpamTokens: 0, totalHamTokens: 0 };
    }
  }

  /**
   * 텍스트 본문 및 제목에서 유효한 한글/영문 단어 토큰 추출
   */
  tokenize(text: string): string[] {
    if (!text) return [];

    // HTML 태그 제거
    const cleanText = text
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ');

    // 2자 이상 30자 이하 한글, 영문, 숫자 단어 추출
    const words = cleanText.match(/[a-zA-Z가-힣0-9_]{2,30}/g) || [];

    const tokenSet = new Set<string>();
    for (const w of words) {
      const lower = w.toLowerCase().trim();
      // 순수 숫자(연도, 금액 등) 및 단일 특수문자 토큰 제외
      if (!/^\d+$/.test(lower) && lower.length >= 2) {
        tokenSet.add(lower);
      }
    }

    return Array.from(tokenSet);
  }

  /**
   * 사용자 피드백(스팸 신고: true, 정상 복원: false)을 통한 베이지안 코퍼스 학습
   */
  async learn(
    content: { subject?: string | null; text?: string | null; html?: string | null },
    isSpam: boolean,
  ): Promise<{ tokensLearned: number }> {
    const fullText = `${content.subject || ''} ${content.text || ''} ${content.html || ''}`;
    const tokens = this.tokenize(fullText);

    if (tokens.length === 0) return { tokensLearned: 0 };

    // 일괄 저장 또는 분할 업서트
    const existingTokens = await this.tokenRepo.find({
      where: { token: In(tokens) },
    });
    const existingMap = new Map(existingTokens.map((t) => [t.token, t]));

    const toSave: BayesianToken[] = [];
    for (const token of tokens) {
      let entity = existingMap.get(token);
      if (!entity) {
        entity = this.tokenRepo.create({
          token,
          spamCount: 0,
          hamCount: 0,
        });
      }

      if (isSpam) {
        entity.spamCount += 1;
      } else {
        entity.hamCount += 1;
      }
      toSave.push(entity);
    }

    // 100개씩 청크 분할 저장
    const CHUNK_SIZE = 100;
    for (let i = 0; i < toSave.length; i += CHUNK_SIZE) {
      await this.tokenRepo.save(toSave.slice(i, i + CHUNK_SIZE));
    }

    this.logger.log(
      `Bayesian learning completed: ${tokens.length} tokens classified as ${
        isSpam ? 'SPAM' : 'HAM'
      }`,
    );

    return { tokensLearned: tokens.length };
  }

  /**
   * 나이브 베이즈(Naive Bayes) 통계 알고리즘을 통한 수신 메일 스팸 확률 평가
   */
  async classify(content: {
    subject?: string | null;
    text?: string | null;
    html?: string | null;
  }): Promise<BayesianClassificationResult> {
    const fullText = `${content.subject || ''} ${content.text || ''} ${content.html || ''}`;
    const tokens = this.tokenize(fullText);

    if (tokens.length === 0) {
      return { probability: 0.5, score: 0, topTokens: [] };
    }

    // 매칭되는 토큰 DB 조회
    const tokenEntities = await this.tokenRepo.find({
      where: { token: In(tokens) },
    });

    if (tokenEntities.length === 0) {
      return { probability: 0.5, score: 0, topTokens: [] };
    }

    const tokenProbs: Array<{ token: string; p: number; diff: number }> = [];

    for (const t of tokenEntities) {
      const s = t.spamCount;
      const h = t.hamCount;
      if (s === 0 && h === 0) continue;

      // Laplace Smoothing 적용 토큰별 스팸 조건부 확률 계산
      let p = (s + 1) / (s + h + 2);

      // 경계값 보정
      p = Math.max(0.01, Math.min(0.99, p));
      const diff = Math.abs(p - 0.5); // 0.5(중립)에서 멀수록 유의미한 단어
      tokenProbs.push({ token: t.token, p, diff });
    }

    if (tokenProbs.length === 0) {
      return { probability: 0.5, score: 0, topTokens: [] };
    }

    // 가장 판별력이 높은 상위 15개 토큰 선별
    tokenProbs.sort((a, b) => b.diff - a.diff);
    const topSignificant = tokenProbs.slice(0, 15);

    // Robinson의 결합 확률 공식 (Log Odds 변환)
    let logP = 0;
    let logOneMinusP = 0;

    for (const item of topSignificant) {
      logP += Math.log(item.p);
      logOneMinusP += Math.log(1 - item.p);
    }

    // 최종 결합 확률 P = e^(logP) / (e^(logP) + e^(logOneMinusP))
    const pProd = Math.exp(logP);
    const oneMinusPProd = Math.exp(logOneMinusP);
    let combinedProb = pProd / (pProd + oneMinusPProd);
    if (isNaN(combinedProb)) combinedProb = 0.5;

    const finalProb = Math.round(combinedProb * 100) / 100;
    let score = 0;
    let reason: string | undefined;

    if (finalProb >= 0.9) {
      score = 4.5;
      reason = `베이지안 기계학습 스팸 확률 고위험 (${Math.round(finalProb * 100)}%) (+4.5)`;
    } else if (finalProb >= 0.75) {
      score = 2.5;
      reason = `베이지안 기계학습 스팸 의심 확률 감지 (${Math.round(finalProb * 100)}%) (+2.5)`;
    } else if (finalProb <= 0.25) {
      score = -2.0;
      reason = `베이지안 기계학습 정상 메일(Ham) 패턴 일치 (${Math.round((1 - finalProb) * 100)}%) (-2.0)`;
    }

    return {
      probability: finalProb,
      score,
      reason,
      topTokens: topSignificant.map((t) => ({
        token: t.token,
        spamProbability: Math.round(t.p * 100) / 100,
      })),
    };
  }
}
