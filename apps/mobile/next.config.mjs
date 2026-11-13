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
};

export default nextConfig;
