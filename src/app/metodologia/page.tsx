import type { Metadata } from 'next';

import { Diamond, ExternalLink } from '../../components/icons.js';
import { PT_BR_SIGNALS } from '../../adapters/classify/signals/pt-br.js';
import { EN_SIGNALS } from '../../adapters/classify/signals/en.js';
import { DISCLAIMER_PT_BR } from '../../core/domain/methodology.js';
import {
  MIN_ANALYZABLE_RATIO,
  MIN_ANALYZABLE_SENTENCES,
  SCORE_VERSION,
  WEIGHTS,
} from '../../core/scoring/weights.js';
import { UNSCORED_MESSAGE } from '../../components/report-model.js';

/**
 * A página de metodologia.
 *
 * A ADR-004 item 4 exige que a metodologia esteja a um clique do resultado, e
 * nomeia três coisas: **quais sinais, como o score é calculado, o que não foi
 * medido**. A seção da home cobria só a terceira, e o link apontava para uma
 * rota que nunca existiu — dava 404. Esta página fecha isso.
 *
 * ⚠️ TUDO AQUI VEM DE `import`, NÃO DE TEXTO DIGITADO.
 *
 * Os pesos, os limiares, a lista de sinais e a ressalva são lidos do código
 * que roda. Uma página de metodologia que repete valores à mão é a próxima a
 * ficar desatualizada — e desta vez o erro seria caro, porque ela existe
 * exatamente para ser a fonte de verdade sobre o método. Mudar um peso sem
 * mexer aqui é impossível: o número muda sozinho.
 */

export const metadata: Metadata = {
  title: 'Metodologia — CiteScore',
  description:
    'Quais sinais o CiteScore detecta, como a proporção é calculada, e o que ' +
    'ele explicitamente não mede.',
};

const GRUPOS = [
  {
    titulo: 'Pró-fonte',
    kinds: ['source_quantity', 'source_date', 'source_attribution', 'source_quote'],
    nota: 'Indícios de que a frase traz dado, data, atribuição nomeada ou citação.',
  },
  {
    titulo: 'Pró-opinião',
    kinds: ['opinion_first_person', 'opinion_imperative', 'opinion_adjective'],
    nota: 'Indícios de juízo de valor. Não decidem sozinhos — ver a nota abaixo.',
  },
  {
    titulo: 'Hedge',
    kinds: ['hedge_modal', 'hedge_vague_quantifier', 'hedge_false_authority'],
    nota: 'Linguagem que enfraquece a afirmação: "pode", "muitos", "especialistas dizem".',
  },
  {
    titulo: 'Desqualificador',
    kinds: ['attribution_disqualifier'],
    nota: 'Anula um sinal pró-fonte que casou por engano — "segundo lugar" não é atribuição.',
  },
] as const;

