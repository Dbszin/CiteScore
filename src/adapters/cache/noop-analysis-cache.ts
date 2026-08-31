import type { Analysis } from '../../core/domain/analysis.js';
import type { AnalysisCache } from '../../core/ports/analysis-cache.js';

/**
 * Cache que não guarda nada. É o que roda em desenvolvimento, sem Redis.
 *
 * Não leva `assertNotProduction`, ao contrário dos adapters locais de rate
 * limit e de orçamento — e a diferença importa.
 *
 * Aqueles precisam derrubar o boot em produção porque contador em memória
 * NÃO PROTEGE nada: um teto que não conta deixa passar abuso e gasto, em
 * silêncio. Cache ausente não deixa passar nada; só faz o produto pagar por
 * análise repetida. É mais caro, não é inseguro — então bloquear o deploy por
 * causa dele seria confundir economia com proteção.
 *
 * Na prática o container monta o cache do Redis sempre que há credencial, e
 * ela já é obrigatória em produção por causa das guardas. Este adapter existe
 * para o desenvolvimento local se comportar como antes: toda análise roda de
 * verdade, que é o que se quer ao mexer no pipeline.
 */
export class NoopAnalysisCache implements AnalysisCache {
  /*
   * Os parametros sao declarados mesmo sem uso: omiti-los faz o TypeScript
   * inferir aridade zero para QUEM SEGURA O TIPO CONCRETO, e chamar
   * `set(chave, analise)` numa variavel tipada `NoopAnalysisCache` passa a
   * nao compilar. O adapter fica com assinatura menor que a porta que ele
   * implementa, o que e' valido em TypeScript e confuso na pratica.
   */
  async get(_key: string): Promise<Analysis | null> {
    return null;
  }

  async set(_key: string, _analysis: Analysis): Promise<void> {
    // Intencionalmente vazio.
  }
}
