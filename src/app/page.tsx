import { Analyzer } from '../components/analyzer.js';
import { DISCLAIMER_PT_BR } from '../core/domain/methodology.js';

/**
 * A ressalva de metodologia é renderizada aqui, acima do formulário e antes de
 * qualquer resultado — o leitor a encontra antes de existir número nenhum na
 * tela, e ela não depende de scroll.
 *
 * O texto vem do domínio, não desta página: a ADR-004 faz da ressalva um campo
 * obrigatório do contrato justamente para que ela não possa ser removida por
 * um redesign de UI. Este arquivo a exibe; não a escreve.
 */
export default function Home() {
  return (
    <main className="page">
      <header className="masthead">
        <div>
          <h1>CiteScore</h1>
          <p className="tagline">
            Quanto de um artigo são afirmações sustentadas por fonte.
          </p>
        </div>
      </header>

      <div className="notice-method">
        <span className="label">Como ler este resultado</span>
        {DISCLAIMER_PT_BR}
      </div>

      <Analyzer />
    </main>
  );
}
