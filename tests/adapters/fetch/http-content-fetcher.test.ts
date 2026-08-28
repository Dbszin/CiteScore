import { describe, expect, it } from 'vitest';

import {
  HttpContentFetcher,
  type AddressResolver,
} from '../../../src/adapters/fetch/http-content-fetcher.js';
import { AnalysisError } from '../../../src/core/domain/errors.js';

const OPTIONS = { maxBytes: 1_000, timeoutMs: 500, maxRedirects: 3 };

const publicResolver: AddressResolver = async () => ['203.0.113.10'];

function htmlResponse(body: string, init: ResponseInit = {}): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    ...init,
  });
}

async function expectCode(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(AnalysisError);
  await promise.catch((error: unknown) => {
    expect((error as AnalysisError).code).toBe(code);
  });
}

describe('HttpContentFetcher — validação de entrada', () => {
  const fetcher = new HttpContentFetcher(OPTIONS, publicResolver, async () =>
    htmlResponse('<html><body><p>ok</p></body></html>'),
  );

  it('rejeita URL malformada', async () => {
    await expectCode(fetcher.fetch('não-é-url'), 'INVALID_URL');
  });

  it('rejeita esquema file:', async () => {
    await expectCode(fetcher.fetch('file:///etc/passwd'), 'INVALID_URL');
  });

  it('rejeita esquema gopher:', async () => {
    await expectCode(fetcher.fetch('gopher://exemplo.com/'), 'INVALID_URL');
  });

  it('rejeita credencial embutida na URL', async () => {
    await expectCode(
      fetcher.fetch('https://user:senha@exemplo.com/a'),
      'INVALID_URL',
    );
  });
});

describe('HttpContentFetcher — defesas de SSRF', () => {
  it('bloqueia localhost antes de qualquer requisição', async () => {
    let chamou = false;
    const fetcher = new HttpContentFetcher(OPTIONS, publicResolver, async () => {
      chamou = true;
      return htmlResponse('x');
    });
    await expectCode(fetcher.fetch('http://localhost:3000/'), 'BLOCKED_HOST');
    expect(chamou).toBe(false);
  });

  it('bloqueia literal de IP privado', async () => {
    const fetcher = new HttpContentFetcher(OPTIONS, publicResolver, async () =>
      htmlResponse('x'),
    );
    await expectCode(fetcher.fetch('http://192.168.0.1/'), 'BLOCKED_HOST');
  });

  it('bloqueia o endereço de metadata de nuvem', async () => {
    const fetcher = new HttpContentFetcher(OPTIONS, publicResolver, async () =>
      htmlResponse('x'),
    );
    await expectCode(
      fetcher.fetch('http://169.254.169.254/latest/meta-data/'),
      'BLOCKED_HOST',
    );
  });

  it('bloqueia domínio público que RESOLVE para IP interno (DNS rebinding)', async () => {
    const resolverMalicioso: AddressResolver = async () => ['10.0.0.7'];
    const fetcher = new HttpContentFetcher(
      OPTIONS,
      resolverMalicioso,
      async () => htmlResponse('x'),
    );
    await expectCode(fetcher.fetch('https://parece-publico.com/'), 'BLOCKED_HOST');
  });

  it('BLOQUEIA REDIRECT para IP interno — o bypass clássico', async () => {
    // A URL original é pública e resolve para IP público. O redirect aponta
    // para a rede interna. Validar só a URL original deixaria isso passar.
    const resolver: AddressResolver = async (hostname) =>
      hostname === 'interno.exemplo.com' ? ['10.1.2.3'] : ['203.0.113.10'];

    const fetcher = new HttpContentFetcher(OPTIONS, resolver, async (input) => {
      const url = String(input);
      if (url.includes('publico.com')) {
        return new Response(null, {
          status: 302,
          headers: { location: 'https://interno.exemplo.com/admin' },
        });
      }
      return htmlResponse('<p>segredo interno</p>');
    });

    await expectCode(fetcher.fetch('https://publico.com/inicio'), 'BLOCKED_HOST');
  });

  it('para de seguir depois do limite de redirects', async () => {
    const fetcher = new HttpContentFetcher(
      { ...OPTIONS, maxRedirects: 2 },
      publicResolver,
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: 'https://exemplo.com/proximo' },
        }),
    );
    await expectCode(fetcher.fetch('https://exemplo.com/inicio'), 'FETCH_FAILED');
  });

  it('não envia cookie nem cabeçalho de autenticação', async () => {
    let headers: Headers | undefined;
    const fetcher = new HttpContentFetcher(OPTIONS, publicResolver, async (_i, init) => {
      headers = new Headers(init?.headers);
      return htmlResponse('<p>conteúdo suficiente aqui</p>');
    });
    await fetcher.fetch('https://exemplo.com/a');
    expect(headers?.get('cookie')).toBeNull();
    expect(headers?.get('authorization')).toBeNull();
    expect(headers?.get('user-agent')).toContain('CiteScoreBot');
  });
});

