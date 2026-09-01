import { describe, expect, it } from 'vitest';

import {
  paraLogSeguro,
  removerUrls,
} from '../../src/app/api/analyze/log-seguro.js';

/**
 * A política de log, como teste em vez de combinado.
 *
 * O levantamento antes do deploy achou um vetor só: o `catch` final da rota
 * registrava o objeto de erro inteiro, e erro de rede costuma trazer o endereço
 * na mensagem. Combinado de equipe não sobrevive a uma dependência atualizada
 * que passe a incluir a URL onde antes não incluía. Função com teste, sim.
 */

describe('removerUrls — o que precisa sair', () => {
  it.each([
    ['URL completa', 'falha ao buscar https://cliente.exemplo.com/rascunho-secreto'],
    ['com porta e query', 'erro em http://exemplo.com:8080/a?b=1&c=2'],
    ['no meio da frase', 'antes https://exemplo.com/x depois'],
    ['domínio sem esquema', 'getaddrinfo ENOTFOUND cliente.exemplo.com'],
    ['domínio com caminho', 'timeout em exemplo.com.br/artigo/interno'],
    ['subdomínio', 'recusado por staging.interno.exemplo.org'],
  ])('%s é removida', (_rotulo, texto) => {
    const limpo = removerUrls(texto);
    expect(limpo).toContain('[url removida]');
    expect(limpo).not.toMatch(/exemplo/u);
  });

  it('remove TODAS as ocorrências, não só a primeira', () => {
    const limpo = removerUrls('de https://a.test/x para https://b.test/y');
    expect(limpo).not.toMatch(/a\.test|b\.test/u);
  });

  it('o que NÃO é endereço sobrevive', () => {
    // Cortar demais tornaria o log inútil, que é trocar um defeito por outro.
    const texto = 'CLASSIFIER_FAILED: lote 2 de 3, 80 sentencas, HTTP 503';
    expect(removerUrls(texto)).toBe(texto);
  });
});

describe('paraLogSeguro — preserva o que serve para depurar', () => {
  it('mantém nome, mensagem e pilha', () => {
    // Registrar nada seria trocar um defeito por outro: falha em produção sem
    // log é falha que ninguém conserta.
    const erro = new TypeError('algo quebrou');
    const seguro = paraLogSeguro(erro);

    expect(seguro.nome).toBe('TypeError');
    expect(seguro.mensagem).toBe('algo quebrou');
    expect(seguro.pilha).toContain('TypeError');
  });

  it('a URL sai da MENSAGEM', () => {
    const erro = new Error('fetch falhou para https://cliente.test/rascunho');
    expect(paraLogSeguro(erro).mensagem).not.toMatch(/cliente\.test/u);
  });

  it('a URL sai também da PILHA', () => {
    // A pilha é o esconderijo fácil: ninguém pensa nela ao revisar um log.
    const erro = new Error('falhou');
    erro.stack = 'Error: falhou\n    at buscar (https://cliente.test/a:1:1)';
    expect(paraLogSeguro(erro).pilha).not.toMatch(/cliente\.test/u);
  });

  it('erro que não é Error também é tratado', () => {
    // `throw 'texto'` é legal em JavaScript e acontece em biblioteca de
    // terceiro. Assumir `Error` deixaria esse caminho sem filtro.
    const seguro = paraLogSeguro('caiu em https://cliente.test/x');
    expect(seguro.mensagem).not.toMatch(/cliente\.test/u);
    expect(seguro.pilha).toBeNull();
  });

  it('erro sem pilha não inventa uma', () => {
    // `delete` e nao `= undefined`: com `exactOptionalPropertyTypes`, atribuir
    // undefined nao e' o mesmo que a propriedade nao existir — e o caso real e'
    // a ausencia.
    const erro = new Error('sem pilha');
    delete (erro as { stack?: string }).stack;
    expect(paraLogSeguro(erro).pilha).toBeNull();
  });
});
