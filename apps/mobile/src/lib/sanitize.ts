import DOMPurify from 'dompurify';

let hookRegistered = false;

function ensureSanitizeHook() {
  if (hookRegistered || typeof window === 'undefined') return;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer nofollow');
    }
  });
  hookRegistered = true;
}

/**
 * 이메일 본문 및 서식 HTML을 안전하게 살균(Sanitize)하여 XSS 취약점을 차단합니다.
 */
export function sanitizeHtml(rawHtml: string): string {
  if (!rawHtml || typeof rawHtml !== 'string') {
    return '';
  }

  if (typeof window === 'undefined') {
    return rawHtml
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
  }

  ensureSanitizeHook();

  return DOMPurify.sanitize(rawHtml, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target', 'rel'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'],
    FORBID_ATTR: [
      'onerror',
      'onload',
      'onclick',
      'onmouseover',
      'onfocus',
      'action',
      'formaction',
    ],
  });
}

/**
 * Quill 에디터로 작성된 표(data-row 속성 포함)에 인라인 border/padding 스타일을 보정하여
 * 외부 메일 클라이언트 및 메일 뷰어에서도 표 테두리가 정상 표시되도록 합니다.
 */
export function ensureMailTableBorders(rawHtml: string): string {
  if (!rawHtml || typeof rawHtml !== 'string' || typeof window === 'undefined') {
    return rawHtml;
  }
  if (!rawHtml.includes('<table') && !rawHtml.includes('<TABLE')) {
    return rawHtml;
  }

  const doc = new DOMParser().parseFromString(rawHtml, 'text/html');
  const quillCells = doc.querySelectorAll('td[data-row], th[data-row]');
  if (quillCells.length === 0) {
    return rawHtml;
  }

  quillCells.forEach((cell) => {
    const el = cell as HTMLElement;
    const table = el.closest('table') as HTMLElement | null;
    if (table) {
      if (
        table.getAttribute('role') === 'presentation' ||
        table.getAttribute('border') === '0'
      ) {
        return;
      }
      if (!table.style.borderCollapse) {
        table.style.borderCollapse = 'collapse';
      }
    }
    if (!el.style.border) {
      el.style.border = '1px solid #cbd5e1';
    }
    if (!el.style.padding) {
      el.style.padding = '6px 10px';
    }
  });

  return doc.body.innerHTML;
}
