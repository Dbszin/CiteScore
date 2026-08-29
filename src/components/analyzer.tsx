'use client';

import { useEffect, useRef, useState } from 'react';
import type { Analysis } from '../core/domain/analysis.js';
import type { LegendEntry, ScorePanel, Segment } from './report-model.js';
import {
  buildLegend,
  buildRecord,
  buildScorePanel,
  buildSegments,
} from './report-model.js';

/**
 * A tela, conforme `specs/.../ui-relatorio/design-visual.md`.
 *
 * A decisão de O QUE exibir vive em `report-model.ts`, sem React e testada
 * lá. Este arquivo só desenha o que aquele modelo permite.
 *
 * Contrato que vincula (ADR-004 e emenda da ADR-007): a ressalva de
 * metodologia fica acima da dobra e vem do domínio; o breakdown das três
 * categorias é a figura principal; o composto de 0 a 100 vive na ficha
 * técnica e nunca como nota.
 */

type State =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string; readonly retryAfter: number | null }
  | { readonly kind: 'done'; readonly analysis: Analysis };

/** Os estágios reais do pipeline, na ordem em que rodam. */
const STAGES = [
  'Baixando a página',
  'Extraindo o conteúdo principal',
  'Segmentando em sentenças',
  'Classificando cada afirmação',
  'Calculando a proporção',
];

const EXEMPLO = 'https://moz.com/learn/seo/what-is-seo';

export function Analyzer() {
  const [url, setUrl] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });

  async function analisar(alvo: string): Promise<void> {
    setState({ kind: 'loading' });
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: alvo, includeSuggestions: false }),
      });
      const body: unknown = await response.json();

      if (!response.ok) {
        setState({
          kind: 'error',
          message: messageOf(body),
          retryAfter: retryAfterOf(response),
        });
        return;
      }

      const analysis = analysisOf(body);
      if (analysis === null) {
        setState({
          kind: 'error',
          message: 'O servidor devolveu uma resposta que não pôde ser lida.',
          retryAfter: null,
        });
        return;
      }
      setState({ kind: 'done', analysis });
    } catch {
      setState({
        kind: 'error',
        message: 'Não foi possível falar com o servidor. Verifique a conexão.',
        retryAfter: null,
      });
    }
  }

  const carregando = state.kind === 'loading';

  return (
    <>
      <form
        className="query"
        onSubmit={(event) => {
          event.preventDefault();
          void analisar(url);
        }}
      >
        <label className="label" htmlFor="url">
          URL do artigo
        </label>
        <div className="query-row">
          <input
            id="url"
            type="url"
            required
            placeholder="https://exemplo.com/artigo"
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
            }}
            disabled={carregando}
          />
          <button type="submit" disabled={carregando}>
            {carregando ? 'Analisando…' : 'Analisar'}
          </button>
        </div>
      </form>

      {state.kind === 'idle' && (
        <p className="hint">
          Cole o link de um artigo publicado. Sem exemplo à mão?{' '}
          <button
            type="button"
            onClick={() => {
              setUrl(EXEMPLO);
            }}
          >
            use este
          </button>
          .
        </p>
      )}

      {carregando && <Progress />}

      {state.kind === 'error' && (
        <div className="error" role="alert">
          <p>{state.message}</p>
          {state.retryAfter !== null && (
            <p className="error-retry">
              tente novamente em {formatarEspera(state.retryAfter)}
            </p>
          )}
        </div>
      )}

      {state.kind === 'done' && <Report analysis={state.analysis} />}
    </>
  );
}

/**
 * Estágios reais e cronômetro. Sem barra de percentual: a rota devolve tudo
 * de uma vez, e uma barra que progride sozinha seria animação inventada —
 * este produto não inventa medida, nem sobre si mesmo.
 *
 * O cronômetro é informação verdadeira, e é o que distingue "trabalhando" de
 * "travado" numa operação de ~10 segundos.
 */
