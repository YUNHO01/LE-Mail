import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'LEMail 모바일 웹메일',
    short_name: 'LEMail',
    description: 'LEMail 외부 접속용 모바일 웹메일 서비스',
    start_url: '/mail/inbox',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F2F2F7',
    theme_color: '#007AFF',
    lang: 'ko',
    icons: [
      {
        src: '/icons/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: '받은메일함',
        short_name: '받은메일',
        url: '/mail/inbox',
        icons: [{ src: '/icons/icon-192x192.png', sizes: '192x192' }],
      },
      {
        name: '새 메일 쓰기',
        short_name: '메일 쓰기',
        url: '/mail/compose',
        icons: [{ src: '/icons/icon-192x192.png', sizes: '192x192' }],
      },
    ],
  };
}
