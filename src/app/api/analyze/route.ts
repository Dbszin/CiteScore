import { NextResponse } from 'next/server';
import { getAnalyzeUrl } from '../../../adapters/config/container.js';
import type { AnalysisErrorCode } from '../../../core/domain/errors.js';
import { isAnalysisError, USER_MESSAGES } from '../../../core/domain/errors.js';
import { clientKeyFrom } from './client-key.js';
import { HTTP_STATUS } from './error-status.js';
import { readIncludeSuggestions, readRefresh } from './request-body.js';

/**
 * Adapter de entrada HTTP.
 *
 * `nodejs`, não Edge: o Readability precisa de implementação de DOM, e o
 * fetcher precisa de resolução de DNS para as defesas de SSRF.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Erro PREVISTO: o pipeline reconheceu a situação e tem mensagem para ela.
 * `code` pertence à união fechada, então todo valor possível aqui tem status
 * HTTP mapeado e texto de usuário escrito.
 */
interface KnownErrorBody {
  readonly ok: false;
  readonly error: { readonly code: AnalysisErrorCode; readonly message: string };
}

/**
 * Erro NÃO previsto.
 *
 * Vive num tipo separado de propósito. Acrescentar `INTERNAL_ERROR` à união
 * `AnalysisErrorCode` seria mais curto e estaria errado: aquela união existe
 * para enumerar o que o produto sabe tratar, e o 500 é exatamente o que ele
 * não sabe. Diluir um no outro apagaria a distinção e faria a checagem de
 * exaustividade do mapa de status passar a cobrir um caso que ela não pode
 * cobrir.
 *
 * A versão anterior devolvia `code: 'INTERNAL_ERROR'` dentro de um objeto
 * anônimo, que não passava por tipo nenhum — o compilador não tinha como
 * reclamar.
 */
interface UnexpectedErrorBody {
  readonly ok: false;
  readonly error: { readonly code: 'INTERNAL_ERROR'; readonly message: string };
}

function knownError(code: AnalysisErrorCode, message: string): KnownErrorBody {
  return { ok: false, error: { code, message } };
}

function unexpectedError(): UnexpectedErrorBody {
  return {
    ok: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Erro inesperado. Tente novamente.',
    },
  };
}

export async function POST(request: Request): Promise<Response> {
  // ─── Corpo da requisição ────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      knownError('INVALID_URL', USER_MESSAGES.INVALID_URL),
      { status: 400 },
    );
  }

  const url = readUrl(body);
  if (url === null) {
    return NextResponse.json(
      knownError('INVALID_URL', USER_MESSAGES.INVALID_URL),
      { status: 400 },
    );
  }

  const includeSuggestions = readIncludeSuggestions(body);
  const refresh = readRefresh(body);

  try {
    const analyzeUrl = getAnalyzeUrl();
    const analysis = await analyzeUrl({
      url,
      clientKey: clientKeyFrom(request.headers),
      includeSuggestions,
      refresh,
    });
    return NextResponse.json({ ok: true, analysis });
  } catch (error) {
    if (isAnalysisError(error)) {
      const headers =
        error.retryAfterSeconds === null
          ? undefined
          : { 'Retry-After': String(error.retryAfterSeconds) };

      return NextResponse.json(
        knownError(error.code, error.userMessage),
        headers === undefined
          ? { status: HTTP_STATUS[error.code] }
          : { status: HTTP_STATUS[error.code], headers },
      );
    }

    // Erro não previsto. O log fica no servidor; o cliente recebe um corpo
    // genérico. Vazar stack para um endpoint público anônimo entrega mapa
    // da aplicação a quem estiver sondando.
    console.error('[citescore] erro não tratado em POST /api/analyze', error);
    return NextResponse.json(unexpectedError(), { status: 500 });
  }
}

function readUrl(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const value = (body as Record<string, unknown>)['url'];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

