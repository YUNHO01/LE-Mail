'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { sanitizeHtml } from '@/lib/sanitize';
import { ImageLightboxModal, LightboxImageItem } from './ImageLightboxModal';

interface SandboxedMailBodyProps {
  html: string;
  className?: string;
  title?: string;
}

function isSafeImageSrc(src: unknown): src is string {
  if (typeof src !== 'string') return false;
  const trimmed = src.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/')) return true;
  const lower = trimmed.toLowerCase();
  return (
    lower.startsWith('https://') ||
    lower.startsWith('http://') ||
    lower.startsWith('data:image/') ||
    lower.startsWith('blob:')
  );
}

/**
 * 메일 HTML 본문을 sandbox iframe(allow-same-origin 제외)에 격리 렌더링합니다.
 * 부모 창의 DOM, localStorage, 쿠키 접근을 원천 차단하면서 콘텐츠 높이에 맞게 자동 리사이즈합니다.
 */
export const SandboxedMailBody: React.FC<SandboxedMailBodyProps> = ({
  html,
  className = '',
  title = '메일 본문',
}) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const instanceId = useId();
  const [height, setHeight] = useState<number>(200);
  const [lightbox, setLightbox] = useState<{
    images: LightboxImageItem[];
    index: number;
  } | null>(null);

  const srcDoc = useMemo(() => {
    const cleanHtml = sanitizeHtml(html);
    const safeId = JSON.stringify(instanceId);
    const origin = typeof window !== 'undefined' ? window.location.origin : '';

    return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<base target="_blank" />
<style>
  @font-face {
    font-family: 'Nanum Gothic';
    src: url('${origin}/fonts/NanumGothic.woff2') format('woff2');
    font-weight: 400;
    font-style: normal;
    font-display: swap;
  }
  @font-face {
    font-family: 'Nanum Myeongjo';
    src: url('${origin}/fonts/NanumMyeongjo.woff2') format('woff2');
    font-weight: 400;
    font-style: normal;
    font-display: swap;
  }
  @font-face {
    font-family: 'NanumBarunGothic';
    src: url('${origin}/fonts/NanumBarunGothic.woff2') format('woff2');
    font-weight: 400;
    font-style: normal;
    font-display: swap;
  }
  @font-face {
    font-family: 'Nanum Pen Script';
    src: url('${origin}/fonts/NanumPenScript.woff2') format('woff2');
    font-weight: 400;
    font-style: normal;
    font-display: swap;
  }
  html, body {
    margin: 0;
    padding: 0;
    background: transparent;
    color: #1d1d1f;
    font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Pretendard", "Noto Sans KR", sans-serif;
    font-size: 14px;
    line-height: 1.65;
    word-break: break-word;
    overflow-wrap: anywhere;
  }
  img {
    max-width: 100%;
    height: auto;
    cursor: zoom-in;
  }
  a[href] img {
    cursor: pointer;
  }
  table {
    max-width: 100%;
  }
  table:has(td[data-row], th[data-row]),
  table[border]:not([border="0"]) {
    border-collapse: collapse;
  }
  td[data-row],
  th[data-row],
  table[border]:not([border="0"]) td,
  table[border]:not([border="0"]) th {
    border: 1px solid #cbd5e1;
    padding: 6px 10px;
    vertical-align: top;
  }
  pre, code {
    white-space: pre-wrap;
    word-break: break-word;
  }
  blockquote {
    margin: 0.75em 0;
    padding-left: 0.9em;
    border-left: 3px solid rgba(0, 0, 0, 0.14);
    color: #555;
  }
  a {
    color: #0071e3;
  }
</style>
</head>
<body>
<div id="__lemail_root">${cleanHtml}</div>
<script>
(function() {
  var id = ${safeId};
  var lastHeight = 0;
  function postHeight() {
    var root = document.getElementById('__lemail_root');
    var h = Math.max(
      root ? root.scrollHeight : 0,
      document.body ? document.body.scrollHeight : 0,
      document.documentElement ? document.documentElement.scrollHeight : 0
    );
    if (h > 0 && h !== lastHeight) {
      lastHeight = h;
      window.parent.postMessage({ type: 'lemail-mail-body-height', id: id, height: h }, '*');
    }
  }
  if (typeof ResizeObserver !== 'undefined') {
    var ro = new ResizeObserver(postHeight);
    ro.observe(document.documentElement);
  }
  window.addEventListener('load', postHeight);
  setTimeout(postHeight, 50);
  setTimeout(postHeight, 250);

  function isExpandableImage(img) {
    if (!img || img.tagName !== 'IMG') return false;
    if (img.closest && img.closest('a[href]')) return false;
    var src = img.currentSrc || img.getAttribute('src') || '';
    if (!src) return false;
    var w = img.naturalWidth || img.clientWidth || 0;
    var h = img.naturalHeight || img.clientHeight || 0;
    if (w > 0 && h > 0 && w <= 16 && h <= 16) return false;
    return true;
  }

  var rootEl = document.getElementById('__lemail_root');
  if (rootEl) {
    rootEl.addEventListener('click', function(e) {
      var target = e.target;
      var img = target && target.closest ? target.closest('img') : (target && target.tagName === 'IMG' ? target : null);
      if (!isExpandableImage(img)) return;

      var allImgs = rootEl.querySelectorAll('img');
      var images = [];
      var clickedIndex = 0;
      for (var i = 0; i < allImgs.length; i++) {
        var item = allImgs[i];
        if (!isExpandableImage(item)) continue;
        var itemSrc = item.currentSrc || item.getAttribute('src') || '';
        if (item === img) {
          clickedIndex = images.length;
        }
        images.push({ src: itemSrc, alt: item.getAttribute('alt') || '' });
      }
      if (images.length > 0) {
        e.preventDefault();
        window.parent.postMessage({
          type: 'lemail-mail-body-image-click',
          id: id,
          images: images,
          index: clickedIndex
        }, '*');
      }
    });
  }
})();
</script>
</body>
</html>`;
  }, [html, instanceId]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const rawData: unknown = event.data;
      if (!rawData || typeof rawData !== 'object') return;
      const data = rawData as {
        id?: unknown;
        type?: unknown;
        height?: unknown;
        images?: unknown;
        index?: unknown;
      };
      if (data.id !== instanceId) return;

      if (
        data.type === 'lemail-mail-body-height' &&
        typeof data.height === 'number' &&
        Number.isFinite(data.height)
      ) {
        const clamped = Math.max(
          80,
          Math.min(20000, Math.ceil(data.height) + 8),
        );
        setHeight(clamped);
        return;
      }

      if (
        data.type === 'lemail-mail-body-image-click' &&
        Array.isArray(data.images)
      ) {
        const rawIndex =
          typeof data.index === 'number' && Number.isInteger(data.index)
            ? data.index
            : 0;
        const safeImages: LightboxImageItem[] = [];
        let safeIndex = 0;

        (data.images as unknown[]).forEach((item: unknown, idx: number) => {
          if (!item || typeof item !== 'object') return;
          const record = item as { src?: unknown; alt?: unknown };
          if (!isSafeImageSrc(record.src)) return;
          if (idx === rawIndex) {
            safeIndex = safeImages.length;
          }
          safeImages.push({
            src: record.src.trim(),
            alt: typeof record.alt === 'string' ? record.alt : '',
          });
        });

        if (safeImages.length > 0) {
          setLightbox({ images: safeImages, index: safeIndex });
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [instanceId]);

  return (
    <>
      <iframe
        ref={iframeRef}
        title={title}
        srcDoc={srcDoc}
        data-testid="mail-body-iframe"
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
        className={`w-full border-0 bg-transparent block ${className}`}
        style={{ height: `${height}px` }}
      />
      <ImageLightboxModal
        isOpen={!!lightbox}
        images={lightbox?.images ?? []}
        initialIndex={lightbox?.index ?? 0}
        onClose={() => setLightbox(null)}
      />
    </>
  );
};
