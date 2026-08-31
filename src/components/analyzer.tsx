'use client';

import { useEffect, useRef, useState } from 'react';
import type { Analysis } from '../core/domain/analysis.js';
import type { SentenceId } from '../core/domain/sentence.js';
import { Alert, ArrowRight, Close, ExternalLink, Info } from './icons.js';
import type { LegendEntry, ScorePanel, Segment } from './report-model.js';
import {
  buildLegend,
  buildRecord,
  buildScorePanel,
  buildSegments,
} from './report-model.js';

/**
 * A ferramenta e o resultado, conforme `design-visual-2.md` § 8 e § 9.
 *
 * A decisão de O QUE exibir vive em `report-model.ts`, sem React e testada
 * lá. Este arquivo só desenha o que aquele modelo permite.
 *
 * Contratos que vinculam:
 * - **ADR-004:** a ressalva integral vem do domínio e é o PRIMEIRO filho do
 *   painel de resultado, dentro da mesma borda, no mesmo nível hierárquico.
 *   Ao concluir, o topo do painel vai ao topo da viewport — então ela é a
 *   primeira coisa visível na região, sem scroll adicional.
 * - **Emenda da ADR-007:** o breakdown das três categorias é a figura
 *   principal. O composto de 0 a 100 não aparece aqui; ele vive na ficha
 *   técnica, e `ScorePanel` nem o carrega.
 */

type State =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | {
      readonly kind: 'error';
      readonly message: string;
      readonly retryAfter: number | null;
      readonly retryable: boolean;
    }
  | { readonly kind: 'done'; readonly analysis: Analysis };

/** Os estágios reais do pipeline, na ordem em que rodam. */
const STAGES = [
  'Baixa a página',
  'Extrai o conteúdo principal',
  'Segmenta em sentenças',
  'Classifica cada afirmação',
  'Calcula a proporção',
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
          retryable: false,
        });
        return;
      }

      const analysis = analysisOf(body);
      if (analysis === null) {
        setState({
          kind: 'error',
          message: 'O servidor devolveu uma resposta que não pôde ser lida.',
          retryAfter: null,
          retryable: true,
        });
        return;
      }
      setState({ kind: 'done', analysis });
    } catch {
      setState({
        kind: 'error',
        message: 'Não foi possível falar com o servidor. Verifique a conexão.',
        retryAfter: null,
        retryable: true,
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
        {/* Rótulo real e visível, não placeholder como rótulo: placeholder
            desaparece ao digitar e leitor de tela pode ignorá-lo. */}
        <label className="field-label" htmlFor="url">
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
          <button className="btn" type="submit" disabled={carregando}>
            {carregando ? 'Analisando…' : 'Analisar'}
            {!carregando && <ArrowRight />}
          </button>
        </div>
      </form>

      <p className="hint">
        Sem cadastro · 10 análises por hora
        {state.kind === 'idle' && (
          <>
            {' · sem exemplo à mão? '}
            <button
              className="btn-text"
              type="button"
              onClick={() => {
                setUrl(EXEMPLO);
              }}
            >
              use este
            </button>
          </>
        )}
      </p>

      {carregando && <Progress />}

      {state.kind === 'error' && (
        <div className="error" role="alert">
          <h3>Não deu para analisar</h3>
          <p>{state.message}</p>
          {state.retryAfter !== null && (
            <p className="error-retry meta">
              tente novamente em {formatarEspera(state.retryAfter)}
            </p>
          )}
          {state.retryable && (
            <div className="error-actions">
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => {
                  void analisar(url);
                }}
              >
                Tentar de novo
              </button>
            </div>
          )}
        </div>
      )}

      {state.kind === 'done' && <Report analysis={state.analysis} />}
    </>
  );
}

