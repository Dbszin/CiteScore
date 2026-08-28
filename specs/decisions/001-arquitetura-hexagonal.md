# ADR-001 — Arquitetura Hexagonal (Ports & Adapters) para o motor de análise

- **Data:** 2026-08-27
- **Status:** aceita
- **Contexto do change:** [001-analisador-densidade-factual](../changes/001-analisador-densidade-factual/)

## Contexto

O motor de análise é o ativo do produto e a parte de maior risco: se a classificação não for boa, não existe produto. Ele precisa ser exercitado centenas de vezes em corpus real durante a calibração (M2), muito antes de existir qualquer UI.

Ao mesmo tempo, o motor depende de quatro coisas caras, lentas e não determinísticas: rede (fetch de URL), parsing de HTML, a Claude API e contadores de rate limit. Se essas dependências forem chamadas diretamente de dentro da lógica de scoring, calibrar exige rede e gasta dinheiro em cada execução de teste.

## Decisão

O domínio vive em `src/core/` e **não importa nada** de `next`, `@anthropic-ai/sdk`, `@mozilla/readability`, `fetch` ou de qualquer biblioteca de infraestrutura. Toda dependência externa entra por uma **porta** (interface em `src/core/ports/`) implementada por um **adapter** em `src/adapters/`.

Portas do v1:

| Porta | Responsabilidade | Adapter de produção | Adapter de teste |
|---|---|---|---|
| `ContentFetcher` | Buscar o HTML de uma URL | `HttpContentFetcher` | `FixtureFetcher` (lê de `tests/fixtures/`) |
| `ContentExtractor` | Extrair o conteúdo principal do HTML | `ReadabilityExtractor` | `FixtureExtractor` |
| `SentenceSegmenter` | Quebrar texto em sentenças | `IntlSentenceSegmenter` | o mesmo (é determinístico e gratuito) |
| `ClaimClassifier` | Classificar sentenças nas 3 categorias | `HybridClassifier` | `StubClassifier` / `RulesOnlyClassifier` |
| `RateLimiter` | Limitar requisições por IP | `RedisRateLimiter` | `AllowAllRateLimiter` |
| `BudgetGuard` | Barrar análise que estoure o teto de gasto | `RedisBudgetGuard` | `UnlimitedBudgetGuard` |
| `CostRecorder` | Registrar uso real de tokens por análise | `RedisCostRecorder` | `InMemoryCostRecorder` |
| `Clock` | Fornecer o instante atual | `SystemClock` | `FixedClock` |

O caso de uso `analyzeUrl` recebe todas as portas por injeção de construtor. A rota Next.js (`src/app/api/analyze/route.ts`) é um adapter de entrada: sua única responsabilidade é montar as dependências de produção, traduzir HTTP em chamada de caso de uso e traduzir erro de domínio em status HTTP.

`Clock` é porta por um motivo concreto: o budget guard raciocina sobre janelas de tempo, e testar janela de tempo com relógio real produz teste que falha em horários específicos.

## Consequências

**Positivas**

- Calibração roda offline sobre fixtures, sem rede e sem gastar com LLM, exceto quando o alvo é justamente medir o LLM.
- A fórmula do score é função pura e testável com tabela de entrada/saída.
- Trocar de modelo, de biblioteca de extração ou de provedor de rate limit é substituir um adapter, sem tocar em regra de negócio.
- Permite paralelizar os quatro adapters entre agentes distintos depois que M1 congelar as portas.

**Negativas**

- Mais arquivos e uma camada de indireção que um script único não teria. Para um v1 enxuto isso é custo real de navegação.
- Exige disciplina: um único import de infraestrutura dentro de `src/core/` já quebra a propriedade que justifica a arquitetura.

**Mitigação da negativa:** regra de lint `no-restricted-imports` proibindo imports de infraestrutura dentro de `src/core/**`. A disciplina passa a ser verificada pela máquina, não pela memória de quem revisa.

## Alternativas rejeitadas

- **Script monolítico em `lib/analyze.ts`.** Chega mais rápido ao primeiro resultado, e num v1 isso é argumento de peso. Rejeitado porque o marco de maior risco (M2) exige centenas de execuções sobre corpus, e sem portas cada execução custa rede e dinheiro. A arquitetura aqui existe para viabilizar a calibração, não por preferência estética.
- **Clean Architecture completa com camada de aplicação, DTOs e mappers.** Rejeitada por excesso: não há persistência, não há múltiplos clientes, não há modelo de leitura separado. A cerimônia extra não compraria nada no v1.
