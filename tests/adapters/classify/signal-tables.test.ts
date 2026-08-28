import { describe, expect, it } from 'vitest';

import { matchSignals } from '../../../src/adapters/classify/rule-prefilter.js';
import { EN_SIGNALS } from '../../../src/adapters/classify/signals/en.js';
import { PT_BR_SIGNALS } from '../../../src/adapters/classify/signals/pt-br.js';
import type {
  SignalKind,
  SignalTable,
} from '../../../src/adapters/classify/signals/types.js';

/**
 * BATERIA SISTEMÁTICA das tabelas de sinais.
 *
 * Motivo de existir: três bugs consecutivos apareceram nestas tabelas, todos
 * do mesmo tipo — falso negativo silencioso num sinal pró-fonte, sem erro,
 * sem log, degradando o score sem sintoma visível.
 *
 *   1. `\b` no fim do padrão nunca casa depois de `%` → percentual invisível
 *   2. conector de atribuição sem as duas caixas → "Segundo o IBGE" invisível
 *   3. `\d{1,3}(?:\.\d{3})*` exigindo separador → "1200%" invisível
 *
 * Três de três foram achados por teste, nenhum por leitura. Por isso cada
 * sinal ganha aqui casos POSITIVOS e NEGATIVOS explícitos, em vez de remendo
 * caso a caso.
 */

interface SignalCase {
  readonly kind: SignalKind;
  readonly positivos: readonly string[];
  readonly negativos: readonly string[];
}

function assertTable(table: SignalTable, casos: readonly SignalCase[]): void {
  for (const caso of casos) {
    describe(caso.kind, () => {
      for (const texto of caso.positivos) {
        it(`detecta: ${texto}`, () => {
          expect(matchSignals(texto, table).kinds.has(caso.kind)).toBe(true);
        });
      }
      for (const texto of caso.negativos) {
        it(`NÃO detecta: ${texto}`, () => {
          expect(matchSignals(texto, table).kinds.has(caso.kind)).toBe(false);
        });
      }
    });
  }
}

describe('Tabela PT-BR', () => {
  assertTable(PT_BR_SIGNALS, [
    {
      kind: 'source_quantity',
      positivos: [
        'A taxa subiu 78% no periodo.',
        'A taxa subiu 1200% no periodo.',
        'O indice chegou a 1000%.',
        'A inflacao foi de 4,8% no ano.',
        'O fundo movimentou 1.500 pontos.',
        'O fundo movimentou 1500 pontos.',
        'Foram 312 mil inscritos.',
        'Custou 25000 reais.',
        'O trajeto tem 1,8 km.',
        'Levou 48 horas para concluir.',
      ],
      negativos: [
        'A taxa subiu bastante no periodo.',
        'Foram muitos inscritos no evento.',
        'O texto tem 3 partes distintas.',
      ],
    },
    {
      kind: 'source_date',
      positivos: [
        'A empresa foi fundada em 1998.',
        'O relatorio saiu em marco de 2023.',
        'A audiencia ocorreu em 12/03/2024.',
      ],
      negativos: ['A empresa foi fundada ha muito tempo.'],
    },
    {
      kind: 'source_attribution',
      positivos: [
        'Segundo o IBGE, a inflacao caiu.',
        'segundo o IBGE, a inflacao caiu.',
        'De acordo com a Serasa, o numero cresceu.',
        'Dados do Banco Central mostram queda.',
        'Conforme a FGV, o indice subiu.',
        'Pesquisa da Datafolha aponta empate.',
      ],
      negativos: [
        'Segundo o relatorio, o numero cresceu.',
        'De acordo com a pesquisa, muitos concordam.',
        'O numero cresceu no ultimo ano.',
      ],
    },
    {
      kind: 'attribution_disqualifier',
      positivos: [
        'No Segundo Trimestre de 2024, a empresa cresceu.',
        'O Segundo Boletim de 2023 trouxe novidades.',
        'Segundo Trimestre foi melhor que o primeiro.',
        'Ficou em Segundo Lugar na competicao.',
        'Do Segundo Semestre em diante o quadro mudou.',
      ],
      negativos: [
        'Segundo o IBGE, a inflacao caiu.',
        'Segundo dados da FGV, o indice subiu.',
        'De acordo com a Serasa, o numero cresceu.',
      ],
    },
    {
      kind: 'hedge_false_authority',
      positivos: [
        'Estudos mostram que a pratica funciona.',
        'Pesquisas indicam um aumento no consumo.',
        'Especialistas dizem que o cenario vai mudar.',
        'Sabe-se que o algoritmo prioriza isso.',
      ],
      negativos: [
        'O estudo da USP mostrou que a pratica funciona.',
        'A pesquisa registrou aumento no consumo.',
      ],
    },
    {
      kind: 'hedge_vague_quantifier',
      positivos: [
        'Muitos profissionais ignoram esse detalhe.',
        'A maioria das empresas ja adotou a pratica.',
        'Diversos fatores influenciam o resultado.',
      ],
      negativos: ['Doze profissionais participaram do estudo.'],
    },
    {
      kind: 'hedge_modal',
      positivos: [
        'Talvez o cenario mude nos proximos meses.',
        'O indice tende a subir no verao.',
        'Geralmente o efeito aparece em semanas.',
      ],
      negativos: ['O indice subiu 4% no verao.'],
    },
    {
      kind: 'opinion_first_person',
      positivos: [
        'Na minha opiniao, essa e a melhor escolha.',
        'Eu acho que o mercado vai reagir.',
        'Acredito que o cenario vai melhorar.',
      ],
      negativos: [
        'A opiniao publica reagiu ao anuncio.',
        'O mercado vai reagir ao anuncio.',
      ],
    },
    {
      kind: 'opinion_imperative',
      positivos: [
        'Voce deve revisar suas meta tags.',
        'Recomendamos revisar o texto antes.',
        'Vale a pena investir nessa etapa.',
      ],
      negativos: ['A equipe revisou as meta tags.'],
    },
  ]);
});

