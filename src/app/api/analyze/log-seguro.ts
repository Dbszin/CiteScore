/**
 * Política de log: a URL que o visitante enviou NÃO vai para o log.
 *
 * POR QUE ISTO EXISTE COMO CÓDIGO, e não como combinado.
 *
 * O levantamento antes do deploy achou um só vetor: o `catch` final da rota
 * registra o objeto de erro inteiro. Os registros de custo escrevem apenas
 * modelo e tokens, e a guarda de orçamento escreve uma chave com data — nenhum
 * dos dois toca na URL. Mas o erro inesperado carrega o que quiser: erro de
 * rede costuma trazer o endereço na mensagem, e uma biblioteca nova pode passar
 * a trazer amanhã.
 *
 * Combinado de equipe não sobrevive a uma dependência atualizada. Função com
 * teste, sim.
 *
 * O QUE ISTO NÃO É. Não é anonimato: o produto guarda a análise no Redis com a
 * URL na chave, por 24 horas (30 dias nos artigos em destaque). Isso está
 * documentado no README, e é diferente de espalhar a URL em log de plataforma,
 * que tem retenção e alcance que não controlamos.
 *
 * O risco é modesto — o produto só aceita página pública, e recusa o que está
 * atrás de login. Ainda assim, dado de usuário em log de terceiro é uma escolha,
 * e escolha merece ser feita de propósito.
 */

/** Qualquer coisa com esquema `http`/`https`. */
const URL_NO_TEXTO = /\bhttps?:\/\/[^\s"'<>)\]},]+/giu;

/** Domínio solto, sem esquema — `exemplo.com/artigo`. */
const DOMINIO_NO_TEXTO =
  /\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s"'<>)\]},]*)?/giu;

const MARCA = '[url removida]';

/**
 * Remove endereços de um texto qualquer.
 *
 * A segunda regra existe porque nem toda mensagem traz o esquema: undici
 * reporta `getaddrinfo ENOTFOUND exemplo.com`, e cortar só o que começa com
 * `http` deixaria o domínio passar.
 *
 * AS DUAS SE SOBREPÕEM DE PROPÓSITO, e a redundância foi medida: numa
 * sabotagem, tirar o `g` da primeira regra NÃO produziu vazamento — a segunda
 * pegou o que sobrou. É defesa em camadas, e quem mexer numa delas deve saber
 * que a outra está cobrindo, em vez de concluir que a primeira é inútil.
 */
export function removerUrls(texto: string): string {
  return texto.replace(URL_NO_TEXTO, MARCA).replace(DOMINIO_NO_TEXTO, MARCA);
}

export interface ErroParaLog {
  readonly nome: string;
  readonly mensagem: string;
  readonly pilha: string | null;
}

/**
 * Reduz um erro ao que dá para registrar sem carregar dado do visitante.
 *
 * Preserva nome, mensagem e pilha — que é o que serve para depurar — e passa
 * os três pelo filtro. Registrar o objeto cru era o problema; registrar nada
 * seria trocar um defeito por outro, porque falha em produção sem log é falha
 * que ninguém conserta.
 */
export function paraLogSeguro(erro: unknown): ErroParaLog {
  if (erro instanceof Error) {
    return {
      nome: erro.name,
      mensagem: removerUrls(erro.message),
      pilha: erro.stack === undefined ? null : removerUrls(erro.stack),
    };
  }
  return {
    nome: typeof erro,
    mensagem: removerUrls(String(erro)),
    pilha: null,
  };
}
