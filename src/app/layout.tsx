import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Archivo, JetBrains_Mono, Source_Serif_4 } from 'next/font/google';

import './globals.css';

/**
 * As três famílias de `design-visual-2.md` § 4, via `next/font/google`:
 * auto-hospedadas, sem requisição a terceiro, sem CLS, ZERO dependência
 * instalada.
 *
 * Todas as três são variáveis, então `weight` é omitido de propósito — um
 * arquivo por família cobre 400, 500 e 600, que é o orçamento que a spec pede,
 * por menos bytes que três cortes estáticos.
 *
 * IBM Plex saiu inteiro. Archivo em vez de Inter porque é grotesca de formas
 * estreitas, desenhada para funcionar com tracking negativo em tamanho grande.
 * Source Serif no manuscrito e sans na interface é semântica, não enfeite:
 * distingue o texto do usuário da voz do sistema.
 */
const sans = Archivo({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const serif = Source_Serif_4({
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

/*
 * `metadataBase` existe para a OG image resolver URL ABSOLUTA. Sem ele o Next
 * cai em `http://localhost:3000`, e o card no LinkedIn quebraria justamente
 * no ambiente em que ele importa.
 *
 * `VERCEL_PROJECT_PRODUCTION_URL` vem preenchida no deploy; local cai no
 * localhost, que e' o certo para local.
 */
const base =
  process.env['VERCEL_PROJECT_PRODUCTION_URL'] !== undefined
    ? `https://${process.env['VERCEL_PROJECT_PRODUCTION_URL']}`
    : 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(base),
  title: 'CiteScore — análise de densidade factual',
  description:
    'Cada afirmação do seu artigo, classificada em três: tem dado ou fonte, ' +
    'não tem, ou é opinião. Densidade de fonte é uma das alavancas mais ' +
    'fortes de GEO — e é a que dá para medir frase a frase.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="pt-BR"
      className={`${sans.variable} ${serif.variable} ${mono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