function Progress() {
  const [segundos, setSegundos] = useState(0);
  const inicio = useRef(Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      setSegundos(Math.floor((Date.now() - inicio.current) / 1000));
    }, 1000);
    return () => {
      clearInterval(id);
    };
  }, []);

  // Os estágios são listados como SEQUÊNCIA, não como posição.
  //
  // Uma versão anterior destacava um deles como "atual" a partir do relógio.
  // Mas a rota devolve tudo de uma vez: o cliente não faz ideia de onde o
  // servidor está. Marcar "Extraindo o conteúdo principal" aos 2 segundos era
  // uma afirmação inventada sobre o estado do sistema — e este produto existe
  // justamente para não afirmar o que não mediu. A regra vale para ele mesmo.
  //
  // O cronômetro é dado verdadeiro, e já resolve "está trabalhando ou travou".
  return (
    <div className="progress" aria-live="polite">
      <div className="progress-head">
        <strong>Analisando</strong>
        <span className="progress-clock">{segundos}s</span>
      </div>
      <p className="stages-intro">
        A classificação é feita por LLM e costuma levar de 10 a 60 segundos.
        O sistema percorre:
      </p>
      <ul className="stages">
        {STAGES.map((stage) => (
          <li className="stage" key={stage}>
            <span className="stage-tick" aria-hidden="true" />
            {stage}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Report({ analysis }: { analysis: Analysis }) {
  const panel = buildScorePanel(analysis);
  const segments = buildSegments(analysis);
  const legend = buildLegend(segments);
  const record = buildRecord(analysis);

  return (
    <>
      <section className="section rise">
        <div className="section-head">
          <h2>A leitura</h2>
        </div>
        <ScorePanelView panel={panel} />

        {analysis.truncated && (
          <p className="warn">
            O artigo excedeu o limite de análise e só a primeira parte foi
            classificada. As proporções descrevem o trecho analisado, não o
            texto inteiro.
          </p>
        )}
        {analysis.suggestionsDegraded && (
          <p className="warn">
            As sugestões de reescrita falharam. O restante do relatório está
            completo.
          </p>
        )}
      </section>

      <section className="section rise">
        <div className="section-head">
          <h2>O texto</h2>
        </div>
        {legend.length > 0 && (
          <div className="legend">
            {legend.map((entry) => (
              <LegendItem key={entry.key} entry={entry} />
            ))}
          </div>
        )}
        <Manuscript segments={segments} />
      </section>

      <section className="record rise" aria-label="Ficha técnica">
        {record.map((row) => (
          <div className="record-row" key={row.key}>
            <span className="record-key">{row.key}</span>
            <span className="record-val">{row.value}</span>
          </div>
        ))}
      </section>
    </>
  );
}

/**
 * O breakdown é a figura principal. O composto de 0 a 100 NÃO aparece aqui —
 * ele está na ficha técnica, conforme a emenda da ADR-007.
 */
function ScorePanelView({ panel }: { panel: ScorePanel }) {
  if (panel.kind === 'unscored') {
    return (
      <div className="unscored">
        <h3>Sem medida para este conteúdo</h3>
        <p>{panel.message}</p>
      </div>
    );
  }

  const descricao = panel.breakdown
    .map((row) => `${row.label}: ${row.percent}`)
    .join(', ');

  return (
    <>
      <div className="reading">
        {panel.breakdown.map((row) => (
          <div className="reading-cell" key={row.category}>
            <div className={`reading-value cat-text-${row.category}`}>
              <span
                className={`stroke-sample cat-${row.category}`}
                aria-hidden="true"
              />
              {row.percent}
            </div>
            <div className="reading-name">{row.label}</div>
            <div className="reading-count">{row.count} sentenças</div>
          </div>
        ))}
      </div>

      <div className="bar" role="img" aria-label={descricao}>
        {panel.breakdown.map((row) => (
          <span
            key={row.category}
            className={`bar-part cat-${row.category}`}
            style={{ width: `${row.share * 100}%` }}
          />
        ))}
      </div>

      <p className="summary">{panel.summary}</p>
    </>
  );
}

function LegendItem({ entry }: { entry: LegendEntry }) {
  return (
    <span className="legend-item">
      <span className={`stroke-sample ${entry.className}`} aria-hidden="true" />
      {entry.label}
    </span>
  );
}

/**
 * O manuscrito: o texto reconstruído trecho a trecho, marcado.
 *
 * Renderizado como TEXTO, nunca como HTML. O conteúdo vem de página arbitrária
 * de terceiro, e injetá-lo como markup seria XSS refletido com passos extras.
 * Há regra de lint bloqueando `dangerouslySetInnerHTML`.
 */
function Manuscript({ segments }: { segments: readonly Segment[] }) {
  return (
    <div className="manuscript">
      {segments.map((segment) => {
        if (segment.kind === 'classified') {
          return (
            <mark
              key={segment.id}
              className={`cat-${segment.category}`}
              title={segment.label}
            >
              {segment.text}{' '}
            </mark>
          );
        }
        return (
          <span key={segment.id} className={segment.kind} title={segment.label}>
            {segment.text}{' '}
          </span>
        );
      })}
    </div>
  );
}

function formatarEspera(segundos: number): string {
  if (segundos < 60) return `${segundos} s`;
  if (segundos < 3600) return `${Math.ceil(segundos / 60)} min`;
  return `${Math.ceil(segundos / 3600)} h`;
}

function retryAfterOf(response: Response): number | null {
  const header = response.headers.get('retry-after');
  if (header === null) return null;
  const segundos = Number(header);
  return Number.isFinite(segundos) && segundos > 0 ? segundos : null;
}

function messageOf(body: unknown): string {
  const error = record(body)?.['error'];
  const message = record(error)?.['message'];
  return typeof message === 'string'
    ? message
    : 'Erro inesperado. Tente novamente.';
}

/**
 * Confere a forma antes de confiar. A rota é nossa, mas um proxy, uma página
 * de erro de CDN ou um deploy pela metade também respondem 200 — e um cast
 * cego transformaria isso em tela branca.
 */
function analysisOf(body: unknown): Analysis | null {
  const analysis = record(body)?.['analysis'];
  const shape = record(analysis);
  if (shape === null) return null;
  if (record(shape['outcome']) === null) return null;
  if (record(shape['breakdown']) === null) return null;
  if (record(shape['methodology']) === null) return null;
  if (!Array.isArray(shape['sentences'])) return null;
  if (!Array.isArray(shape['classifications'])) return null;
  return analysis as Analysis;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}
