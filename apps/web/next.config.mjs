/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@lemail/shared-types'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:9200/api/:path*',
      },
    ];
  },
};

export default nextConfig;
