# Spec Delta: Fetch sem janela de TOCTOU

## Current State

`HttpContentFetcher` valida endereços em `assertPublicHost`, chamado antes de
cada requisição e repetido a cada salto de redirect. A validação em si é
correta e está coberta por 53 casos de teste em `private-address.ts`.

O defeito é de fluxo, não de lógica: `assertPublicHost` resolve o DNS por
`resolveAddresses`, e em seguida `request` entrega o **hostname** ao `fetch`, que
resolve o DNS **de novo** para abrir o socket. Duas resoluções independentes, e
quem conecta é a segunda.

Um atacante com controle do próprio DNS responde com TTL zero: IP público na
primeira consulta, `169.254.169.254` na segunda. A validação aprova um endereço
e o socket conecta em outro.

## Changes

### MODIFIED

- **`HttpContentFetcher` deixa de validar endereço como passo separado.** A
  validação passa a acontecer dentro da resolução que o socket de fato usa. Ver
  [ADR-008](../../../../decisions/008-validacao-no-caminho-de-conexao.md).
- **`assertPublicHost` é removido** como método. Sua responsabilidade migra para
  `createValidatingLookup`, e o `AddressResolver` injetável passa a alimentar a
  função de resolução em vez da pré-checagem.

### ADDED

- **`createValidatingLookup`** em `src/adapters/fetch/validating-lookup.ts` —
  resolve o nome, valida cada endereço com `classifyAddress`, e devolve apenas
  os aprovados. Falha fechada.
- **Ponto de observação (`onResolved`)** para que o teste possa afirmar que a
  função foi de fato consultada. Sem isso, a Rota A da ADR-008 pode ser ignorada
  pelo runtime sem que nada no comportamento observável mude.

### UNCHANGED — e isto é deliberado

- **`private-address.ts` não é tocado.** A lógica pura está correta. Reescrevê-la
  junto com uma mudança de fluxo misturaria dois riscos e dificultaria atribuir
  a causa de qualquer regressão.
- **As demais defesas permanecem:** revalidação por salto, deadline total, cap
  durante o stream, ausência de credenciais nos cabeçalhos, `redirect: 'manual'`,
  bloqueio de `username`/`password` na URL, restrição a `http:`/`https:`.
- **`isBlockedHostname` continua na validação sintática da URL.** Ela não faz
  I/O, roda antes de qualquer resolução e é barata.

## Regras que não podem ser violadas

1. **Nenhum endereço chega ao socket sem passar pela validação.** Não é uma
   checagem adicional: é a ausência de qualquer outro caminho.
2. **Um conjunto misto rejeita o nome inteiro.** Hostname que resolve para um IP
   público e um bloqueado é recusado por completo. Preserva o comportamento
   atual de `assertPublicHost`.
3. **Endereço não-parseável é bloqueado.** `classifyAddress` devolve três
   estados justamente para que "não sei" nunca signifique "liberado".
4. **A conexão continua sendo feita PARA O NOME.** SNI e verificação de
   certificado inalterados. Só a escolha do endereço muda de fonte.

## Acceptance Criteria

- [ ] **Teste de rebinding:** resolvedor que devolve endereço público na primeira
      chamada e `169.254.169.254` na segunda faz a requisição ser recusada com
      `BLOCKED_HOST`. **Este é o critério que define a change.**
- [ ] **Teste de observação:** a função de resolução é comprovadamente invocada
      durante a requisição. Se o mecanismo de pinagem for ignorado pelo runtime,
      este teste falha.
- [ ] Conjunto misto público/privado rejeita o nome inteiro.
- [ ] Cada salto de redirect passa pela mesma validação.
- [ ] Requisição HTTPS a host público real mantém verificação de certificado —
      nenhuma regressão para conexão insegura.
- [ ] Os 53 casos de `private-address.test.ts` continuam passando sem alteração.
- [ ] Os testes existentes de `http-content-fetcher.test.ts` continuam passando,
      incluindo o de deadline total.

## Nota de verificação

Este projeto já registrou duas ocasiões em que a superfície real de uma API
divergiu do que a spec assumia, e uma em que um bug passou por revisão de código
porque o comportamento observável não mudou.

**Aqui o risco é o mesmo:** se o mecanismo de pinagem não tiver efeito, a
aplicação continua buscando páginas normalmente e nada parece errado. Só um
teste que force o cenário de ataque distingue pinagem real de pinagem ignorada.
Aceitar esta change sem esse teste é aceitar a aparência da correção.
