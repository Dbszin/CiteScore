import type { Analysis } from '../../core/domain/analysis.js';
import type { AnalysisCache } from '../../core/ports/analysis-cache.js';
import type { RedisClient } from '../redis/redis-client.js';

/**
 * Cache de análise no Redis, COMPARTILHADO por todos os visitantes.
 *
 * ⚠️ ELE FALHA ABERTO, ao contrário das guardas de custo, e a diferença é
 * deliberada.
 *
 * Rate limit e teto de orçamento falham FECHADOS: "não consegui decidir" vira
 * recusa, porque deixar passar sem contar é o que o abuso explora. Aqui é o
 * inverso — falhar fechado transformaria o Redis fora do ar numa interrupção
 * do produto inteiro, para proteger uma economia. O pior caso de falhar aberto
 * é pagar uma análise que já estava guardada.
 */

/**
 * 24 horas.
 *
 * Não é arbitrário: é o prazo em que o artigo de terceiro provavelmente não
 * mudou, e curto o bastante para que quem editou o próprio texto ontem receba
 * medição nova hoje. Quem editou HOJE tem o caminho do `refresh`, que ignora
 * o cache — sem ele, o cache economizaria dinheiro quebrando o caso de uso
 * principal do produto.
 */
export const CACHE_TTL_SECONDS = 24 * 60 * 60;

/**
 * Teto do que vale a pena guardar.
 *
 * O `Analysis` carrega o texto INTEIRO do artigo; um artigo grande passa de
 * 100 KB de JSON. Acima deste tamanho o custo de rede da leitura começa a
 * competir com o da análise, e a REST do Upstash tem limite de corpo. Não
 * cachear é sempre melhor que estourar.
 */
export const MAX_CACHED_BYTES = 400_000;

export class RedisAnalysisCache implements AnalysisCache {
  constructor(private readonly redis: RedisClient) {}

  async get(key: string): Promise<Analysis | null> {
    let bruto: string | null;
    try {
      bruto = await this.redis.get(key);
    } catch {
      // Indistinguível de "não tinha", de propósito: quem chama não deve
      // tomar decisão diferente por causa de um cache indisponível.
      return null;
    }
    if (bruto === null) return null;

    try {
      const valor: unknown = JSON.parse(bruto);
      // Confere a FORMA antes de confiar. O que está no Redis foi gravado por
      // uma versão anterior do código, e um cast cego devolveria um objeto
      // incompleto que só explode lá na tela.
      return ehAnalise(valor) ? valor : null;
    } catch {
      return null;
    }
  }

  async set(key: string, analysis: Analysis): Promise<void> {
    try {
      const serializado = JSON.stringify(analysis);
      if (serializado.length > MAX_CACHED_BYTES) return;
      await this.redis.setWithTtl(key, serializado, CACHE_TTL_SECONDS);
    } catch {
      // Gravar é otimização. Falhar aqui não pode derrubar uma análise que já
      // foi feita e paga.
    }
  }
}

/**
 * Validação de forma do que veio do Redis.
 *
 * Cobre os campos que a tela e o score realmente consomem — não é validação
 * exaustiva, é a mesma checagem defensiva que o cliente já faz sobre a
 * resposta da API, pela mesma razão: dado de fora da fronteira não é confiável
 * só porque nós o gravamos ontem.
 */
function ehAnalise(valor: unknown): valor is Analysis {
  if (typeof valor !== 'object' || valor === null) return false;
  const objeto = valor as Record<string, unknown>;

  return (
    typeof objeto['url'] === 'string' &&
    typeof objeto['scoreVersion'] === 'string' &&
    typeof objeto['outcome'] === 'object' &&
    objeto['outcome'] !== null &&
    typeof objeto['breakdown'] === 'object' &&
    objeto['breakdown'] !== null &&
    typeof objeto['methodology'] === 'object' &&
    objeto['methodology'] !== null &&
    Array.isArray(objeto['sentences']) &&
    Array.isArray(objeto['classifications'])
  );
}
