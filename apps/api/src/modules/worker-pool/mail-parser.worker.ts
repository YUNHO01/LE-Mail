import { createReadStream, readFileSync } from 'fs';
import { simpleParser, ParsedMail, Attachment } from 'mailparser';
import { authenticate } from 'mailauth';

export interface ParsedAttachmentInfo {
  filename: string;
  contentType: string;
  size: number;
  contentBase64?: string;
  checksum?: string;
}

export interface ParsedMailResult {
  messageId: string | null;
  subject: string | null;
  date: Date | null;
  from: string | null;
  to: string[];
  cc: string[];
  bcc: string[];
  text: string | null;
  html: string | null;
  attachments: ParsedAttachmentInfo[];
  spfResult?: 'PASS' | 'FAIL' | 'SOFTFAIL' | 'NEUTRAL' | 'NONE';
  dkimResult?: 'PASS' | 'FAIL' | 'NONE';
  dmarcResult?: 'PASS' | 'FAIL' | 'NONE';
}

function extractAddresses(field: any): string[] {
  if (!field) return [];
  if (Array.isArray(field)) {
    return field.flatMap((item) => extractAddresses(item));
  }
  if (field.value && Array.isArray(field.value)) {
    return field.value.map((addr: any) => addr.address).filter(Boolean);
  }
  if (field.text) {
    return [field.text];
  }
  return [];
}

function resolveInlineCidImages(
  html: string | null,
  attachments: Attachment[],
): string | null {
  if (!html) return null;

  const cidMap = new Map<string, string>();
  for (const att of attachments) {
    const rawCid = att.cid || att.contentId;
    if (!rawCid || !att.content) continue;
    const mime = (att.contentType || '').toLowerCase();
    if (!mime.startsWith('image/')) continue;

    const normalizedCid = rawCid.replace(/^<|>$/g, '').trim();
    if (!normalizedCid) continue;

    cidMap.set(
      normalizedCid,
      `data:${mime};base64,${att.content.toString('base64')}`,
    );
  }

  if (cidMap.size === 0) return html;

  return html.replace(
    /(<img\b[^>]*\bsrc\s*=\s*)(["'])cid:([^"']+)\2/gi,
    (fullMatch, prefix, quote, cidValue) => {
      const key = cidValue.replace(/^<|>$/g, '').trim();
      const dataUri = cidMap.get(key);
      return dataUri ? `${prefix}${quote}${dataUri}${quote}` : fullMatch;
    },
  );
}

export default async function parseMailWorker({
  filePath,
  clientIp,
  sender,
}: {
  filePath: string;
  clientIp?: string;
  sender?: string;
}): Promise<ParsedMailResult> {
  const stream = createReadStream(filePath);
  const parsed: ParsedMail = await simpleParser(stream);

  const attachments: ParsedAttachmentInfo[] = (parsed.attachments || []).map(
    (att: Attachment) => ({
      filename: att.filename || 'unnamed_attachment',
      contentType: att.contentType || 'application/octet-stream',
      size: att.size || (att.content ? att.content.length : 0),
      checksum: att.checksum,
      contentBase64: att.content ? att.content.toString('base64') : undefined,
    }),
  );

  const fromAddress = parsed.from?.value?.[0]?.address || null;
  const envelopeSender = sender || fromAddress || undefined;

  let spfResult: 'PASS' | 'FAIL' | 'SOFTFAIL' | 'NEUTRAL' | 'NONE' = 'NONE';
  let dkimResult: 'PASS' | 'FAIL' | 'NONE' = 'NONE';
  let dmarcResult: 'PASS' | 'FAIL' | 'NONE' = 'NONE';

  // 실제 SPF / DKIM / DMARC 인증 검증 수행
  try {
    const rawBuffer = readFileSync(filePath);
    const authResult = await authenticate(rawBuffer, {
      ip: clientIp || undefined,
      sender: envelopeSender,
      trustReceived: true,
    });

    // 1. SPF 결과 매핑
    const spfObj =
      authResult.spf && typeof authResult.spf === 'object'
        ? (authResult.spf as any)
        : null;
    const spfStatus = (spfObj?.status?.result || '').toLowerCase();
    if (spfStatus === 'pass') {
      spfResult = 'PASS';
    } else if (spfStatus === 'fail') {
      spfResult = 'FAIL';
    } else if (spfStatus === 'softfail') {
      spfResult = 'SOFTFAIL';
    } else if (spfStatus === 'neutral') {
      spfResult = 'NEUTRAL';
    } else {
      spfResult = 'NONE';
    }

    // 2. DKIM 결과 매핑
    if (authResult.dkim?.results && authResult.dkim.results.length > 0) {
      const hasPass = authResult.dkim.results.some(
        (r: any) => (r.status?.result || '').toLowerCase() === 'pass',
      );
      if (hasPass) {
        dkimResult = 'PASS';
      } else {
        const hasFail = authResult.dkim.results.some(
          (r: any) => (r.status?.result || '').toLowerCase() === 'fail',
        );
        dkimResult = hasFail ? 'FAIL' : 'NONE';
      }
    }

    // 3. DMARC 결과 매핑
    const dmarcObj =
      authResult.dmarc && typeof authResult.dmarc === 'object'
        ? (authResult.dmarc as any)
        : null;
    const dmarcStatus = (dmarcObj?.status?.result || '').toLowerCase();
    if (dmarcStatus === 'pass') {
      dmarcResult = 'PASS';
    } else if (dmarcStatus === 'fail') {
      dmarcResult = 'FAIL';
    } else {
      dmarcResult = 'NONE';
    }
  } catch (authErr: any) {
    // DNS 실패나 파싱 예외 발생 시 안전하게 NONE으로 처리 (수신 파이프라인 무중단)
    spfResult = 'NONE';
    dkimResult = 'NONE';
    dmarcResult = 'NONE';
  }

  return {
    messageId: parsed.messageId || null,
    subject: parsed.subject || null,
    date: parsed.date || null,
    from: fromAddress,
    to: extractAddresses(parsed.to),
    cc: extractAddresses(parsed.cc),
    bcc: extractAddresses(parsed.bcc),
    text: parsed.text || null,
    html: resolveInlineCidImages(
      typeof parsed.html === 'string' ? parsed.html : null,
      parsed.attachments || [],
    ),
    attachments,
    spfResult,
    dkimResult,
    dmarcResult,
  };
}

module.exports = parseMailWorker;
