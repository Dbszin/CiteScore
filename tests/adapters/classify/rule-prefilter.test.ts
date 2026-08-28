import { describe, expect, it } from 'vitest';

import {
  RulePrefilter,
  matchSignals,
} from '../../../src/adapters/classify/rule-prefilter.js';
import { EN_SIGNALS } from '../../../src/adapters/classify/signals/en.js';
import { PT_BR_SIGNALS } from '../../../src/adapters/classify/signals/pt-br.js';
import type { ExtractedContent } from '../../../src/core/domain/extracted-content.js';
import type { Sentence } from '../../../src/core/domain/sentence.js';

function content(language: 'pt-BR' | 'en' = 'pt-BR'): ExtractedContent {
  return {
    url: 'https://exemplo.test/artigo',
    title: 'Artigo',
    text: '',
    language,
    wordCount: 500,
    shape: {
      readerable: true,
      linkCount: 5,
      headingCount: 3,
      charsPerWord: 6,
      linksPerWord: 0.01,
    },
  };
}

function sentence(text: string, id = 0): Sentence {
  return { id, text, start: 0, end: text.length, analyzable: true };
}

const prefilter = new RulePrefilter();

describe('RulePrefilter — casos de decisão direta (ADR-002)', () => {
  it('classifica SOURCED sem LLM: atribuição nomeada + percentual', () => {
    const verdict = prefilter.evaluate(
      sentence('Segundo o IBGE, a inflação fechou 2024 em 4,8%.'),
      content(),
    );
    expect(verdict.kind).toBe('decided');
    if (verdict.kind === 'decided') {
      expect(verdict.classification.category).toBe('SOURCED');
      expect(verdict.classification.decidedBy).toBe('rules');
      expect(verdict.classification.signals).toContain('atribuicao_nomeada');
    }
  });

  it('classifica OPINION sem LLM: primeira pessoa avaliativa', () => {
    const verdict = prefilter.evaluate(
      sentence('Na minha opinião, essa é a melhor abordagem.'),
      content(),
    );
    expect(verdict.kind).toBe('decided');
    if (verdict.kind === 'decided') {
      expect(verdict.classification.category).toBe('OPINION');
      expect(verdict.classification.decidedBy).toBe('rules');
    }
  });
});

describe('RulePrefilter — escalonamento', () => {
  it('ESCALA falsa autoridade: o coração do produto', () => {
    const verdict = prefilter.evaluate(
      sentence('Estudos mostram que a maioria das empresas já adotou a prática.'),
      content(),
    );
    expect(verdict.kind).toBe('escalate');
    if (verdict.kind === 'escalate') {
      expect(verdict.signals).toContain('falsa_autoridade');
    }
  });

  it('ESCALA afirmação factual sem fonte — candidata a UNSOURCED', () => {
    const verdict = prefilter.evaluate(
      sentence('A adoção de inteligência artificial cresceu muito no setor jurídico.'),
      content(),
    );
    expect(verdict.kind).toBe('escalate');
  });

  it('ESCALA quando há sinal de fonte MAS também hedge', () => {
    const verdict = prefilter.evaluate(
      sentence('Segundo a Abrasel, possivelmente 30% dos bares fecharam em 2024.'),
      content(),
    );
    // Hedge presente derruba a decisão direta, mesmo com atribuição + número.
    expect(verdict.kind).toBe('escalate');
  });

  it('ESCALA número solto sem atribuição', () => {
    const verdict = prefilter.evaluate(
      sentence('O mercado movimentou 42 milhões no período analisado.'),
      content(),
    );
    expect(verdict.kind).toBe('escalate');
  });

  it('ESCALA recomendação imperativa (não é primeira pessoa avaliativa)', () => {
    const verdict = prefilter.evaluate(
      sentence('Você deve revisar suas meta tags antes de publicar o artigo.'),
      content(),
    );
    expect(verdict.kind).toBe('escalate');
  });
});

describe('Tabelas de sinais — regressões encontradas em teste', () => {
  it('percentual é detectado como quantidade', () => {
    // Bug corrigido: o `\b` no fim do padrão nunca casa depois de `%`,
    // porque `%` não é caractere de palavra. O efeito era que percentual —
    // o sinal de fonte mais comum em conteúdo de SEO — jamais era detectado.
    const { kinds } = matchSignals('A taxa subiu para 78% no período.', PT_BR_SIGNALS);
    expect(kinds.has('source_quantity')).toBe(true);
  });

  it('percentual também é detectado em inglês', () => {
    const { kinds } = matchSignals('The rate rose to 78% last year.', EN_SIGNALS);
    expect(kinds.has('source_quantity')).toBe(true);
  });

  it('atribuição casa com conector capitalizado no início da frase', () => {
    // Bug corrigido: o padrão não tinha flag `i` no conector, então
    // "Segundo o IBGE" (começo de frase) não casava.
    for (const texto of [
      'Segundo o IBGE, a inflação caiu.',
      'segundo o IBGE, a inflação caiu.',
      'De acordo com a Serasa, o número cresceu.',
      'Dados do Banco Central mostram queda.',
    ]) {
      const { kinds } = matchSignals(texto, PT_BR_SIGNALS);
      expect(kinds.has('source_attribution'), texto).toBe(true);
    }
  });

  it('atribuição NÃO casa sem entidade nomeada', () => {
    // "segundo o relatório" é afirmação sem fonte disfarçada de fonte.
    for (const texto of [
      'Segundo o relatório, o número cresceu.',
      'De acordo com a pesquisa, muitos concordam.',
    ]) {
      const { kinds } = matchSignals(texto, PT_BR_SIGNALS);
      expect(kinds.has('source_attribution'), texto).toBe(false);
    }
  });

  it('atribuição em inglês aceita determinante antes da entidade', () => {
    const { kinds } = matchSignals(
      'According to the World Bank, growth slowed.',
      EN_SIGNALS,
    );
    expect(kinds.has('source_attribution')).toBe(true);
  });
});

