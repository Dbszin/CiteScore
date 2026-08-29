import { Agent, fetch as undiciFetch } from 'undici';

import { analysisError } from '../../core/domain/errors.js';
import type {
  ContentFetcher,
  FetchedPage,
} from '../../core/ports/content-fetcher.js';
import { decodeHtml } from './charset.js';
import { isBlockedAddress, isBlockedHostname } from './private-address.js';
import {
  createValidatingLookup,
  findBlockedAddressError,
  systemResolver,
} from './validating-lookup.js';
import type { AddressResolver } from './validating-lookup.js';

export type { AddressResolver } from './validating-lookup.js';

export interface HttpFetcherOptions {
  readonly maxBytes: number;
  readonly timeoutMs: number;
  readonly maxRedirects: number;
  readonly userAgent?: string;
}

const DEFAULT_USER_AGENT =
  'CiteScoreBot/0.1 (+https://github.com/Dbszin/CiteScore)';

/**
 * Transporte com o endereço pinado (ADR-008).
 *
 * Usa o `fetch` do undici, e não o global, por um motivo concreto: o
 * `dispatcher` só tem efeito quando o `Agent` vem da MESMA instância da
 * biblioteca. O Node 20 embute o undici mas não o expõe como módulo
 * importável, então um `Agent` de um pacote instalado à parte seria ignorado
 * em silêncio pelo `fetch` global — e "ignorado em silêncio" é exatamente o
 * modo de falha que esta mudança existe para eliminar.
 *
 * Verificado em execução: o undici consulta o lookup com `{ all: true }`, e a
 * conexão HTTPS para o nome mantém SNI e validação de certificado.
 */
function createPinnedFetch(resolve: AddressResolver): typeof fetch {
  const agent = new Agent({
    connect: {
      lookup: createValidatingLookup({ resolve }) as never,
    },
  });

  return ((input: RequestInfo | URL, init?: RequestInit) =>
    undiciFetch(String(input), {
      ...(init as Record<string, unknown>),
      dispatcher: agent,
    } as never)) as unknown as typeof fetch;
}

