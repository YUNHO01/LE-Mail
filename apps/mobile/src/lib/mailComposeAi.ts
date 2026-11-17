/**
 * 메일 작성(신규/회신/전달) 본문에서 사용자가 작성하는 상단 영역과
 * 보존해야 하는 서명·원본 인용 영역을 분리/결합하기 위한 유틸리티.
 */

const QUOTE_MARKERS = [
  '----- Original Message -----',
  '---------- Forwarded message ---------',
] as const;

export interface SplitComposeBodyResult {
  /** 사용자가 편집 중인 상단 본문 HTML */
  editableHtml: string;
  /** 사용자가 편집 중인 상단 본문 평문 텍스트 */
  editableText: string;
  /** 보존해야 할 서명 + 원본 인용문 HTML */
  preservedTailHtml: string;
  /** 보존해야 할 서명 + 원본 인용문 평문 텍스트 */
  preservedTailText: string;
  /** 원본 인용문(회신/전달 원문) 평문 텍스트 (AI 초안 생성 컨텍스트용) */
  quotedText: string;
}

/**
 * 간단한 HTML -> 평문 텍스트 변환 (클라이언트 UI 분리/검사용)
 */
export function htmlToPlainText(html: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|blockquote|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 평문 텍스트를 Quill 호환 <p>...</p> HTML로 안전하게 변환
 */
export function plainTextToParagraphHtml(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      if (!line) return '<p><br/></p>';
      const escaped = line
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return `<p>${escaped}</p>`;
    })
    .join('');
}

/**
 * HTML 문자열에서 특정 텍스트가 포함된 블록 시작 태그(<p, <div, <blockquote)의 인덱스를 찾습니다.
 */
function findEnclosingBlockStart(html: string, textIndex: number): number {
  const prefix = html.slice(0, textIndex);
  const candidates = [
    prefix.lastIndexOf('<div'),
    prefix.lastIndexOf('<p'),
    prefix.lastIndexOf('<blockquote'),
  ].filter((idx) => idx >= 0);

  if (candidates.length === 0) return textIndex;
  return Math.max(...candidates);
}

/**
 * 원본 인용문 시작 인덱스 탐색:
 * 1) <div class="quote" ...> 가 그대로 남아있는 경우
 * 2) Quill 등에 의해 <div>가 <p>로 정규화된 경우 마커 텍스트의 블록 시작 위치
 */
function findQuoteStartIndex(html: string): number {
  const divQuoteMatch = /<div\b[^>]*class=["'][^"']*\bquote\b[^"']*["'][^>]*>/i.exec(html);
  if (divQuoteMatch && divQuoteMatch.index >= 0) {
    const before = html.slice(0, divQuoteMatch.index);
    const trailingBrMatch = /(<br\s*\/?>\s*)+$/i.exec(before);
    return trailingBrMatch
      ? divQuoteMatch.index - trailingBrMatch[0].length
      : divQuoteMatch.index;
  }

  let earliestMarkerIdx = -1;
  for (const marker of QUOTE_MARKERS) {
    const idx = html.indexOf(marker);
    if (idx >= 0 && (earliestMarkerIdx === -1 || idx < earliestMarkerIdx)) {
      earliestMarkerIdx = idx;
    }
  }

  if (earliestMarkerIdx >= 0) {
    return findEnclosingBlockStart(html, earliestMarkerIdx);
  }

  return -1;
}

/**
 * 인용문 앞 영역에서 사용자 서명 시작 인덱스를 탐색합니다.
 */
function findSignatureStartIndex(beforeQuoteHtml: string, signatureHtml?: string | null): number {
  if (!signatureHtml || !signatureHtml.trim()) return -1;

  const exactIdx = beforeQuoteHtml.lastIndexOf(signatureHtml);
  if (exactIdx >= 0) {
    const before = beforeQuoteHtml.slice(0, exactIdx);
    const trailingBrMatch = /(<br\s*\/?>\s*)+$/i.exec(before);
    return trailingBrMatch ? exactIdx - trailingBrMatch[0].length : exactIdx;
  }

  const sigLines = htmlToPlainText(signatureHtml)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length >= 2);
  if (sigLines.length === 0) return -1;

  const firstSigLine = sigLines[0];
  const textIdx = beforeQuoteHtml.lastIndexOf(firstSigLine);
  if (textIdx >= 0) {
    return findEnclosingBlockStart(beforeQuoteHtml, textIdx);
  }

  return -1;
}

/**
 * 메일 작성 본문 HTML을 사용자 작성 영역과 보존 영역(서명 + 원본 인용문)으로 분리합니다.
 */
export function splitComposeBody(
  bodyHtml: string,
  signatureHtml?: string | null,
): SplitComposeBodyResult {
  const safeHtml = bodyHtml || '';
  const quoteIdx = findQuoteStartIndex(safeHtml);

  const beforeQuoteHtml = quoteIdx >= 0 ? safeHtml.slice(0, quoteIdx) : safeHtml;
  const quoteTailHtml = quoteIdx >= 0 ? safeHtml.slice(quoteIdx) : '';

  const sigIdx = findSignatureStartIndex(beforeQuoteHtml, signatureHtml);
  const editableHtml = sigIdx >= 0 ? beforeQuoteHtml.slice(0, sigIdx) : beforeQuoteHtml;
  const sigTailHtml = sigIdx >= 0 ? beforeQuoteHtml.slice(sigIdx) : '';

  const preservedTailHtml = `${sigTailHtml}${quoteTailHtml}`;

  return {
    editableHtml,
    editableText: htmlToPlainText(editableHtml),
    preservedTailHtml,
    preservedTailText: htmlToPlainText(preservedTailHtml),
    quotedText: htmlToPlainText(quoteTailHtml),
  };
}
