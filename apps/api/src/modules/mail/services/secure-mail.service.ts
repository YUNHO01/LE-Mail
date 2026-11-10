import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import PDFDocument from 'pdfkit';
const archiver = require('archiver');
const archiverZipEncrypted = require('archiver-zip-encrypted');
import { convert } from 'html-to-text';

// Register encrypted zip format in archiver
try {
  archiver.registerFormat('zip-encrypted', archiverZipEncrypted);
} catch (e) {
  // Already registered or format exists
}

export interface EncryptedPdfParams {
  subject: string;
  sender: string;
  senderName?: string;
  recipients: string[];
  cc?: string[];
  bodyHtml: string;
  bodyText?: string;
  date: Date;
  password: string;
}

export interface EncryptedZipParams {
  files: Array<{ filename: string; buffer: Buffer }>;
  password: string;
}

export interface SecureNotificationParams {
  subject: string;
  sender: string;
  senderName?: string;
  recipients: string[];
  date: Date;
  hasAttachments: boolean;
  pdfFilename: string;
  zipFilename?: string;
}

@Injectable()
export class SecureMailService {
  private readonly logger = new Logger(SecureMailService.name);

  /**
   * 시스템 내 사용 가능한 한글 지원 TTF 폰트 경로 탐색
   */
  private resolveKoreanFont(): { regular: string | null; bold: string | null } {
    const candidates = [
      // Windows Fonts
      {
        reg: 'C:\\Windows\\Fonts\\malgun.ttf',
        bold: 'C:\\Windows\\Fonts\\malgunbd.ttf',
      },
      {
        reg: 'C:\\Windows\\Fonts\\batang.ttc',
        bold: 'C:\\Windows\\Fonts\\batang.ttc',
      },
      {
        reg: 'C:\\Windows\\Fonts\\gulim.ttc',
        bold: 'C:\\Windows\\Fonts\\gulim.ttc',
      },
      // Linux / Container Fonts
      {
        reg: '/usr/share/fonts/truetype/nanum/NanumGothic.ttf',
        bold: '/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf',
      },
      {
        reg: '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
        bold: '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc',
      },
      // macOS Fonts
      {
        reg: '/System/Library/Fonts/AppleSDGothicNeo.ttc',
        bold: '/System/Library/Fonts/AppleSDGothicNeo.ttc',
      },
    ];

    for (const c of candidates) {
      if (fs.existsSync(c.reg)) {
        return {
          regular: c.reg,
          bold: fs.existsSync(c.bold) ? c.bold : c.reg,
        };
      }
    }

    return { regular: null, bold: null };
  }

  /**
   * 1. 비밀번호가 설정된 본문 암호화 PDF 생성
   */
  async generateEncryptedPdf(params: EncryptedPdfParams): Promise<Buffer> {
    const {
      subject,
      sender,
      senderName,
      recipients,
      cc = [],
      bodyHtml,
      bodyText,
      date,
      password,
    } = params;

    return new Promise<Buffer>((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 45,
          userPassword: password, // 열람 시 비밀번호
          ownerPassword: password + '_owner_lemail_sec',
          permissions: {
            printing: 'highResolution',
            modifying: false,
            copying: true,
            annotating: false,
          },
          info: {
            Title: `[보안메일] ${subject}`,
            Author: senderName ? `${senderName} (${sender})` : sender,
            Subject: 'LEMail Enterprise Secure Mail Document',
            CreationDate: date,
          },
        });

        const buffers: Buffer[] = [];
        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', (err) => reject(err));

        const fonts = this.resolveKoreanFont();
        if (fonts.regular) {
          doc.font(fonts.regular);
        }

        const formattedDate = date.toLocaleString('ko-KR', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });

        // --- 상단 보안 문서 헤더 박스 ---
        const startX = 45;
        let currentY = 45;

        // 헤더 배경 카드
        doc
          .roundedRect(startX, currentY, 505, 115, 8)
          .fillAndStroke('#f8fafc', '#e2e8f0');

        // 상단 보안 마크 뱃지
        doc
          .rect(startX + 15, currentY + 12, 100, 20)
          .fill('#0284c7');
        doc
          .fillColor('#ffffff')
          .fontSize(10);
        if (fonts.bold) doc.font(fonts.bold);
        doc.text('LEMail 보안 문서', startX + 22, currentY + 17);

        // 문서 메타 정보 텍스트
        doc.fillColor('#64748b').fontSize(9);
        if (fonts.regular) doc.font(fonts.regular);
        doc.text(`발송일시: ${formattedDate}`, startX + 320, currentY + 17, { align: 'right', width: 170 });

        // 메일 제목
        currentY += 40;
        doc.fillColor('#0f172a').fontSize(14);
        if (fonts.bold) doc.font(fonts.bold);
        doc.text(subject || '(제목 없음)', startX + 15, currentY, { width: 475 });

        // 발신자 / 수신자 정보
        currentY += 26;
        doc.fillColor('#475569').fontSize(9);
        if (fonts.regular) doc.font(fonts.regular);
        const senderStr = senderName ? `${senderName} <${sender}>` : sender;
        doc.text(`보낸사람: ${senderStr}`, startX + 15, currentY);

