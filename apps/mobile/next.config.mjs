import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// 모노레포 루트 .env를 로드하여 NEXT_PUBLIC_ENABLE_PWA 등 루트 환경 변수를 dev/build 시에도 반영
try {
  const { loadEnvConfig } = require('@next/env');
  const rootDir = path.resolve(__dirname, '../..');
  loadEnvConfig(rootDir, process.env.NODE_ENV !== 'production');
} catch {
  // @next/env 미존재 시 무시
}

/** @type {import('next').NextConfig} */
const internalApiUrl = process.env.INTERNAL_API_URL || 'http://localhost:9200';

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@lemail/shared-types'],
  eslint: {
    ignoreDuringBuilds: true,
  },
  // 개발 서버(next dev)와 프로덕션 빌드(next build)의 캐시 충돌을 방지하기 위해 디렉토리 분리
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  experimental: {
    middlewareClientMaxBodySize: '50mb',
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${internalApiUrl}/api/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/javascript; charset=utf-8',
          },
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