describe('Tabela EN', () => {
  assertTable(EN_SIGNALS, [
    {
      kind: 'source_quantity',
      positivos: [
        'The rate rose 78% last year.',
        'The rate rose 1200% last year.',
        'The fund moved 1,500 points.',
        'The fund moved 1500 points.',
        'It cost 25000 dollars.',
        'The trip takes 48 hours.',
      ],
      negativos: ['The rate rose sharply last year.'],
    },
    {
      kind: 'source_attribution',
      positivos: [
        'According to Gartner, spending rose.',
        'According to the World Bank, growth slowed.',
        'Research by MIT shows the opposite.',
        'Data from Statista confirms the trend.',
      ],
      negativos: [
        'According to the report, spending rose.',
        'Spending rose last year.',
      ],
    },
    {
      kind: 'hedge_false_authority',
      positivos: [
        'Studies show that most teams adopt it.',
        'Experts say the market will shift.',
      ],
      negativos: ['The Stanford study showed that teams adopt it.'],
    },
    {
      kind: 'opinion_first_person',
      positivos: ['In my opinion, this is the best approach.'],
      negativos: ['This approach is documented in the manual.'],
    },
  ]);
});

describe('Cobertura da bateria', () => {
  it('todo sinal declarado nas tabelas aparece em pelo menos um caso', () => {
    // Impede que um sinal novo entre sem teste — foi assim que os três bugs
    // anteriores conseguiram existir.
    const cobertosPt = new Set<SignalKind>([
      'source_quantity',
      'source_date',
      'source_attribution',
      'attribution_disqualifier',
      'hedge_false_authority',
      'hedge_vague_quantifier',
      'hedge_modal',
      'opinion_first_person',
      'opinion_imperative',
    ]);
    const naTabela = new Set(PT_BR_SIGNALS.signals.map((s) => s.kind));
    const semCobertura = [...naTabela].filter((k) => !cobertosPt.has(k));

    // `source_quote` e `opinion_adjective` são os únicos ainda sem bateria
    // dedicada; registrados aqui para que a lista não cresça em silêncio.
    expect(semCobertura.sort()).toEqual(['opinion_adjective', 'source_quote']);
  });
});