        currentY += 16;
        const toStr = recipients.join(', ');
        const ccStr = cc.length > 0 ? `  |  참조: ${cc.join(', ')}` : '';
        doc.text(`받는사람: ${toStr}${ccStr}`, startX + 15, currentY, { width: 475 });

        // --- 본문 영역 ---
        currentY = 180;
        doc.y = currentY;

        // HTML 본문을 읽기 쉬운 깔끔한 텍스트로 변환
        let plainContent = '';
        if (bodyHtml && bodyHtml.trim().length > 0) {
          plainContent = convert(bodyHtml, {
            wordwrap: 130,
            selectors: [
              { selector: 'a', options: { hideLinkHrefIfSameAsText: true } },
              { selector: 'img', format: 'skip' },
            ],
          });
        } else if (bodyText) {
          plainContent = bodyText;
        } else {
          plainContent = '(본문 내용이 없습니다.)';
        }

        doc.fillColor('#1e293b').fontSize(10);
        if (fonts.regular) doc.font(fonts.regular);
        doc.text(plainContent, startX, currentY, {
          width: 505,
          lineGap: 4,
          align: 'left',
        });

        // --- 하단 워터마크 푸터 ---
        const pageCount = (doc as any)._pageBuffer ? (doc as any)._pageBuffer.length : 1;
        doc
          .fontSize(8)
          .fillColor('#94a3b8')
          .text(
            '본 문서는 LEMail 엔터프라이즈 보안 메일 시스템을 통해 암호화 생성된 보안 문서입니다. 무단 배포 및 유출을 금합니다.',
            startX,
            doc.page.height - 40,
            { align: 'center', width: 505 },
          );

