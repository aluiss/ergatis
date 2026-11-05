import type { NextConfig } from 'next';

const apiUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:3333';

const config: NextConfig = {
  transpilePackages: ['@ergatis/shared'],
  // Site e API na mesma origem: os cookies de sessão funcionam sem configuração entre domínios.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  },
};

export default config;