describe('HttpContentFetcher — respostas', () => {
  it('CORREÇÃO 3: 403 vira ACCESS_FORBIDDEN, não FETCH_FAILED', async () => {
    // O NYT devolveu 403 no benchmark e nunca chegou ao extrator.
    const fetcher = new HttpContentFetcher(OPTIONS, publicResolver, async () =>
      new Response('bloqueado', {
        status: 403,
        headers: { 'content-type': 'text/html' },
      }),
    );
    await expectCode(fetcher.fetch('https://nytimes.com/artigo'), 'ACCESS_FORBIDDEN');
  });

  it('401 também vira ACCESS_FORBIDDEN', async () => {
    const fetcher = new HttpContentFetcher(OPTIONS, publicResolver, async () =>
      new Response('auth', { status: 401, headers: { 'content-type': 'text/html' } }),
    );
    await expectCode(fetcher.fetch('https://exemplo.com/a'), 'ACCESS_FORBIDDEN');
  });

  it('404 continua sendo FETCH_FAILED', async () => {
    const fetcher = new HttpContentFetcher(OPTIONS, publicResolver, async () =>
      new Response('nao existe', {
        status: 404,
        headers: { 'content-type': 'text/html' },
      }),
    );
    await expectCode(fetcher.fetch('https://exemplo.com/a'), 'FETCH_FAILED');
  });

  it('rejeita conteúdo que não é HTML', async () => {
    const fetcher = new HttpContentFetcher(OPTIONS, publicResolver, async () =>
      new Response('%PDF-1.7', {
        status: 200,
        headers: { 'content-type': 'application/pdf' },
      }),
    );
    await expectCode(fetcher.fetch('https://exemplo.com/a.pdf'), 'NOT_HTML');
  });

  it('rejeita por content-length declarado acima do cap', async () => {
    const fetcher = new HttpContentFetcher(OPTIONS, publicResolver, async () =>
      new Response('<p>x</p>', {
        status: 200,
        headers: { 'content-type': 'text/html', 'content-length': '99999' },
      }),
    );
    await expectCode(fetcher.fetch('https://exemplo.com/a'), 'CONTENT_TOO_LARGE');
  });

  it('interrompe o download DURANTE o stream ao passar do cap', async () => {
    // O ponto do limite é não baixar a página gigante — não descartá-la depois.
    let chunksEnviados = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        chunksEnviados += 1;
        if (chunksEnviados > 50) {
          controller.close();
          return;
        }
        controller.enqueue(new Uint8Array(200));
      },
    });

    const fetcher = new HttpContentFetcher(OPTIONS, publicResolver, async () =>
      new Response(stream, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    );

    await expectCode(fetcher.fetch('https://exemplo.com/gigante'), 'CONTENT_TOO_LARGE');
    // maxBytes = 1000, chunk = 200 -> aborta por volta do 6º chunk,
    // muito antes dos 50 que o servidor tinha para enviar.
    expect(chunksEnviados).toBeLessThan(15);
  });

  it('respeita o charset declarado em vez de assumir UTF-8', async () => {
    // Regressão: `toString("utf8")` incondicional gerava mojibake em site
    // PT-BR com latin-1, corrompendo as tabelas de sinais acentuadas.
    const latin1 = Buffer.from(
      '<html><body><p>Segundo o IBGE, a inflação caiu.</p></body></html>',
      'latin1',
    );
    const fetcher = new HttpContentFetcher(
      { ...OPTIONS, maxBytes: 10_000 },
      publicResolver,
      async () =>
        new Response(latin1, {
          status: 200,
          headers: { 'content-type': 'text/html; charset=iso-8859-1' },
        }),
    );
    const page = await fetcher.fetch('https://exemplo.com.br/a');
    expect(page.html).toContain('inflação');
    expect(page.html).not.toContain('�');
  });

  it('o deadline é TOTAL, não por requisição', async () => {
    // Antes, com maxRedirects=3 e timeout de 500ms, uma cadeia lenta de
    // redirects consumia até 4x o limite. O orçamento de design.md é 15s
    // para a análise inteira.
    let requisicoes = 0;
    const fetcher = new HttpContentFetcher(
      { maxBytes: 10_000, timeoutMs: 300, maxRedirects: 5 },
      publicResolver,
      async () => {
        requisicoes += 1;
        await new Promise((resolve) => setTimeout(resolve, 120));
        return new Response(null, {
          status: 302,
          headers: { location: `https://exemplo.com/hop${requisicoes}` },
        });
      },
    );

    const inicio = Date.now();
    await expect(fetcher.fetch('https://exemplo.com/inicio')).rejects.toThrow();
    const decorrido = Date.now() - inicio;

    // Com deadline total de 300ms, o tempo de parede não pode se aproximar
    // dos 6 x 300ms que o limite por requisição permitiria.
    expect(decorrido).toBeLessThan(900);
  });

  it('devolve a página quando tudo está em ordem', async () => {
    const fetcher = new HttpContentFetcher(OPTIONS, publicResolver, async () =>
      htmlResponse('<html><body><p>conteúdo</p></body></html>'),
    );
    const page = await fetcher.fetch('https://exemplo.com/a');
    expect(page.html).toContain('conteúdo');
    expect(page.finalUrl).toBe('https://exemplo.com/a');
  });

  it('segue redirect para host público e usa a URL final', async () => {
    const fetcher = new HttpContentFetcher(OPTIONS, publicResolver, async (input) => {
      if (String(input).includes('/antigo')) {
        return new Response(null, {
          status: 301,
          headers: { location: 'https://exemplo.com/novo' },
        });
      }
      return htmlResponse('<p>mudou de lugar</p>');
    });
    const page = await fetcher.fetch('https://exemplo.com/antigo');
    expect(page.finalUrl).toBe('https://exemplo.com/novo');
  });
});
