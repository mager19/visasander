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
    return [{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }];
  },
};

export default config;
