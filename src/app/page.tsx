import { Analyzer } from '../components/analyzer.js';
import { DISCLAIMER_PT_BR } from '../core/domain/methodology.js';

/**
 * A ressalva de metodologia é renderizada aqui, acima do formulário e antes
 * de qualquer resultado — o usuário a lê antes de existir número nenhum na
 * tela, e ela não depende de scroll.
 *
 * O texto vem do domínio, não desta página: a ADR-004 faz da ressalva um
 * campo obrigatório do contrato justamente para que ela não possa ser
 * removida por um redesign de UI.
 */
export default function Home() {
  return (
    <main className="page">
      <h1>CiteScore</h1>
      <p className="tagline">
        Quanto de um artigo são afirmações sustentadas por dado ou fonte.
      </p>

      <div className="disclaimer">
        <strong>Como ler este resultado</strong>
        {DISCLAIMER_PT_BR}
      </div>

      <Analyzer />
    </main>
  );
}
