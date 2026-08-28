import type {
  SuggestionResult,
  SuggestionWriter,
} from '../../core/ports/suggestion-writer.js';

/**
 * Sugestões ainda não implementadas.
 *
 * Devolve lista vazia em vez de lançar: ausência de sugestão não é falha, e
 * marcar `suggestionsDegraded` aqui diria ao usuário que algo quebrou quando
 * nada quebrou. A UI simplesmente não renderiza a seção quando a lista vem
 * vazia — nenhuma tela promete sugestão que não existe.
 *
 * O adapter real (`ClaudeSuggestionWriter`) é escopo posterior; ele carrega a
 * instrução crítica de não inventar dados, e trocar este por aquele é uma
 * linha no container.
 */
export class NoopSuggestionWriter implements SuggestionWriter {
  async write(): Promise<SuggestionResult> {
    return { suggestions: [], usage: null };
  }
}
