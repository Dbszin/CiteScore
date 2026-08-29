import { describe, expect, it } from 'vitest';

import {
  CHAVE_NAO_IDENTIFICADA,
  clientKeyFrom,
} from '../../../src/app/api/analyze/client-key.js';

function headers(pares: Record<string, string>): Headers {
  return new Headers(pares);
}

/**
 * A chave de rate limit é escolhida a partir de cabeçalhos, e cabeçalho é
 * dado do cliente até prova em contrário.
 *
 * O ataque que estes testes cobrem não é sofisticado: variar
 * `x-forwarded-for` a cada requisição dá um balde de rate limit novo por
 * vez, o que anula a defesa sem produzir erro nenhum.
 */
describe('clientKeyFrom', () => {
  it('prefere o cabeçalho que a borda escreve', () => {
    // A Vercel descarta o que o cliente mandou e escreve o seu.
    const chave = clientKeyFrom(
      headers({
        'x-vercel-forwarded-for': '203.0.113.10',
        'x-forwarded-for': '1.1.1.1, 2.2.2.2',
        'x-real-ip': '198.51.100.5',
      }),
    );

    expect(chave).toBe('203.0.113.10');
  });

  it('cai para x-real-ip antes de confiar em x-forwarded-for', () => {
    const chave = clientKeyFrom(
      headers({ 'x-real-ip': '198.51.100.5', 'x-forwarded-for': '1.1.1.1' }),
    );

    expect(chave).toBe('198.51.100.5');
  });

  it('do x-forwarded-for usa o valor MAIS À DIREITA', () => {
    // Cada proxy acrescenta ao fim, então o último foi escrito pelo salto
    // mais próximo de nós. Os da esquerda podem ter vindo prontos do cliente.
    const chave = clientKeyFrom(
      headers({ 'x-forwarded-for': '10.0.0.1, 1.1.1.1, 203.0.113.77' }),
    );

    expect(chave).toBe('203.0.113.77');
  });

  it('recusa valor que não é endereço', () => {
    // Texto arbitrário aceito como chave é a mesma brecha por outro caminho:
    // basta variar a string para ganhar balde novo.
    const chave = clientKeyFrom(
      headers({ 'x-forwarded-for': 'nao-sou-um-ip', 'x-real-ip': 'tambem-nao' }),
    );

    expect(chave).toBe(CHAVE_NAO_IDENTIFICADA);
  });

  it('ignora cabeçalho confiável inválido e segue procurando', () => {
    const chave = clientKeyFrom(
      headers({ 'x-real-ip': 'lixo', 'x-forwarded-for': '203.0.113.9' }),
    );

    expect(chave).toBe('203.0.113.9');
  });

  it('sem cabeçalho algum, todos caem no MESMO balde', () => {
    // Deliberado e do lado seguro: requisições não identificadas competem
    // entre si pelo mesmo limite, em vez de cada uma ganhar cota própria.
    expect(clientKeyFrom(headers({}))).toBe(CHAVE_NAO_IDENTIFICADA);
  });

  it('aceita IPv6 e tira os colchetes', () => {
    const chave = clientKeyFrom(
      headers({ 'x-real-ip': '[2606:4700:4700::1111]' }),
    );

    expect(chave).toBe('2606:4700:4700::1111');
  });

  it('recusa valor absurdamente longo', () => {
    const chave = clientKeyFrom(headers({ 'x-real-ip': '1.'.repeat(200) }));

    expect(chave).toBe(CHAVE_NAO_IDENTIFICADA);
  });
});
