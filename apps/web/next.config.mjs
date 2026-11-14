/** @type {import('next').NextConfig} */
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
        destination: 'http://localhost:9200/api/:path*',
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