export default function Metodologia() {
  const pesoDensidade = WEIGHTS.factualDensity;
  const pesoLacuna = WEIGHTS.gapComplement;

  return (
    <>
      <header className="topbar">
        <div className="shell topbar-in">
          <a className="wordmark" href="/">
            <Diamond size={13} />
            CiteScore
          </a>
          <nav className="topnav" aria-label="Seções">
            <a href="/">Voltar</a>
            <a
              href="https://github.com/Dbszin/CiteScore"
              target="_blank"
              rel="noopener noreferrer"
            >
              Código
              <ExternalLink />
            </a>
          </nav>
        </div>
      </header>

      <main className="shell section">
        <div className="section-head">
          <span className="eyebrow">Metodologia</span>
          <h1 className="display-2">Como a medição é feita, e onde ela para.</h1>
          <p className="prose" style={{ marginTop: 'var(--space-4)' }}>
            Esta página é gerada a partir do código que roda. Os pesos, os
            limiares e a lista de sinais abaixo são lidos das mesmas constantes
            que o sistema usa para medir — não são uma cópia mantida à mão.
          </p>
        </div>

        {/* ─── 1. O que é medido ─────────────────────────────────── */}
        <h2 className="display-2" style={{ marginTop: 'var(--space-16)' }}>
          O que é medido
        </h2>
        <p className="prose" style={{ marginTop: 'var(--space-4)' }}>
          Cada sentença analisável recebe uma de três categorias. A partir da
          contagem saem duas medidas diretas, e delas um número composto.
        </p>

        <div className="record" style={{ marginTop: 'var(--space-6)' }}>
          <div className="record-row meta">
            <span className="record-key">densidade</span>
            <span className="record-val">
              com fonte ÷ analisáveis
            </span>
          </div>
          <div className="record-row meta">
            <span className="record-key">lacuna</span>
            <span className="record-val">
              sem fonte ÷ (com fonte + sem fonte) — opinião fora do denominador
            </span>
          </div>
          <div className="record-row meta">
            <span className="record-key">composto</span>
            <span className="record-val">
              {`100 × (${pesoDensidade} × densidade + ${pesoLacuna} × (1 − lacuna))`}
            </span>
          </div>
          <div className="record-row meta">
            <span className="record-key">versão</span>
            <span className="record-val">{SCORE_VERSION}</span>
          </div>
        </div>

        <p className="prose small" style={{ marginTop: 'var(--space-4)' }}>
          Opinião fica fora do denominador da lacuna de propósito: opinião
          rotulada não é afirmação pendente, e incluí-la acusaria o autor de
          algo que ele não fez.
        </p>

        <div className="warn" style={{ margin: 'var(--space-6) 0 0' }}>
          <span>
            <strong>O composto não está calibrado, e por isso não é a figura
            principal da tela.</strong>{' '}
            Os pesos {pesoDensidade} e {pesoLacuna} foram um ponto de partida, não
            um resultado — e a régua se mostrou comprimida: o artigo escolhido no
            corpus como modelo de bom conteúdo factual tira um número baixo. Ele
            vive na ficha técnica, do tamanho de um número de build, com a
            ressalva de escala não calibrada. A figura principal é a proporção
            das três categorias, que é medição direta e não precisa de
            calibração.
          </span>
        </div>

        {/* ─── 2. Quais sinais ───────────────────────────────────── */}
        <h2 className="display-2" style={{ marginTop: 'var(--space-16)' }}>
          Quais sinais são detectados
        </h2>
        <p className="prose" style={{ marginTop: 'var(--space-4)' }}>
          Um pré-filtro determinístico varre cada sentença atrás de padrões
          linguísticos. São {PT_BR_SIGNALS.signals.length} sinais em português e{' '}
          {EN_SIGNALS.signals.length} em inglês, mantidos como tabela de dados
          versionada — ajustar a calibração é editar tabela, não caçar condicional
          pelo código.
        </p>

        <div className="steps" style={{ marginTop: 'var(--space-6)' }}>
          {GRUPOS.map((grupo) => (
            <div className="step" key={grupo.titulo}>
              <h3 className="step-name">{grupo.titulo}</h3>
              <p style={{ marginBottom: 'var(--space-3)' }}>{grupo.nota}</p>
              <ul className="ledger-lista">
                {PT_BR_SIGNALS.signals
                  .filter((sinal) => (grupo.kinds as readonly string[]).includes(sinal.kind))
                  .map((sinal) => (
                    <li className="meta" key={sinal.name}>
                      {sinal.name}
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="warn" style={{ margin: 'var(--space-8) 0 0' }}>
          <span>
            <strong>O pré-filtro NÃO decide a categoria — ele anota.</strong>{' '}
            O desenho original previa que ele resolveria metade das sentenças sem
            LLM. A calibração sobre 2.149 sentenças de 11 artigos reais mediu{' '}
            <strong>0,3%</strong>: atribuição nomeada aparece em 0,4% da prosa
            real, e o sinal de primeira pessoa avaliativa ocorreu{' '}
            <strong>zero</strong> vezes. A premissa vinha de sentenças de exemplo,
            que contêm marcadores porque foram escritas para contê-los. A meta foi
            retirada, e hoje toda decisão de categoria é do modelo — os sinais
            servem para explicar por que uma sentença foi marcada assim.
          </span>
        </div>

        {/* ─── 3. Quando não há medida ───────────────────────────── */}
        <h2 className="display-2" style={{ marginTop: 'var(--space-16)' }}>
          Quando ele se recusa a medir
        </h2>
        <p className="prose" style={{ marginTop: 'var(--space-4)' }}>
          Ausência de medida é resultado de primeira classe, não zero. Zero é uma
          medição; não medir é outra coisa.
        </p>

        <div className="record" style={{ marginTop: 'var(--space-6)' }}>
          <div className="record-row meta">
            <span className="record-key">texto curto</span>
            <span className="record-val">
              menos de {MIN_ANALYZABLE_SENTENCES} sentenças analisáveis —{' '}
              {UNSCORED_MESSAGE.INSUFFICIENT_CONTENT}
            </span>
          </div>
          <div className="record-row meta">
            <span className="record-key">sem afirmação</span>
            <span className="record-val">{UNSCORED_MESSAGE.NO_CLAIMS_FOUND}</span>
          </div>
          <div className="record-row meta">
            <span className="record-key">inconsistente</span>
            <span className="record-val">{UNSCORED_MESSAGE.INCONSISTENT_INPUT}</span>
          </div>
          <div className="record-row meta">
            <span className="record-key">página-índice</span>
            <span className="record-val">
              menos de {Math.round(MIN_ANALYZABLE_RATIO * 100)}% dos blocos são
              sentenças analisáveis. Home de portal passa pela extração com
              centenas de manchetes soltas, e medir ali produziria falha
              silenciosa — pior que erro, porque parece resultado
            </span>
          </div>
        </div>

        <p className="prose small" style={{ marginTop: 'var(--space-4)' }}>
          Acima desse limiar mas abaixo da metade, a análise acontece e a tela{' '}
          <strong>avisa</strong> quantos blocos entraram na conta.
        </p>

        {/* ─── 4. O que não é medido ─────────────────────────────── */}
        <h2 className="display-2" style={{ marginTop: 'var(--space-16)' }}>
          O que ele não mede
        </h2>

        <div className="panel" style={{ marginTop: 'var(--space-6)' }}>
          <div className="method">
            <p>{DISCLAIMER_PT_BR}</p>
          </div>
        </div>

        <p className="prose" style={{ marginTop: 'var(--space-6)' }}>
          Esse texto não é copy desta página: ele é campo obrigatório do payload
          da API, com teste que falha se sumir. A razão é que ressalva que vive
          só na interface morre em três movimentos previsíveis — um redesign que
          limpa a tela, um print que corta o rodapé, uma página nova escrita por
          outra pessoa.
        </p>

        <p className="prose" style={{ marginTop: 'var(--space-4)' }}>
          Também não são medidos: posição no Google, volume de tráfego, qualidade
          da escrita, e se a fonte citada é <em>confiável</em> — apenas que ela
          existe.
        </p>

        <p className="small" style={{ marginTop: 'var(--space-12)' }}>
          <a
            href="https://github.com/Dbszin/CiteScore/tree/main/specs/decisions"
            target="_blank"
            rel="noopener noreferrer"
          >
            As decisões de projeto, com o que foi medido e o que foi rejeitado
            <ExternalLink />
          </a>
        </p>
      </main>

      <footer className="shell foot">
        <div className="foot-bottom">
          <span>Construído por Douglas Batista · 2026</span>
          <a href="/">Voltar ao analisador</a>
        </div>
      </footer>
    </>
  );
}
