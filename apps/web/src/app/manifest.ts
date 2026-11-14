import type { MetadataRoute } from 'next';
import { getServerBrandName } from '../lib/brand';

export const dynamic = 'force-dynamic';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const brandName = await getServerBrandName();

  return {
    name: brandName,
    short_name: brandName,
    description: `${brandName} 엔터프라이즈 웹메일 및 관리자 콘솔`,
    start_url: '/mail/inbox',
    scope: '/',
    display: 'standalone',
    background_color: '#f5f5f7',
    theme_color: '#0071e3',
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
