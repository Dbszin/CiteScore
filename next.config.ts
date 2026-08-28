import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // design.md: a rota de analise roda no runtime Node, nao Edge.
  // O Readability precisa de implementacao de DOM, que o Edge nao oferece.
  serverExternalPackages: ['jsdom', 'linkedom', '@mozilla/readability'],
};

export default nextConfig;
