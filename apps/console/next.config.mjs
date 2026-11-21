const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  {
    key: 'Content-Security-Policy',
    value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self';",
  },
];

const internalApiUrl = (process.env.INTERNAL_API_URL || 'http://localhost:9200').replace(/\/$/, '');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@lemail/shared-types'],
  eslint: {
    ignoreDuringBuilds: true,
  },
  // 개발 서버(next dev)와 프로덕션 빌드(next build)의 캐시 충돌을 방지하기 위해 디렉토리 분리
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  experimental: {
    middlewareClientMaxBodySize: '50mb',
  },
  async redirects() {
    return [
      {
        source: '/admin',
        destination: '/dashboard',
        permanent: true,
      },
      {
        source: '/admin/:path*',
        destination: '/:path*',
        permanent: true,
      },
    ];
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
        source: '/(.*)',
        headers: securityHeaders,
      },
      {
        source: '/fonts/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