export class HttpContentFetcher implements ContentFetcher {
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly options: HttpFetcherOptions,
    private readonly resolveAddresses: AddressResolver = systemResolver,
    fetchImpl?: typeof fetch,
  ) {
    // Sem transporte injetado, o padrão é o pinado. Teste que injeta um
    // transporte falso NÃO passa pelo lookup — por isso a pré-checagem
    // abaixo continua existindo.
    this.fetchImpl = fetchImpl ?? createPinnedFetch(this.resolveAddresses);
  }

  async fetch(url: string): Promise<FetchedPage> {
    let current = this.parseAndValidate(url);

    // Deadline TOTAL, nao por requisicao. Antes, com maxRedirects=3 e
    // timeoutMs=10000, o tempo de parede chegava a 4x o limite — muito acima
    // do orcamento de 15s de design.md, e mantendo uma funcao serverless
    // aberta esse tempo todo.
    const deadline = Date.now() + this.options.timeoutMs;

    for (let hop = 0; hop <= this.options.maxRedirects; hop += 1) {
      // Revalidação a CADA salto, não só na URL original: redirect para IP
      // interno é o bypass clássico de proteção de SSRF.
      await this.assertPublicHost(current);

      const response = await this.request(current, deadline);

      if (isRedirect(response.status)) {
        const location = response.headers.get('location');
        if (location === null) throw analysisError('FETCH_FAILED');
        current = this.parseAndValidate(new URL(location, current).toString());
        continue;
      }

      return await this.readBody(response, current, deadline);
    }

    // Excedeu o limite de saltos.
    throw analysisError('FETCH_FAILED');
  }

  private parseAndValidate(raw: string): URL {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch (cause) {
      throw analysisError('INVALID_URL', cause);
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw analysisError('INVALID_URL');
    }
    if (parsed.username.length > 0 || parsed.password.length > 0) {
      throw analysisError('INVALID_URL');
    }
    if (isBlockedHostname(parsed.hostname)) {
      throw analysisError('BLOCKED_HOST');
    }
    return parsed;
  }

  /**
   * Pré-checagem, mantida DE PROPÓSITO mesmo com a validação no caminho de
   * conexão (ADR-008).
   *
   * A ADR previa remover este método, e a segurança de fato não depende mais
   * dele: quem fecha a janela de TOCTOU é o lookup validador. Ele fica por
   * duas razões práticas.
   *
   * A primeira é de teste: os 21 casos existentes injetam um `fetch` falso,
   * que nunca passa pelo transporte real e portanto nunca aciona o lookup.
   * Removê-lo faria toda a bateria de SSRF continuar verde sem exercitar
   * bloqueio nenhum — o modo de falha "suíte reporta verde sem ter validado
   * nada" que este projeto já sofreu uma vez.
   *
   * A segunda é de custo: rejeitar antes de abrir socket é mais barato e
   * produz erro mais preciso que desembrulhar falha de conexão.
   *
   * Redundância deliberada, não esquecimento. Registrada como desvio da spec.
   */
  private async assertPublicHost(target: URL): Promise<void> {
    let addresses: string[];
    try {
      addresses = await this.resolveAddresses(target.hostname);
    } catch (cause) {
      throw analysisError('FETCH_FAILED', cause);
    }

    if (addresses.length === 0) throw analysisError('FETCH_FAILED');
    for (const address of addresses) {
      if (isBlockedAddress(address)) throw analysisError('BLOCKED_HOST');
    }
  }

  private async request(target: URL, deadline: number): Promise<Response> {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw analysisError('FETCH_TIMEOUT');

    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, remaining);

    try {
      return await this.fetchImpl(target.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        // Nenhuma credencial, cookie ou cabeçalho de autenticação é enviado.
        headers: {
          'user-agent': this.options.userAgent ?? DEFAULT_USER_AGENT,
          accept: 'text/html,application/xhtml+xml',
          'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
        },
      });
    } catch (cause) {
      if (controller.signal.aborted) throw analysisError('FETCH_TIMEOUT', cause);
      // A recusa do lookup chega embrulhada em camadas de erro de socket. Sem
      // desembrulhar, um bloqueio de SSRF viraria FETCH_FAILED — o usuário
      // leria "não foi possível acessar a página" no lugar da razão real, e o
      // log não distinguiria ataque de site fora do ar.
      if (findBlockedAddressError(cause) !== null) {
        throw analysisError('BLOCKED_HOST', cause);
      }
      throw analysisError('FETCH_FAILED', cause);
    } finally {
      clearTimeout(timer);
    }
  }

  private async readBody(
    response: Response,
    target: URL,
    deadline: number,
  ): Promise<FetchedPage> {
    // ==== CORREÇÃO 3 DO BENCHMARK ====
    // O NYT devolveu 403 e nunca chegou ao extrator. A spec mapeava paywall
    // para NO_MAIN_CONTENT, mas o caminho real e mais frequente é este.
    if (response.status === 401 || response.status === 403) {
      throw analysisError('ACCESS_FORBIDDEN');
    }
    if (response.status === 408 || response.status === 504) {
      throw analysisError('FETCH_TIMEOUT');
    }
    if (!response.ok) {
      throw analysisError('FETCH_FAILED');
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!/(?:text\/html|application\/xhtml\+xml)/iu.test(contentType)) {
      throw analysisError('NOT_HTML');
    }

    const declaredLength = Number(response.headers.get('content-length') ?? '0');
    if (declaredLength > this.options.maxBytes) {
      throw analysisError('CONTENT_TOO_LARGE');
    }

    const bytes = await this.readCapped(response, deadline);
    const { html } = decodeHtml(bytes, contentType);

    return {
      finalUrl: target.toString(),
      html,
      contentType,
      byteLength: bytes.byteLength,
    };
  }

  /**
   * Cap aplicado DURANTE o stream, não depois do download completo — o
   * ponto todo do limite é não baixar a página gigante.
   */
  private async readCapped(
    response: Response,
    deadline: number,
  ): Promise<Uint8Array> {
    const body = response.body;
    if (body === null) throw analysisError('FETCH_FAILED');

    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;

    try {
      for (;;) {
        if (Date.now() > deadline) {
          await reader.cancel();
          throw analysisError('FETCH_TIMEOUT');
        }

        const { done, value } = await reader.read();
        if (done) break;
        if (value === undefined) continue;

        total += value.byteLength;
        if (total > this.options.maxBytes) {
          await reader.cancel();
          throw analysisError('CONTENT_TOO_LARGE');
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    // Bytes crus: a decodificacao respeita o charset declarado, em charset.ts.
    return Buffer.concat(chunks);
  }
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}
