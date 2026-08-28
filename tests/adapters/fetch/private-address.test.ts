import { describe, expect, it } from 'vitest';

import {
  isBlockedAddress,
  isBlockedHostname,
} from '../../../src/adapters/fetch/private-address.js';

/**
 * SSRF é o maior risco de segurança do produto: aceitamos URL arbitrária de
 * visitante anônimo e a buscamos do SERVIDOR. Este arquivo é a suíte que
 * impede o endpoint de virar proxy para a rede interna.
 */
describe('isBlockedAddress — IPv4', () => {
  const bloqueados = [
    ['loopback', '127.0.0.1'],
    ['loopback faixa inteira', '127.255.255.254'],
    ['privada 10/8', '10.0.0.5'],
    ['privada 172.16/12 início', '172.16.0.1'],
    ['privada 172.16/12 fim', '172.31.255.254'],
    ['privada 192.168/16', '192.168.1.1'],
    ['link-local', '169.254.1.1'],
    ['metadata de nuvem', '169.254.169.254'],
    ['this network', '0.0.0.0'],
    ['CGNAT', '100.64.0.1'],
    ['multicast', '224.0.0.1'],
    ['broadcast', '255.255.255.255'],
  ] as const;

  for (const [label, address] of bloqueados) {
    it(`bloqueia ${label}: ${address}`, () => {
      expect(isBlockedAddress(address)).toBe(true);
    });
  }

  const permitidos = [
    ['Cloudflare DNS', '1.1.1.1'],
        ['Google DNS', '8.8.8.8'],
    ['público fora da faixa privada', '172.32.0.1'],
    ['público adjacente a 172.16/12', '172.15.255.255'],
    ['público', '203.0.113.10'],
  ] as const;

  for (const [label, address] of permitidos) {
    it(`permite ${label}: ${address}`, () => {
      expect(isBlockedAddress(address)).toBe(false);
    });
  }
});

describe('isBlockedAddress — IPv6', () => {
  it('bloqueia loopback ::1', () => {
    expect(isBlockedAddress('::1')).toBe(true);
  });

  it('bloqueia unspecified ::', () => {
    expect(isBlockedAddress('::')).toBe(true);
  });

  it('bloqueia unique local fc00::/7', () => {
    expect(isBlockedAddress('fd00::1')).toBe(true);
    expect(isBlockedAddress('fc00::1')).toBe(true);
  });

  it('bloqueia link-local fe80::/10', () => {
    expect(isBlockedAddress('fe80::1')).toBe(true);
  });

  it('bloqueia IPv4 mapeado apontando para metadata', () => {
    // Bypass clássico: esconder o IP interno dentro de um endereço IPv6.
    expect(isBlockedAddress('::ffff:169.254.169.254')).toBe(true);
    expect(isBlockedAddress('::ffff:127.0.0.1')).toBe(true);
  });

  it('permite IPv6 público', () => {
    expect(isBlockedAddress('2606:4700:4700::1111')).toBe(false);
  });
});

describe('Formas que o parser de URL REALMENTE produz (regressão)', () => {
  /**
   * A suíte anterior validava `::ffff:169.254.169.254` na forma pontilhada —
   * que NUNCA chega por esse caminho. O parser WHATWG normaliza IPv4-mapeado
   * para hexadecimal, e a guarda não reconhecia essa forma. Teste que dava
   * confiança falsa.
   *
   * Estes casos passam pelo `new URL()` primeiro, como em produção.
   */
  const vetores = [
    ['metadata de nuvem mapeado', 'http://[::ffff:169.254.169.254]/'],
    ['loopback mapeado', 'http://[::ffff:127.0.0.1]/'],
    ['privada mapeada', 'http://[::ffff:10.0.0.1]/'],
    ['loopback expandido', 'http://[0:0:0:0:0:0:0:1]/'],
    ['decimal', 'http://2130706433/'],
    ['octal', 'http://0177.0.0.1/'],
    ['hexadecimal', 'http://0x7f.0.0.1/'],
    ['forma curta', 'http://127.1/'],
  ] as const;

  for (const [label, url] of vetores) {
    it(`bloqueia ${label} depois da normalização de URL`, () => {
      const hostname = new URL(url).hostname;
      expect(isBlockedHostname(hostname), `${url} -> ${hostname}`).toBe(true);
    });
  }

  it('IPv4-mapeado em hex é reconhecido diretamente', () => {
    // É esta a forma que sai de `new URL(...).hostname`.
    expect(isBlockedAddress('::ffff:a9fe:a9fe')).toBe(true);
    expect(isBlockedAddress('::ffff:7f00:1')).toBe(true);
  });
});

describe('Falha FECHADA e correções de parsing', () => {
  it('endereço não interpretável é tratado como bloqueado', () => {
    // Checagem de segurança que falha em aberto é pior que não ter checagem.
    // Estes valores chegam de resolução de DNS: forma inesperada = descon-
    // fiança, não liberação.
    for (const address of ['nao-e-endereco', '999.999.999.999', 'zz::1', '']) {
      expect(isBlockedAddress(address), address).toBe(true);
    }
  });

  it('fc::1 NÃO é bloqueado — padStart, não padEnd', () => {
    // `fc::1` expande para 00fc:0000:…:0001, que está FORA de fc00::/7.
    // Com `padEnd(4,"0")` o grupo virava 0xfc00 e o endereço era bloqueado
    // por engano.
    expect(isBlockedAddress('fc::1')).toBe(false);
    // Já estes estão dentro da faixa e continuam bloqueados.
    expect(isBlockedAddress('fc00::1')).toBe(true);
    expect(isBlockedAddress('fd00::1')).toBe(true);
  });

  it('bloqueia as faixas acrescentadas', () => {
    expect(isBlockedAddress('192.88.99.1')).toBe(true); // relay 6to4
    expect(isBlockedAddress('198.18.0.1')).toBe(true); // benchmarking
    expect(isBlockedAddress('198.19.255.254')).toBe(true);
  });

  it('bloqueia IPv6 com zona de escopo', () => {
    expect(isBlockedAddress('fe80::1%eth0')).toBe(true);
  });

  it('bloqueia 6to4 que encapsula IPv4 interno', () => {
    // 2002:7f00:0001:: encapsula 127.0.0.1
    expect(isBlockedAddress('2002:7f00:1::')).toBe(true);
  });

  it('IPv6 público continua liberado', () => {
    expect(isBlockedAddress('2606:4700:4700::1111')).toBe(false);
    expect(isBlockedAddress('2001:4860:4860::8888')).toBe(false);
  });
});

describe('isBlockedHostname', () => {
  const bloqueados = [
    'localhost',
    'LOCALHOST',
    'localhost.localdomain',
    'metadata.google.internal',
    'instance-data',
    'servidor.local',
    'api.internal',
    'nas.lan',
    '127.0.0.1',
    '169.254.169.254',
    '10.0.0.1',
  ];

  for (const hostname of bloqueados) {
    it(`bloqueia ${hostname}`, () => {
      expect(isBlockedHostname(hostname)).toBe(true);
    });
  }

  const permitidos = ['exemplo.com.br', 'g1.globo.com', 'moz.com', 'ahrefs.com'];

  for (const hostname of permitidos) {
    it(`permite ${hostname}`, () => {
      expect(isBlockedHostname(hostname)).toBe(false);
    });
  }
});
