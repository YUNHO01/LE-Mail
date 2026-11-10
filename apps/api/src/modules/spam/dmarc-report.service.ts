import { Injectable, Logger } from '@nestjs/common';

export interface DmarcRecordRow {
  sourceIp: string;
  count: number;
  disposition: string;
  dkim: string;
  spf: string;
  headerFrom: string;
}

export interface ParsedDmarcReport {
  orgName: string;
  email: string;
  reportId: string;
  domain: string;
  dateRange: {
    begin: string;
    end: string;
  };
  policy: {
    p: string;
    sp?: string;
    pct?: number;
  };
  totalCount: number;
  passCount: number;
  failCount: number;
  passRatePercent: number;
  records: DmarcRecordRow[];
}

@Injectable()
export class DmarcReportService {
  private readonly logger = new Logger(DmarcReportService.name);

  /**
   * RFC 7489 표준 DMARC 집계 리포트(RUA) XML 파싱
   */
  parseDmarcXml(xmlContent: string): ParsedDmarcReport {
    // 경량 정규식 기반 XML 태그 파서 (순수 Node.js 내장 처리로 외부 의존성 없음)
    const getTag = (tag: string, src: string): string => {
      const match = src.match(new RegExp(`<${tag}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      return match ? match[1].trim() : '';
    };

    const orgName = getTag('org_name', xmlContent) || 'Unknown Provider';
    const email = getTag('email', xmlContent) || '';
    const reportId = getTag('report_id', xmlContent) || 'RUA-' + Date.now();

    const domain = getTag('domain', xmlContent) || '';
    const p = getTag('p', xmlContent) || 'none';
    const sp = getTag('sp', xmlContent) || undefined;
    const pct = parseInt(getTag('pct', xmlContent) || '100', 10);

    const beginSec = parseInt(getTag('begin', xmlContent) || '0', 10);
    const endSec = parseInt(getTag('end', xmlContent) || '0', 10);

    const dateRange = {
      begin: beginSec ? new Date(beginSec * 1000).toISOString() : new Date().toISOString(),
      end: endSec ? new Date(endSec * 1000).toISOString() : new Date().toISOString(),
    };

    // <record> 블록들 분할 추출
    const recordBlocks = xmlContent.match(/<record[\s\S]*?<\/record>/gi) || [];
    const records: DmarcRecordRow[] = [];
    let totalCount = 0;
    let passCount = 0;
    let failCount = 0;

    for (const block of recordBlocks) {
      const sourceIp = getTag('source_ip', block) || '0.0.0.0';
      const count = parseInt(getTag('count', block) || '1', 10);
      const disposition = getTag('disposition', block) || 'none';
      const dkim = getTag('dkim', block) || 'none';
      const spf = getTag('spf', block) || 'none';
      const headerFrom = getTag('header_from', block) || domain;

      totalCount += count;
      if (disposition === 'none' && (dkim === 'pass' || spf === 'pass')) {
        passCount += count;
      } else {
        failCount += count;
      }

      records.push({
        sourceIp,
        count,
        disposition,
        dkim,
        spf,
        headerFrom,
      });
    }

    const passRatePercent =
      totalCount > 0 ? Math.round((passCount / totalCount) * 1000) / 10 : 100;

    return {
      orgName,
      email,
      reportId,
      domain,
      dateRange,
      policy: { p, sp, pct },
      totalCount,
      passCount,
      failCount,
      passRatePercent,
      records,
    };
  }
}
