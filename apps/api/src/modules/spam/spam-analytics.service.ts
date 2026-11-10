import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, Between } from 'typeorm';
import {
  MailMessage,
  MailStatus,
  Direction,
  SpfResult,
  DmarcResult,
} from '../database/entities/mail-message.entity';
import { SpamRule, SpamRuleType } from '../database/entities/spam-rule.entity';

export interface SpamSummaryKpi {
  totalInbound: number;
  cleanMails: number;
  spamMails: number;
  quarantinedMails: number;
  blockRatePercent: number;
  activeRulesCount: {
    whitelist: number;
    blacklist: number;
  };
}

export interface ThreatBreakdown {
  authFailure: number;      // SPF/DKIM/DMARC 실패
  rblBlocked: number;       // RBL 블랙리스트
  malwareAttachment: number;// 바이러스 / 악성 확장자
  phishingKeyword: number;  // 피싱 및 사기 키워드
  blacklistRule: number;    // 블랙리스트 규칙
  otherSpam: number;
}

export interface DailyTrendPoint {
  date: string;
  total: number;
  clean: number;
  spam: number;
  quarantined: number;
}

export interface TopSpammer {
  sender: string;
  count: number;
  lastDetected: string;
}

export interface SpamAnalyticsReport {
  range: string;
  kpi: SpamSummaryKpi;
  threatBreakdown: ThreatBreakdown;
  dailyTrends: DailyTrendPoint[];
  topSpammers: TopSpammer[];
}

@Injectable()
export class SpamAnalyticsService {
  private readonly logger = new Logger(SpamAnalyticsService.name);

  constructor(
    @InjectRepository(MailMessage)
    private readonly messageRepo: Repository<MailMessage>,
    @InjectRepository(SpamRule)
    private readonly ruleRepo: Repository<SpamRule>,
  ) {}

  /**
   * 지정된 기간(today, 7d, 30d) 동안의 스팸 방어 및 보안 통계 집계
   */
  async getAnalytics(range: 'today' | '7d' | '30d' = '7d'): Promise<SpamAnalyticsReport> {
    const now = new Date();
    const startDate = new Date();

    if (range === 'today') {
      startDate.setHours(0, 0, 0, 0);
    } else if (range === '7d') {
      startDate.setDate(now.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
    } else if (range === '30d') {
      startDate.setDate(now.getDate() - 30);
      startDate.setHours(0, 0, 0, 0);
    }

    // 1. 해당 기간 수신(INBOUND) 메일 목록 조회
    const inboundMails = await this.messageRepo.find({
      where: {
        direction: Direction.INBOUND,
        createdAt: MoreThanOrEqual(startDate),
      },
      select: {
        id: true,
        sender: true,
        status: true,
        spamScore: true,
        spamReasons: true,
        spfResult: true,
        dkimResult: true,
        dmarcResult: true,
        createdAt: true,
      },
      order: { createdAt: 'ASC' },
    });

    const totalInbound = inboundMails.length;
    let cleanMails = 0;
    let spamMails = 0;
    let quarantinedMails = 0;

    const threatBreakdown: ThreatBreakdown = {
      authFailure: 0,
      rblBlocked: 0,
      malwareAttachment: 0,
      phishingKeyword: 0,
      blacklistRule: 0,
      otherSpam: 0,
    };

    const senderSpamCounts = new Map<string, { count: number; lastDate: Date }>();

    // 일별 트렌드 맵 초기화
    const dailyMap = new Map<string, DailyTrendPoint>();
    const tempDate = new Date(startDate);
    while (tempDate <= now) {
      const key = tempDate.toISOString().slice(0, 10);
      dailyMap.set(key, { date: key, total: 0, clean: 0, spam: 0, quarantined: 0 });
      tempDate.setDate(tempDate.getDate() + 1);
    }

    for (const mail of inboundMails) {
      const dateKey = mail.createdAt.toISOString().slice(0, 10);
      const dayPoint = dailyMap.get(dateKey) || {
        date: dateKey,
        total: 0,
        clean: 0,
        spam: 0,
        quarantined: 0,
      };
      dayPoint.total++;

      const isQuarantine = mail.status === MailStatus.QUARANTINED;
      const isSpam = !isQuarantine && (mail.spamScore >= 5.0 || mail.spfResult === SpfResult.FAIL);

      if (isQuarantine) {
        quarantinedMails++;
        dayPoint.quarantined++;
      } else if (isSpam) {
        spamMails++;
        dayPoint.spam++;
      } else {
        cleanMails++;
        dayPoint.clean++;
      }
      dailyMap.set(dateKey, dayPoint);

      // 스팸/격리 메일인 경우 위협 유형 및 발신자 카운팅
      if (isQuarantine || isSpam) {
        const sender = (mail.sender || 'unknown').toLowerCase().trim();
        const currentSenderInfo = senderSpamCounts.get(sender) || {
          count: 0,
          lastDate: mail.createdAt,
        };
        currentSenderInfo.count++;
        if (mail.createdAt > currentSenderInfo.lastDate) {
          currentSenderInfo.lastDate = mail.createdAt;
        }
        senderSpamCounts.set(sender, currentSenderInfo);

        // 위협 유형 판정
        let classified = false;
        const reasonsStr = mail.spamReasons || '';

        if (
          reasonsStr.includes('ClamAV') ||
          reasonsStr.includes('확장자') ||
          reasonsStr.includes('악성코드')
        ) {
          threatBreakdown.malwareAttachment++;
          classified = true;
        }
        if (reasonsStr.includes('RBL') || reasonsStr.includes('KISA')) {
          threatBreakdown.rblBlocked++;
          classified = true;
        }
        if (reasonsStr.includes('피싱') || reasonsStr.includes('탈취')) {
          threatBreakdown.phishingKeyword++;
          classified = true;
        }
        if (reasonsStr.includes('블랙리스트')) {
          threatBreakdown.blacklistRule++;
          classified = true;
        }
        if (
          mail.spfResult === SpfResult.FAIL ||
          mail.dmarcResult === DmarcResult.FAIL
        ) {
          threatBreakdown.authFailure++;
          classified = true;
        }

        if (!classified) {
          threatBreakdown.otherSpam++;
        }
      }
    }

    // 2. 전체 스팸 차단율 계산
    const blockedTotal = spamMails + quarantinedMails;
    const blockRatePercent =
      totalInbound > 0 ? Math.round((blockedTotal / totalInbound) * 1000) / 10 : 0;

    // 3. 상위 스팸 발신자 정렬 TOP 5
    const topSpammers: TopSpammer[] = Array.from(senderSpamCounts.entries())
      .map(([sender, info]) => ({
        sender,
        count: info.count,
        lastDetected: info.lastDate.toISOString().slice(0, 16).replace('T', ' '),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // 4. 활성 룰 카운트
    const [whitelistCount, blacklistCount] = await Promise.all([
      this.ruleRepo.count({ where: { type: SpamRuleType.WHITELIST } }),
      this.ruleRepo.count({ where: { type: SpamRuleType.BLACKLIST } }),
    ]);

    return {
      range,
      kpi: {
        totalInbound,
        cleanMails,
        spamMails,
        quarantinedMails,
        blockRatePercent,
        activeRulesCount: {
          whitelist: whitelistCount,
          blacklist: blacklistCount,
        },
      },
      threatBreakdown,
      dailyTrends: Array.from(dailyMap.values()),
      topSpammers,
    };
  }
}
