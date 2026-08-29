import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Serif } from 'next/font/google';

import './globals.css';

/**
 * IBM Plex, três cortes (design-visual.md § 4).
 *
 * `next/font` já vem no Next: auto-hospeda os arquivos, elimina requisição a
 * terceiros e não causa CLS. Nenhum pacote instalado.
 *
 * Plex e não Inter porque foi desenhada para documentação técnica e tem corte
 * serifado de verdade — que é o que sustenta a metáfora de prova tipográfica.
 * Só os pesos que a spec lista.
 */
const sans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-sans',
  display: 'swap',
});

const serif = IBM_Plex_Serif({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-serif',
  display: 'swap',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'CiteScore',
  description:
    'Quanto de um artigo são afirmações sustentadas por dado ou fonte.',
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
