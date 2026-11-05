import { createReadStream } from 'fs';
import { simpleParser, ParsedMail, Attachment } from 'mailparser';

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

export default async function parseMailWorker({
  filePath,
}: {
  filePath: string;
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

  return {
    messageId: parsed.messageId || null,
    subject: parsed.subject || null,
    date: parsed.date || null,
    from: parsed.from?.value?.[0]?.address || null,
    to: extractAddresses(parsed.to),
    cc: extractAddresses(parsed.cc),
    bcc: extractAddresses(parsed.bcc),
    text: parsed.text || null,
    html: typeof parsed.html === 'string' ? parsed.html : null,
    attachments,
    spfResult: 'NONE',
    dkimResult: 'NONE',
    dmarcResult: 'NONE',
  };
}

module.exports = parseMailWorker;
