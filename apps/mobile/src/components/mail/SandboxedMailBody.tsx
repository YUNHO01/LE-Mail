'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { sanitizeHtml } from '@/lib/sanitize';

interface SandboxedMailBodyProps {
  html: string;
  className?: string;
  title?: string;
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

  const srcDoc = useMemo(() => {
    const cleanHtml = sanitizeHtml(html);
    const safeId = JSON.stringify(instanceId);

    return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<base target="_blank" />
<style>
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
  }
  table {
    max-width: 100%;
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
})();
</script>
</body>
</html>`;
  }, [html, instanceId]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data;
      if (
        data &&
        data.type === 'lemail-mail-body-height' &&
        data.id === instanceId &&
        typeof data.height === 'number' &&
        Number.isFinite(data.height)
      ) {
        const clamped = Math.max(80, Math.min(20000, Math.ceil(data.height) + 8));
        setHeight(clamped);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [instanceId]);

  return (
    <iframe
      ref={iframeRef}
      title={title}
      srcDoc={srcDoc}
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      className={`w-full border-0 bg-transparent block ${className}`}
      style={{ height: `${height}px` }}
    />
  );
};