/**
 * Cronômetro e a sequência de estágios.
 *
 * Sem barra de percentual e sem estágio marcado como "atual": a rota devolve
 * tudo de uma vez, e o cliente não tem como saber onde o servidor está.
 * Marcar um passo como concluído seria afirmar estado que não foi medido — num
 * produto cuja tese é justamente não fazer isso. A varredura no topo é
 * indeterminada por construção: afirma atividade, não progresso.
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

  return (
    <div className="progress" aria-live="polite">
      <div className="sweep" aria-hidden="true">
        <span />
      </div>
      <div className="progress-body">
        <div className="progress-head">
          <strong>Analisando</strong>
          <span className="clock">{segundos}s</span>
        </div>
        <p className="stages-intro">
          A classificação é feita por LLM e costuma levar de 10 a 60 segundos. O
          sistema percorre:
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
    </div>
  );
}

function Report({ analysis }: { analysis: Analysis }) {
  const panel = buildScorePanel(analysis);
  const segments = buildSegments(analysis);
  const legend = buildLegend(segments);
  const record = buildRecord(analysis);
  const alvo = useRef<HTMLDivElement>(null);

  /*
   * Traz o TOPO do painel ao topo da viewport. É o que satisfaz "legível sem
   * scroll" da ADR-004: a ressalva é o primeiro filho do painel, então ela
   * fica visível sem nenhum scroll adicional. `scroll-margin-top` no CSS
   * impede que o topbar sticky a cubra.
   *
   * O foco vai para a região para que leitor de tela anuncie a chegada — a
   * análise leva dezenas de segundos e o usuário pode ter saído da aba.
   */
  useEffect(() => {
    const node = alvo.current;
    if (node === null) return;
    const reduz =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    node.scrollIntoView({ behavior: reduz ? 'auto' : 'smooth', block: 'start' });
    node.focus({ preventScroll: true });
  }, []);

  return (
    <div className="result" ref={alvo} tabIndex={-1} aria-label="Resultado da análise">
      <div className="panel rise">
        <Method url={analysis.methodology.methodologyUrl} text={analysis.methodology.disclaimer} />

        {analysis.truncated && (
          <p className="warn">
            <Alert />
            <span>
              O artigo excedeu o limite de análise e só a primeira parte foi
              classificada. As proporções descrevem o trecho analisado, não o
              texto inteiro.
            </span>
          </p>
        )}
        {analysis.suggestionsDegraded && (
          <p className="warn">
            <Alert />
            <span>
              As sugestões de reescrita falharam. O restante do relatório está
              completo.
            </span>
          </p>
        )}

        <ScorePanelView panel={panel} />
      </div>

      <div className="sheet-head">
        <span className="eyebrow">O texto</span>
        {legend.length > 0 && (
          <div className="legend">
            {legend.map((entry) => (
              <LegendItem key={entry.key} entry={entry} />
            ))}
          </div>
        )}
      </div>
      <Sheet segments={segments} />

      <section className="record" aria-label="Ficha técnica">
        <span className="eyebrow">Ficha técnica</span>
        {record.map((row) => (
          <div className="record-row meta" key={row.key}>
            <span className="record-key">{row.key}</span>
            <span className="record-val">{row.value}</span>
          </div>
        ))}
      </section>
    </div>
  );
}

/**
 * A barra de método — onde a ADR-004 é satisfeita.
 *
 * O texto é `DISCLAIMER_PT_BR`, vindo do domínio pelo payload. Nunca reescrito
 * aqui, nunca truncado, nunca atrás de "ver mais", nunca colapsado no mobile.
 * A ADR-004 fez dele campo obrigatório do contrato exatamente para que um
 * redesign — como este — não pudesse removê-lo por descuido.
 */
function Method({ text, url }: { text: string; url: string }) {
  return (
    <div className="method">
      <div className="method-head">
        <Info />
        <span className="eyebrow">Método</span>
      </div>
      <p>{text}</p>
      <a className="method-link" href={url} target="_blank" rel="noopener noreferrer">
        Ler o método
        <ExternalLink />
      </a>
    </div>
  );
}

