import type { NextConfig } from 'next';

const managerPath = process.env.NEXT_PUBLIC_MANAGER_PATH || 'gestor';

const config: NextConfig = {
  async rewrites() {
    return [
      { source: `/${managerPath}`, destination: '/manager' },
      { source: `/${managerPath}/:path*`, destination: '/manager/:path*' },
    ];
  },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
    ] }];
  },
};

export default config;