describe('RulePrefilter — falso positivo confiante (regressão)', () => {
  /**
   * O achado mais grave da revisão: estas sentenças eram classificadas
   * SOURCED por REGRA, com confiança 0.92 e SEM FONTE ALGUMA. `[Ss]egundo`
   * casava o ordinal em title case como se fosse a preposição de atribuição.
   *
   * Erro que empurra o score PARA CIMA e é decidido por regra, sem passar
   * pelo LLM — exatamente o que a ADR-002 diz ser inaceitável, e o pior tipo
   * de erro para um produto que mede honestidade factual.
   */
  const ordinaisEmTitleCase = [
    'No Segundo Trimestre de 2024, a empresa cresceu bastante.',
    'O Segundo Boletim de 2023 trouxe novidades importantes.',
    'Do Segundo Semestre de 2022 em diante o quadro mudou.',
    'A equipe ficou em Segundo Lugar na competição de 2024.',
  ];

  for (const texto of ordinaisEmTitleCase) {
    it(`NÃO decide SOURCED: ${texto}`, () => {
      const verdict = prefilter.evaluate(sentence(texto), content());
      expect(verdict.kind).toBe('escalate');
    });
  }

  it('a atribuição legítima continua decidindo SOURCED', () => {
    // A correção não pode ter matado o caso verdadeiro junto com o falso.
    const verdict = prefilter.evaluate(
      sentence('Segundo o IBGE, a inflação fechou 2024 em 4,8%.'),
      content(),
    );
    expect(verdict.kind).toBe('decided');
    if (verdict.kind === 'decided') {
      expect(verdict.classification.category).toBe('SOURCED');
    }
  });

  it('o desqualificador aparece nos sinais, para explicação na UI', () => {
    const verdict = prefilter.evaluate(
      sentence('No Segundo Trimestre de 2024, a empresa cresceu bastante.'),
      content(),
    );
    if (verdict.kind === 'escalate') {
      expect(verdict.signals).toContain('segundo_ordinal_nao_atribuicao');
    }
  });
});

describe('RulePrefilter — invariante inviolável', () => {
  const corpus = [
    'A adoção de IA cresceu muito no setor jurídico brasileiro.',
    'Estudos mostram que a maioria das empresas já adotou a prática.',
    'O mercado movimentou 42 milhões no período analisado.',
    'Segundo o IBGE, a inflação fechou 2024 em 4,8%.',
    'Na minha opinião, essa é a melhor abordagem para o problema.',
    'Você deve revisar suas meta tags antes de publicar.',
    'Essa ferramenta é absolutamente essencial para qualquer equipe.',
    'Talvez o cenário mude nos próximos meses conforme o mercado reage.',
    'Muitos profissionais ainda ignoram completamente esse detalhe técnico.',
    'A empresa foi fundada em 1998 na cidade de São Paulo.',
    'Aparentemente o algoritmo passou a priorizar conteúdo mais recente.',
    'De acordo com a Serasa, 72 milhões de brasileiros estão inadimplentes.',
  ];

  it('NENHUMA sentença recebe UNSOURCED por regra', () => {
    for (const text of corpus) {
      const verdict = prefilter.evaluate(sentence(text), content());
      if (verdict.kind === 'decided') {
        expect(verdict.classification.category).not.toBe('UNSOURCED');
      }
    }
  });

  it('vale também para o corpus em inglês', () => {
    const enCorpus = [
      'AI adoption grew significantly across the legal sector.',
      'Studies show that most companies have already adopted the practice.',
      'The market moved 42 million during the analyzed period.',
      'According to Gartner, spending rose 12% in 2024.',
      'In my opinion, this is the best approach available.',
      'You should review your meta tags before publishing.',
      'Many professionals still overlook this technical detail entirely.',
    ];
    for (const text of enCorpus) {
      const verdict = prefilter.evaluate(sentence(text), content('en'));
      if (verdict.kind === 'decided') {
        expect(verdict.classification.category).not.toBe('UNSOURCED');
      }
    }
  });
});