/**
 * O breakdown é a figura principal. O composto de 0 a 100 NÃO aparece aqui —
 * `ScorePanel` não tem o campo, então não há como ele vazar para cá.
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
            <div className="metric">
              <span
                className={`stroke stroke-${row.category}`}
                aria-hidden="true"
              />
              {row.percent}
            </div>
            <div className="reading-name">{row.label}</div>
            <div className="reading-count meta">{row.count} sentenças</div>
          </div>
        ))}
      </div>

      <div className="bar" role="img" aria-label={descricao}>
        {panel.breakdown.map((row) => (
          <span
            key={row.category}
            className={`bar-part fill-${row.category} grow`}
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
      <span className={`stroke stroke-${entry.key}`} aria-hidden="true" />
      {entry.label}
    </span>
  );
}

/**
 * A folha: o texto do usuário, remontado trecho a trecho e marcado.
 *
 * Renderizado como TEXTO, nunca como HTML. O conteúdo vem de página arbitrária
 * de terceiro, e injetá-lo como markup seria XSS refletido com passos extras.
 * Há regra de lint bloqueando `dangerouslySetInnerHTML`.
 */
function Sheet({ segments }: { segments: readonly Segment[] }) {
  const [aberta, setAberta] = useState<SentenceId | null>(null);

  useEffect(() => {
    if (aberta === null) return;
    const fecharPorTecla = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setAberta(null);
    };
    const fecharPorClique = (event: MouseEvent): void => {
      const alvo = event.target;
      if (alvo instanceof Element && alvo.closest('.pop-wrap') !== null) return;
      setAberta(null);
    };
    document.addEventListener('keydown', fecharPorTecla);
    document.addEventListener('click', fecharPorClique);
    return () => {
      document.removeEventListener('keydown', fecharPorTecla);
      document.removeEventListener('click', fecharPorClique);
    };
  }, [aberta]);

  return (
    <div className="sheet">
      <div className="sheet-inner">
        {segments.map((segment) => {
          if (segment.kind !== 'classified') {
            return (
              <span
                className={`${segment.kind} sentence-static`}
                key={segment.id}
                title={segment.label}
              >
                {segment.text}{' '}
              </span>
            );
          }
          return (
            <span className="pop-wrap" key={segment.id}>
              <mark className={`cat-${segment.category}`}>
                <button
                  className="sentence"
                  type="button"
                  aria-expanded={aberta === segment.id}
                  onClick={() => {
                    setAberta(aberta === segment.id ? null : segment.id);
                  }}
                >
                  {segment.text}
                </button>
              </mark>{' '}
              {aberta === segment.id && (
                <SentencePop
                  segment={segment}
                  onClose={() => {
                    setAberta(null);
                  }}
                />
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Exibe os `signals` do pré-filtro, que existiam no payload desde o começo e
 * nunca chegavam à tela. É a explicação de POR QUE a sentença caiu naquela
 * categoria — o dado mais acionável que o produto tinha guardado.
 */
function SentencePop({
  onClose,
  segment,
}: {
  onClose: () => void;
  segment: Extract<Segment, { kind: 'classified' }>;
}) {
  return (
    <span className="pop" role="dialog" aria-label={`Detalhe: ${segment.label}`}>
      <span className="pop-head">
        <span className="pop-cat">
          <span
            className={`stroke stroke-${segment.category}`}
            aria-hidden="true"
          />
          {segment.label}
        </span>
        <button
          className="pop-close"
          type="button"
          onClick={onClose}
          aria-label="Fechar"
        >
          <Close />
        </button>
      </span>
      <span className="pop-row">
        <span className="pop-key meta">confiança</span>
        <span className="pop-val meta">
          {Math.round(segment.confidence * 100)}%
        </span>
      </span>
      <span className="pop-row">
        <span className="pop-key meta">sinais</span>
        <span className="pop-val meta">
          {segment.signals.length === 0
            ? 'nenhum sinal de regra — decidido pelo modelo'
            : segment.signals.join(', ')}
        </span>
      </span>
    </span>
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
