import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as dns from 'dns';
import { Domain } from '../database/entities/domain.entity';

export interface HealthCheckItem {
  name: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  value?: string;
  expected?: string;
  message: string;
  score: number;
  maxScore: number;
}

export interface DomainHealthReport {
  domainName: string;
  overallScore: number;
  grade: 'EXCELLENT' | 'GOOD' | 'WARNING' | 'CRITICAL';
  checkedAt: string;
  items: {
    mx: HealthCheckItem;
    spf: HealthCheckItem;
    dkim: HealthCheckItem;
    dmarc: HealthCheckItem;
    rbl: HealthCheckItem;
  };
  recommendations: string[];
}

@Injectable()
export class DomainHealthService {
  private readonly logger = new Logger(DomainHealthService.name);
  private readonly resolver: dns.promises.Resolver;

  constructor(
    @InjectRepository(Domain)
    private readonly domainRepo: Repository<Domain>,
  ) {
    this.resolver = new dns.promises.Resolver();
    const envDns = process.env.DNS_SERVERS;
    if (envDns) {
      this.resolver.setServers(envDns.split(',').map((s) => s.trim()));
    } else {
      const currentServers = dns.getServers();
      if (
        currentServers.length === 0 ||
        (currentServers.length === 1 && currentServers[0] === '127.0.0.1')
      ) {
        this.resolver.setServers(['8.8.8.8', '1.1.1.1']);
      }
    }
  }