        doc.end();
      } catch (err) {
        this.logger.error(`Failed to generate encrypted PDF: ${err.message}`, err.stack);
        reject(err);
      }
    });
  }

  /**
   * 2. 기존 첨부파일들을 비밀번호로 암호화한 ZIP 파일 생성 (안 A)
   */
  async generateEncryptedZip(params: EncryptedZipParams): Promise<Buffer> {
    const { files, password } = params;

    return new Promise<Buffer>((resolve, reject) => {
      try {
        const archive = archiver.create('zip-encrypted' as any, {
          zlib: { level: 9 },
          encryptionMethod: 'zip20', // Windows 탐색기/맥/모바일 100% 호환
          password,
        });

        const buffers: Buffer[] = [];
        archive.on('data', (chunk: Buffer) => buffers.push(chunk));
        archive.on('end', () => resolve(Buffer.concat(buffers)));
        archive.on('error', (err: any) => reject(err));

        for (const file of files) {
          archive.append(file.buffer, { name: file.filename });
        }

        archive.finalize();
      } catch (err) {
        this.logger.error(`Failed to generate encrypted ZIP: ${err.message}`, err.stack);
        reject(err);
      }
    });
  }

  /**
   * 3. 보안 메일 안내 본문 HTML 템플릿 생성 (이미지 및 직관적 안내문 포함)
   */
  generateSecureMailNotificationHtml(params: SecureNotificationParams): {
    html: string;
    text: string;
    inlineAttachment: {
      filename: string;
      content: Buffer;
      contentType: string;
      cid: string;
    };
  } {
    const {
      subject,
      sender,
      senderName,
      recipients,
      date,
      hasAttachments,
      pdfFilename,
      zipFilename,
    } = params;

    const formattedDate = date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

    const senderDisplay = senderName ? `${senderName} (${sender})` : sender;

    // 모던 보안 엠블럼 SVG 아이콘
    const badgeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#0284c7" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      <rect x="9" y="10" width="6" height="5" rx="1" fill="#0284c7" stroke="none"/>
      <path d="M10 10V8a2 2 0 1 1 4 0v2" stroke="#0284c7" stroke-width="1.8"/>
    </svg>`;

    const badgeSvgBuffer = Buffer.from(badgeSvg, 'utf-8');
    const badgeCid = 'lemail-security-badge@lemail.local';

    const html = `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>보안 메일 안내</title>
</head>
<body style="margin: 0; padding: 24px; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic', '맑은 고딕', helvetica, sans-serif; color: #1e293b;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 640px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <!-- Header Banner -->
    <tr>
      <td style="background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); padding: 32px 24px; text-align: center; color: #ffffff;">
        <div style="display: inline-block; background-color: rgba(255, 255, 255, 0.15); border-radius: 50%; padding: 12px; margin-bottom: 12px;">
          <!-- Inline CID 보안 엠블럼 이미지 (아웃룩 및 모든 메일 클라이언트 호환) -->
          <img src="cid:${badgeCid}" alt="보안 메일" width="56" height="56" style="display: block; border: 0; filter: brightness(0) invert(1);" />
        </div>
        <h1 style="margin: 0 0 6px 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">보안 메일이 도착했습니다</h1>
        <p style="margin: 0; font-size: 13px; color: #e0f2fe; line-height: 1.5;">본 메일은 개인정보 및 기밀 보호를 위해 암호화 처리되었습니다.</p>
      </td>
    </tr>

    <!-- Main Content Body -->
    <tr>
      <td style="padding: 28px 24px;">
        <!-- 메일 정보 요약 카드 -->
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 24px; font-size: 13px;">
          <tr>
            <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; width: 85px; color: #64748b; font-weight: 600;">보낸사람</td>
            <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-weight: 600;">${senderDisplay}</td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-weight: 600;">발송일시</td>
            <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #334155;">${formattedDate}</td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; color: #64748b; font-weight: 600;">메일제목</td>
            <td style="padding: 12px 16px; color: #0284c7; font-weight: 700;">${subject}</td>
          </tr>
        </table>

        <!-- 보안 메일 열람 안내 단계 -->
        <div style="background-color: #f0f9ff; border: 1px solid #bae6fd; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
          <h2 style="margin: 0 0 14px 0; font-size: 15px; font-weight: 700; color: #0369a1; display: flex; align-items: center;">
            <span style="display: inline-block; background-color: #0284c7; color: #ffffff; width: 20px; height: 20px; border-radius: 50%; text-align: center; line-height: 20px; font-size: 12px; margin-right: 8px;">✓</span>
            메일 열람 방법 안내
          </h2>
          <ol style="margin: 0; padding-left: 20px; font-size: 13px; line-height: 1.8; color: #0c4a6e;">
            <li style="margin-bottom: 6px;">
              첨부된 <strong>[${pdfFilename}]</strong> 파일을 클릭하여 엽니다.
            </li>
            <li style="margin-bottom: 6px;">
              비밀번호 입력 창이 나타나면, <strong>발신자로부터 사전에 안내받은 비밀번호</strong>를 입력합니다.
            </li>
            ${
              hasAttachments && zipFilename
                ? `<li style="margin-bottom: 6px;">
                    함께 첨부된 <strong>[${zipFilename}]</strong> 압축파일도 <strong>동일한 비밀번호</strong>로 압축 해제 후 열람하실 수 있습니다.
                  </li>`
                : ''
            }
          </ol>
        </div>

        <!-- 아웃룩 및 호환성 팁 안내 -->
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 20px; font-size: 12px; color: #475569; background-color: #f8fafc; border-radius: 8px; padding: 12px 16px;">
          <tr>
            <td style="vertical-align: top; padding-right: 10px; width: 20px;">💡</td>
            <td style="line-height: 1.6;">
              <strong>Outlook(아웃룩) 사용자 안내:</strong> 첨부된 PDF 파일을 아웃룩 미리보기 창이나 더블 클릭 시 즉시 비밀번호 입력 대화상자가 표시됩니다. 별도의 외부 프로그램 설치 없이 편리하게 확인하실 수 있습니다.
            </td>
          </tr>
        </table>

        <!-- 주의사항 안내 -->
        <div style="border-top: 1px dashed #cbd5e1; padding-top: 18px; font-size: 12px; color: #64748b; line-height: 1.6;">
          <p style="margin: 0 0 4px 0;"><strong>⚠️ 보안 유의사항</strong></p>
          <ul style="margin: 0; padding-left: 18px;">
            <li>비밀번호는 보안 유지를 위해 본 안내 메일에 기재되지 않습니다.</li>
            <li>비밀번호를 분실하였거나 안내받지 못한 경우 발신자(${senderDisplay})에게 직접 문의해 주시기 바랍니다.</li>
            <li>본 메일의 첨부 문서는 인가된 수신자만 열람할 수 있도록 암호화되었습니다.</li>
          </ul>
        </div>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 24px; text-align: center; font-size: 11px; color: #94a3b8; line-height: 1.5;">
        본 메일은 LineEdge Enterprise Mail Platform 보안 발송 엔진에 의해 안전하게 발송되었습니다.<br/>
        © LineEdge LEMail. All rights reserved.
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();

    const text = `
[보안 메일 안내]
본 메일은 개인정보 및 기밀 보호를 위해 발신자가 비밀번호를 설정한 보안 메일입니다.

■ 보낸사람: ${senderDisplay}
■ 발송일시: ${formattedDate}
■ 메일제목: ${subject}

[메일 열람 방법]
1. 첨부된 [${pdfFilename}] 파일을 클릭하여 엽니다.
2. 비밀번호 입력 창이 나타나면 발신자로부터 안내받은 비밀번호를 입력합니다.
${hasAttachments && zipFilename ? `3. 함께 첨부된 [${zipFilename}] 압축파일도 동일한 비밀번호로 압축 해제 후 열람하실 수 있습니다.` : ''}

※ 아웃룩(Outlook) 사용자는 첨부파일 클릭 시 즉시 비밀번호 입력창이 나타납니다.
※ 비밀번호를 분실하였거나 전달받지 못한 경우 발신자에게 문의해 주시기 바랍니다.
    `.trim();

    return {
      html,
      text,
      inlineAttachment: {
        filename: 'security_badge.svg',
        content: badgeSvgBuffer,
        contentType: 'image/svg+xml',
        cid: badgeCid,
      },
    };
  }
}
