import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: 'CiteScore',
  description:
    'Mede a densidade factual de um artigo: quanto do texto sao afirmacoes sustentadas por dado ou fonte.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
