'use client';

import { useEffect, useRef, useState } from 'react';
import type { Analysis } from '../core/domain/analysis.js';
import type { ScorePanel, Segment } from './report-model.js';
import {
  buildLegend,
  buildScorePanel,
  buildSegments,
} from './report-model.js';

/**
 * Tela mínima e funcional. NÃO é o M3 — não há design system nem polimento
 * visual, e a apresentação do score vai mudar quando a ADR-007 tiver base
 * empírica.
 *
 * O que já vale aqui são os requisitos de CONTRATO da ADR-004, que não
 * dependem de decisão visual: o número nunca aparece sem o breakdown, a
 * ressalva de metodologia fica acima da dobra, e a métrica se chama
 * "Densidade Factual" — nunca "citabilidade", que é o que o produto estima,
 * não o que mede.
 *
 * A decisão de o que exibir vive em `report-model.ts`, sem React, e é testada
 * lá. Este arquivo só desenha o que aquele modelo permite.
 */

type State =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'done'; readonly analysis: Analysis };

/** Os estágios reais do pipeline, na ordem em que rodam. */
const STAGES = [
  'Baixando a página',
  'Extraindo o conteúdo principal',
  'Segmentando em sentenças',
  'Classificando cada afirmação',
  'Calculando o score',
];

export function Analyzer() {
  const [url, setUrl] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setState({ kind: 'loading' });

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, includeSuggestions: false }),
      });
      const body: unknown = await response.json();

      if (!response.ok) {
        setState({ kind: 'error', message: messageOf(body) });
        return;
      }

      const analysis = analysisOf(body);
      if (analysis === null) {
        setState({
          kind: 'error',
          message: 'O servidor devolveu uma resposta que não pôde ser lida.',
        });
        return;
      }
      setState({ kind: 'done', analysis });
    } catch {
      setState({
        kind: 'error',
        message: 'Não foi possível falar com o servidor. Tente novamente.',
      });
    }
  }

  return (
    <>
      <form onSubmit={onSubmit}>
        <input
          type="url"
          required
          placeholder="https://exemplo.com/artigo"
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
          }}
          disabled={state.kind === 'loading'}
        />
        <button type="submit" disabled={state.kind === 'loading'}>
          {state.kind === 'loading' ? 'Analisando…' : 'Analisar'}
        </button>
      </form>

      {state.kind === 'loading' && <Progress />}

      {state.kind === 'error' && (
        <p className="error" role="alert">
          {state.message}
        </p>
      )}

      {state.kind === 'done' && <Report analysis={state.analysis} />}
    </>
  );
}

/**
 * Mostra os estágios reais e um cronômetro. Não simula avanço por etapa: a
 * rota devolve tudo de uma vez, e uma barra que "progride" sozinha seria
 * animação inventada. O cronômetro é informação verdadeira, e é o que
 * distingue "está trabalhando" de "travou".
 */
function Progress() {
  const [seconds, setSeconds] = useState(0);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 1000);
    return () => {
      clearInterval(id);
    };
  }, []);

  return (
    <div className="progress" aria-live="polite">
      <strong>Analisando… {seconds}s</strong>
      <p style={{ margin: '0.35rem 0 0', fontSize: '0.875rem' }}>
        A classificação é feita por LLM e costuma levar de 10 a 60 segundos,
        conforme o tamanho do artigo. Etapas:
      </p>
      <ol>
        {STAGES.map((stage) => (
          <li key={stage}>{stage}</li>
        ))}
      </ol>
    </div>
  );
}

function Report({ analysis }: { analysis: Analysis }) {
  const panel = buildScorePanel(analysis);
  const segments = buildSegments(analysis);
  const legend = buildLegend(segments);

  return (
    <>
      <section className="card">
        <ScoreCard panel={panel} />

        {analysis.truncated && (
          <p className="notice">
            O artigo excedeu o limite de análise e apenas a primeira parte foi
            classificada. O score descreve o trecho analisado, não o texto
            inteiro.
          </p>
        )}

        {analysis.suggestionsDegraded && (
          <p className="notice">
            As sugestões de reescrita falharam. O restante do relatório está
            completo.
          </p>
        )}

        <p className="meta">
          {analysis.title ?? analysis.url} ·{' '}
          {analysis.breakdown.analyzableSentences} de{' '}
          {analysis.sentences.length} sentenças analisadas · {analysis.language}{' '}
          · {(analysis.durationMs / 1000).toFixed(1)}s
        </p>
      </section>

      <h2>Texto classificado</h2>
      <div className="legend">
        {legend.map((entry) => (
          <span key={entry.key} className={entry.className}>
            {entry.label}
          </span>
        ))}
      </div>
      <Highlight segments={segments} />
    </>
  );
}

/**
 * Score e breakdown saem do MESMO valor.
 *
 * Não há caminho de código que renderize um sem o outro: `panel.kind ===
 * 'scored'` traz os dois campos juntos, e a variante `unscored` não tem
 * número algum para vazar. A garantia da ADR-004 é do tipo, não da disciplina
 * de quem editar este arquivo depois.
 */
function ScoreCard({ panel }: { panel: ScorePanel }) {
  if (panel.kind === 'unscored') {
    return (
      <div>
        <strong>Sem score para este conteúdo</strong>
        <p style={{ margin: '0.4rem 0 0' }}>{panel.message}</p>
      </div>
    );
  }

  return (
    <>
      <div className="score-head">
        <span className="score-value">{panel.score}</span>
        <span>
          <span className="score-label">Densidade Factual</span>
          <br />
          <span className="score-scale">
            escala 0–100 · versão {panel.scoreVersion}
          </span>
        </span>
      </div>
      <dl className="breakdown">
        {panel.breakdown.map((entry) => (
          <div key={entry.category} className={`cat-${entry.category}`}>
            <dt>{entry.label}</dt>
            <dd>{entry.percent}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

/**
 * Reconstrói o texto trecho a trecho, colorido pela classificação.
 *
 * Renderizado como TEXTO, nunca como HTML: o conteúdo vem de página
 * arbitrária de terceiro, e injetá-lo como markup seria XSS refletido com
 * passos extras. Há regra de lint bloqueando `dangerouslySetInnerHTML`.
 */
function Highlight({ segments }: { segments: readonly Segment[] }) {
  return (
    <div className="text">
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
