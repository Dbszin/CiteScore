import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // design.md: a rota de analise roda no runtime Node, nao Edge.
  // O Readability precisa de implementacao de DOM, que o Edge nao oferece.
  serverExternalPackages: ['jsdom', 'linkedom', '@mozilla/readability'],

  /**
   * O projeto importa com extensão `.js` mesmo em arquivos `.ts` — é o que a
   * resolução ESM de `moduleResolution: bundler` espera, e é o que `tsc`,
   * `vitest` e `tsx` já entendiam. O resolvedor do webpack, não: ele procurava
   * um `.js` literal e falhava com `Module not found` no primeiro import da
   * rota.
   *
   * `extensionAlias` reconcilia os dois sem que o código precise de duas
   * convenções de import conforme quem vai compilá-lo.
   */
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;