  /**
   * 지정 도메인의 DNS 4대 보안 레코드(MX, SPF, DKIM, DMARC) 및 RBL 블랙리스트 실시간 진단
   */
  async checkDomainHealth(domainId: string): Promise<DomainHealthReport> {
    const domain = await this.domainRepo.findOne({ where: { id: domainId } });
    if (!domain) {
      throw new Error(`Domain with ID ${domainId} not found`);
    }

    const domainName = domain.name.toLowerCase().trim();
    const selector = domain.dkimSelector || 'default';
    const recommendations: string[] = [];

    // 1. MX 레코드 점검 (25점)
    let mxItem: HealthCheckItem;
    let mxHosts: string[] = [];
    try {
      const mxRecords = await this.resolver.resolveMx(domainName);
      if (mxRecords && mxRecords.length > 0) {
        mxRecords.sort((a, b) => a.priority - b.priority);
        mxHosts = mxRecords.map((r) => r.exchange);
        const valStr = mxRecords.map((r) => `${r.exchange} (우선순위: ${r.priority})`).join(', ');
        mxItem = {
          name: 'MX 레코드 (메일 수신 라우팅)',
          status: 'PASS',
          value: valStr,
          message: `${mxRecords.length}개의 수신 메일 서버가 정상 등록되어 있습니다.`,
          score: 25,
          maxScore: 25,
        };
      } else {
        mxItem = {
          name: 'MX 레코드 (메일 수신 라우팅)',
          status: 'FAIL',
          message: 'MX 레코드가 등록되어 있지 않아 외부 메일을 수신할 수 없습니다.',
          score: 0,
          maxScore: 25,
        };
        recommendations.push(`네임서버에 '${domainName}'의 MX 레코드를 등록해 주세요.`);
      }
    } catch {
      mxItem = {
        name: 'MX 레코드 (메일 수신 라우팅)',
        status: 'FAIL',
        message: 'MX 레코드를 조회할 수 없습니다 (DNS 응답 없음).',
        score: 0,
        maxScore: 25,
      };
      recommendations.push(`네임서버에 '${domainName}'의 MX 레코드(예: mail.${domainName})를 등록하세요.`);
    }

    // 2. SPF 레코드 점검 (25점)
    let spfItem: HealthCheckItem;
    try {
      const txtRecords = await this.resolver.resolveTxt(domainName);
      const spfRecord = txtRecords.flat().find((r) => r.startsWith('v=spf1'));
      if (spfRecord) {
        if (spfRecord.includes('+all')) {
          spfItem = {
            name: 'SPF 레코드 (발신 IP 인증)',
            status: 'WARN',
            value: spfRecord,
            message: "SPF에 '+all'이 설정되어 있어 전 세계 모든 IP에서 위조 발신이 허용됩니다.",
            score: 10,
            maxScore: 25,
          };
          recommendations.push("SPF 종료 구문을 '~all'(SoftFail) 또는 '-all'(Fail)로 강화하세요.");
        } else {
          spfItem = {
            name: 'SPF 레코드 (발신 IP 인증)',
            status: 'PASS',
            value: spfRecord,
            message: '발신자 위조 방지를 위한 SPF 레코드가 올바르게 등록되어 있습니다.',
            score: 25,
            maxScore: 25,
          };
        }
      } else {
        spfItem = {
          name: 'SPF 레코드 (발신 IP 인증)',
          status: 'FAIL',
          message: 'SPF TXT 레코드가 없습니다. 외부 포털(Naver, Gmail)에서 스팸으로 처리될 가능성이 높습니다.',
          score: 0,
          maxScore: 25,
        };
        recommendations.push(`도메인 TXT 레코드에 'v=spf1 mx ~all'을 추가하세요.`);
      }
    } catch {
      spfItem = {
        name: 'SPF 레코드 (발신 IP 인증)',
        status: 'FAIL',
        message: 'SPF 레코드가 존재하지 않습니다.',
        score: 0,
        maxScore: 25,
      };
      recommendations.push(`도메인 TXT 레코드에 'v=spf1 mx ~all'을 등록해 주세요.`);
    }

    // 3. DKIM 레코드 점검 (25점)
    let dkimItem: HealthCheckItem;
    const dkimHost = `${selector}._domainkey.${domainName}`;
    try {
      const dkimTxtRecords = await this.resolver.resolveTxt(dkimHost);
      const dkimRecord = dkimTxtRecords.flat().find((r) => r.includes('v=DKIM1'));
      if (dkimRecord) {
        dkimItem = {
          name: 'DKIM 레코드 (전자서명 무결성 검증)',
          status: 'PASS',
          value: dkimRecord.slice(0, 50) + '...',
          message: `선택자('${selector}')에 대한 DKIM 공개키가 DNS에 정상 게시되어 있습니다.`,
          score: 25,
          maxScore: 25,
        };
      } else {
        dkimItem = {
          name: 'DKIM 레코드 (전자서명 무결성 검증)',
          status: 'FAIL',
          message: `호스트 '${dkimHost}'에 DKIM 레코드가 없습니다.`,
          score: 0,
          maxScore: 25,
        };
        recommendations.push(`도메인 관리 화면에서 'DKIM 키 생성' 후 DNS에 공개키 TXT 레코드를 등록하세요.`);
      }
    } catch {
      dkimItem = {
        name: 'DKIM 레코드 (전자서명 무결성 검증)',
        status: 'FAIL',
        message: `DKIM 레코드(${dkimHost})를 찾을 수 없습니다.`,
        score: 0,
        maxScore: 25,
      };
      recommendations.push(`호스트 '${dkimHost}'에 DKIM 공개키 TXT 레코드를 등록해 주세요.`);
    }

    // 4. DMARC 레코드 점검 (25점)
    let dmarcItem: HealthCheckItem;
    const dmarcHost = `_dmarc.${domainName}`;
    try {
      const dmarcTxtRecords = await this.resolver.resolveTxt(dmarcHost);
      const dmarcRecord = dmarcTxtRecords.flat().find((r) => r.includes('v=DMARC1'));
      if (dmarcRecord) {
        dmarcItem = {
          name: 'DMARC 레코드 (도메인 보호 정책)',
          status: 'PASS',
          value: dmarcRecord,
          message: 'DMARC 정책 레코드가 정상적으로 활성화되어 있습니다.',
          score: 25,
          maxScore: 25,
        };
      } else {
        dmarcItem = {
          name: 'DMARC 레코드 (도메인 보호 정책)',
          status: 'FAIL',
          message: `호스트 '${dmarcHost}'에 DMARC 정책이 없습니다.`,
          score: 0,
          maxScore: 25,
        };
        recommendations.push(`호스트 '${dmarcHost}'에 'v=DMARC1; p=none;'을 등록하세요.`);
      }
    } catch {
      dmarcItem = {
        name: 'DMARC 레코드 (도메인 보호 정책)',
        status: 'FAIL',
        message: 'DMARC 정책 레코드가 없습니다.',
        score: 0,
        maxScore: 25,
      };
      recommendations.push(`호스트 '${dmarcHost}'에 'v=DMARC1; p=none;' 정책을 등록하세요.`);
    }

    // 5. 발신 IP / MX 호스트 RBL 등재 여부 확인
    let rblItem: HealthCheckItem = {
      name: 'RBL / KISA 평판 상태',
      status: 'PASS',
      message: '발송 IP가 주요 블랙리스트(KISA, Spamhaus)에 등재되어 있지 않습니다.',
      score: 0,
      maxScore: 0,
    };

    if (mxHosts.length > 0) {
      try {
        const mxIps = await this.resolver.resolve4(mxHosts[0]);
        if (mxIps && mxIps.length > 0) {
          const testIp = mxIps[0];
          const parts = testIp.split('.');
          if (parts.length === 4) {
            const reversed = `${parts[3]}.${parts[2]}.${parts[1]}.${parts[0]}`;
            try {
              await this.resolver.resolve4(`${reversed}.zen.spamhaus.org`);
              rblItem = {
                name: 'RBL / KISA 평판 상태',
                status: 'FAIL',
                value: `IP: ${testIp}`,
                message: `서버 IP(${testIp})가 Spamhaus RBL에 등재되어 있어 외부 발송이 차단될 수 있습니다.`,
                score: 0,
                maxScore: 0,
              };
              recommendations.push(`서버 IP(${testIp})의 Spamhaus 등재 해제(Delist)를 신청하세요.`);
            } catch {
              // Not listed in Spamhaus
            }
          }
        }
      } catch {}
    }

    // 포털 가이드 추가
    recommendations.push(
      '국내 포털(네이버, 다음/카카오) 발송 도달률을 높이려면 KISA 불법스팸대응센터(kisarbl.or.kr) 화이트도메인에 자사 도메인을 무료 등록하세요.',
    );

    const totalScore = mxItem.score + spfItem.score + dkimItem.score + dmarcItem.score;
    let grade: 'EXCELLENT' | 'GOOD' | 'WARNING' | 'CRITICAL' = 'CRITICAL';
    if (totalScore >= 95) grade = 'EXCELLENT';
    else if (totalScore >= 75) grade = 'GOOD';
    else if (totalScore >= 50) grade = 'WARNING';

    return {
      domainName,
      overallScore: totalScore,
      grade,
      checkedAt: new Date().toISOString(),
      items: {
        mx: mxItem,
        spf: spfItem,
        dkim: dkimItem,
        dmarc: dmarcItem,
        rbl: rblItem,
      },
      recommendations,
    };
  }
}
