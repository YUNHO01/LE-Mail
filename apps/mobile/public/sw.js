const CACHE_VERSION = 'lemail-mobile-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const OFFLINE_URL = '/offline';

const PRECACHE_URLS = [
  OFFLINE_URL,
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch(() => {
        // 개별 프리캐시 실패가 설치 전체를 막지 않도록 방어
      });
    }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('lemail-mobile-') && key !== STATIC_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('lemail-mobile-'))
            .map((key) => caches.delete(key)),
        ),
      ),
    );
  }
});

function isStaticAsset(pathname) {
  return (
    pathname.startsWith('/_next/static/') ||
    pathname.startsWith('/icons/') ||
    pathname.startsWith('/images/')
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 민감한 API 응답 및 SW/Manifest 자체는 절대 캐시하지 않음
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname === '/sw.js' ||
    url.pathname === '/manifest.webmanifest'
  ) {
    return;
  }

  // 정적 불변 에셋: Cache-First
  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      }),
    );
    return;
  }

  // 페이지 내비게이션: Network-First + 오프라인 폴백
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cachedOffline = await caches.match(OFFLINE_URL);
        if (cachedOffline) return cachedOffline;
        return new Response('오프라인 상태입니다. 네트워크 연결을 확인해 주세요.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }),
    );
  }
});
