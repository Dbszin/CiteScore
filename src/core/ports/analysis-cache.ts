import type { Analysis } from '../domain/analysis.js';

/**
 * Cache de análise, COMPARTILHADO entre todos os visitantes.
 *
 * POR QUE ELE EXISTE. Num link público, a maioria das pessoas clica no exemplo
 * em vez de colar uma URL própria. Sem cache, 100 pessoas analisando o mesmo
 * artigo são 100 análises pagas — e o teto diário se esgota no primeiro dia,
 * fazendo todo mundo que chegar depois ver "tente amanhã". O cache é o que
 * impede a demonstração de se auto-desligar no lançamento.
 *
 * NÃO É PROBLEMA DE PRIVACIDADE: as URLs são artigos públicos e o conteúdo
 * guardado já é público — qualquer um poderia abrir a página. Nada sobre QUEM
 * pediu é armazenado; a chave é derivada só da URL.
 *
 * ⚠️ TENSÃO REAL COM O CASO DE USO PRINCIPAL, e ela é a razão de `refresh`
 * existir. O usuário-alvo edita o artigo, acrescenta fontes e volta para
 * conferir se melhorou. Servir resultado velho a ele faz o produto parecer
 * quebrado — ou pior, faz a reescrita dele parecer inútil. Um cache sem
 * caminho de contorno economiza dinheiro quebrando o produto.
 */
export interface AnalysisCache {
  /**
   * `null` quando não há nada guardado — e TAMBÉM quando a consulta falhou.
   *
   * A indistinção é deliberada: quem chama não deve tomar decisão diferente
   * por causa de um cache indisponível. Falha de cache vira "não tinha", a
   * análise roda normal, e o produto continua funcionando com o Redis fora do
   * ar. Cache é conveniência, nunca dependência.
   */
  get(key: string): Promise<Analysis | null>;

  /** Nunca lança: falha ao gravar é ignorada, pelo mesmo motivo. */
  set(key: string, analysis: Analysis): Promise<void>;
}
