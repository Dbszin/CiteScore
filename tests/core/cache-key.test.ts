import { describe, expect, it } from 'vitest';

import {
  buildAnalysisCacheKey,
  normalizeUrlForCache,
} from '../../src/core/domain/cache-key.js';

/**
 * A normalização é o que decide se o cache ACERTA. Errar para o lado frouxo
 * serve o artigo errado; errar para o lado rígido faz o cache não pegar nada e
 * paga-se assim mesmo.
 */

const BASE = 'https://moz.com/learn/seo/what-is-seo';

describe('normalizeUrlForCache — o que é o MESMO artigo', () => {
  it.each([
    ['barra final', `${BASE}/`],
    ['fragmento', `${BASE}#introducao`],
    ['host em maiúscula', 'https://MOZ.com/learn/seo/what-is-seo'],
    ['utm_source', `${BASE}?utm_source=linkedin`],
    ['vários parâmetros de rastreio', `${BASE}?utm_source=x&fbclid=y&gclid=z`],
    ['rastreio mais fragmento mais barra', `${BASE}/?utm_campaign=a#topo`],
  ])('%s colapsa na mesma chave', (_rotulo, variante) => {
    expect(normalizeUrlForCache(variante)).toBe(normalizeUrlForCache(BASE));
  });

  it('a ordem dos parâmetros não cria entrada nova', () => {
    expect(normalizeUrlForCache(`${BASE}?a=1&b=2`)).toBe(
      normalizeUrlForCache(`${BASE}?b=2&a=1`),
    );
  });
});

describe('normalizeUrlForCache — o que NÃO pode colapsar', () => {
  /*
   * O erro caro. Servir o conteúdo de outra página sob a mesma chave é pior
   * que não cachear coisa nenhuma.
   */
  it('paginação é conteúdo diferente', () => {
    expect(normalizeUrlForCache(`${BASE}?page=2`)).not.toBe(
      normalizeUrlForCache(BASE),
    );
  });

  it('parâmetro desconhecido é MANTIDO — na dúvida, não descarta', () => {
    const chave = normalizeUrlForCache(`${BASE}?id=42`);
    expect(chave).toContain('id=42');
  });

  it('o caminho é sensível a maiúscula, ao contrário do host', () => {
    expect(normalizeUrlForCache('https://moz.com/Learn')).not.toBe(
      normalizeUrlForCache('https://moz.com/learn'),
    );
  });

  it('domínios diferentes não colidem', () => {
    expect(normalizeUrlForCache('https://a.test/x')).not.toBe(
      normalizeUrlForCache('https://b.test/x'),
    );
  });

  it('http e https são chaves diferentes', () => {
    // Podem servir conteúdo diferente, e um redirecionamento não é garantido.
    expect(normalizeUrlForCache('http://a.test/x')).not.toBe(
      normalizeUrlForCache('https://a.test/x'),
    );
  });

  it('a raiz mantém a barra — ali ela É o caminho', () => {
    expect(normalizeUrlForCache('https://a.test/')).toBe('https://a.test/');
  });
});

describe('buildAnalysisCacheKey — o versionamento entra na chave', () => {
  const partes = { url: BASE, scoreVersion: '1.0.0', model: 'gemini-2.0-flash' };

  it('mudar a versão do score invalida o cache', () => {
    // Este projeto versiona os pesos porque mudá-los MUDA o resultado. Se a
    // chave ignorasse a versão, uma mudança de fórmula continuaria servindo
    // número calculado pela regra antiga — invalidando o versionamento na
    // surdina, que é pior que não versionar.
    expect(buildAnalysisCacheKey(partes)).not.toBe(
      buildAnalysisCacheKey({ ...partes, scoreVersion: '2.0.0' }),
    );
  });

  it('mudar de modelo invalida o cache', () => {
    expect(buildAnalysisCacheKey(partes)).not.toBe(
      buildAnalysisCacheKey({ ...partes, model: 'claude-haiku-4-5' }),
    );
  });

  it('a URL aparece em claro, para dar para ler qual é', () => {
    expect(buildAnalysisCacheKey(partes)).toContain('moz.com');
  });

  it('a mesma entrada dá sempre a mesma chave', () => {
    expect(buildAnalysisCacheKey(partes)).toBe(buildAnalysisCacheKey(partes));
  });
});
