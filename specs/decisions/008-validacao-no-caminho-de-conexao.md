# ADR-008: A validação de endereço migra para o caminho de conexão

- **Status:** aceita
- **Data:** 2026-08-28
- **Contexto de:** [003-hardening-deploy](../changes/003-hardening-deploy/)
- **Relaciona-se com:** [ADR-001](001-arquitetura-hexagonal.md)

## Contexto

O produto aceita uma URL arbitrária de um visitante anônimo e faz uma requisição
**de servidor** para ela. Sem defesa, isso é um proxy aberto para a rede interna
de quem hospeda — o risco `critical` do projeto.

As defesas implementadas em `HttpContentFetcher` e `private-address.ts` são
sólidas e foram testadas com 53 casos: faixas privadas, loopback, metadata de
nuvem, IPv4-mapeado em hexadecimal, revalidação após cada redirect, falha
fechada em endereço não-parseável, deadline total e cap durante o stream.

**Mas todas compartilham um defeito estrutural.** O fluxo atual é:

```
1. assertPublicHost(url)  →  resolveAddresses(hostname)  →  valida os IPs
2. request(url)           →  fetch(hostname)             →  RESOLVE DE NOVO
```

O passo 1 valida os endereços de **uma** resolução. O passo 2 abre o socket a
partir de **outra** resolução, feita independentemente pela camada de rede. São
duas perguntas separadas ao DNS, e nada garante que a resposta seja a mesma.

Um atacante que controle o servidor DNS do próprio domínio responde com TTL zero:
um IP público na primeira consulta, `169.254.169.254` na segunda. A validação
roda, aprova, e o socket conecta em outro lugar. É o **DNS rebinding**, e a
janela é a definição de TOCTOU — *time of check to time of use*.

Vale dizer o que isso **não** é: não é um bug de implementação da validação. A
lista de faixas está correta, a falha é fechada, o IPv6 é expandido. O problema
é que a validação e o uso olham para coisas diferentes.

## Decisão

**A validação deixa de ser um passo anterior à conexão e passa a ser parte do
caminho de conexão.**

Em vez de "resolver, validar e depois conectar por nome", o fetcher passa a
conectar através de uma função de resolução própria, que valida cada endereço
**no momento em que a camada de rede pede um endereço para abrir o socket**.

```
1. request(url) → socket pede endereço → nossa lookup resolve E valida
                                       → devolve só endereço aprovado
                                       → socket conecta nesse endereço
```

O check e o use passam a ser a mesma operação. Não existe mais janela entre eles
porque não existem mais duas resoluções: **a única fonte de endereços para o
socket é a nossa função validadora.** Um endereço que ela não aprovou não tem
como chegar ao socket, porque não há outro caminho por onde ele viesse.

Essa é a diferença entre "conferir antes" e "não ter como não conferir".

### Por que não fixar o IP reescrevendo a URL

A alternativa aparentemente óbvia — validar o IP e então requisitar
`https://93.184.216.34/` com cabeçalho `Host: exemplo.com` — foi rejeitada:

- **Quebra a validação de certificado TLS.** O SNI passa a anunciar o IP, e o
  certificado do servidor é emitido para o nome. A conexão falha, ou pior,
  alguém "resolve" desabilitando a verificação — trocando uma vulnerabilidade
  por outra.
- **Vaza para o conteúdo.** URLs relativas, `<base>`, e o `finalUrl` que
  entregamos ao extrator passariam a carregar o IP em vez do nome.
- **Não cobre os redirects** sem repetir a mesma cirurgia a cada salto.

A resolução customizada não tem nenhum desses problemas: a conexão continua
sendo feita **para o nome**, com SNI e verificação de certificado normais; só o
endereço de destino vem de fonte controlada.

## Consequências

### O que melhora

- A janela de TOCTOU deixa de existir, e deixa de existir **por construção**,
  não por uma checagem extra que alguém pode remover.
- A revalidação por salto de redirect continua valendo e fica mais barata: cada
  novo salto abre nova conexão, e nova conexão passa pela mesma função.
- `private-address.ts` não muda em nada. A lógica pura já está correta e testada;
  o que muda é **onde** ela é chamada.

### O que piora, e é aceito

- **Acopla o fetcher a um detalhe da camada de transporte.** A função de
  resolução é um conceito de socket, não de domínio. Isso é aceitável porque
  `HttpContentFetcher` é um adapter — é exatamente o lugar da ADR-001 onde
  detalhe de infraestrutura pode viver. Nada disso atravessa `src/core/**`.
- **Custa uma dependência ou uma reescrita.** Ver o trade-off abaixo; a decisão
  de qual caminho seguir tem um critério de verificação obrigatório.
- **Resolução duplicada some, mas o cache de DNS do sistema continua existindo.**
  Não controlamos o resolvedor do SO. Isso não reabre a janela — o endereço que
  o socket usa continua sendo o que nossa função devolveu — mas significa que
  não temos garantia de estar vendo a resposta mais recente do DNS autoritativo.
  Irrelevante para a defesa: validamos o que vai ser usado.

### Duas resoluções aprovadas para o mesmo hostname

Quando um nome resolve para vários endereços, a decisão é **falhar se qualquer
um deles for bloqueado**, e não "usar os aprovados e ignorar o resto". Um nome
que aponta simultaneamente para um IP público e para `169.254.169.254` não é uma
configuração legítima que devemos tolerar: é a assinatura do ataque.

Isso preserva o comportamento que `assertPublicHost` já tem hoje.

## Trade-off de implementação, com critério de decisão

Duas rotas viáveis. A escolha entre elas **não deve ser feita por leitura de
documentação** — este projeto já registrou dois casos em que a superfície real
da API divergiu do que a spec assumia.

**Rota A — `Agent` do undici com `connect.lookup`.** Mantém `fetch`, `Response` e
o stream do corpo como estão. Mudança pequena e cirúrgica. Risco: o `dispatcher`
precisa de fato ter efeito sob o `fetch` do Node dentro do Next, e a versão do
`undici` instalado precisa casar com a embutida no runtime.

**Rota B — `node:https.request` com a opção `lookup`.** Sem dependência nova, API
documentada e estável do Node. Custo: reescrever o transporte, e assumir
manualmente a descompressão `gzip`/`br` que o `fetch` faz de graça — o que
obriga a decidir se o cap de bytes vale sobre o conteúdo comprimido, o
descomprimido, ou ambos (defesa contra *zip bomb*).

**Critério:** tentar a Rota A e **provar em execução** que a função de resolução
customizada é chamada, com um teste que a faz devolver um endereço bloqueado na
segunda invocação e exige que a requisição seja recusada. Se a prova falhar,
seguir para a Rota B e registrar o motivo.

Um teste que apenas verifica que a requisição funciona não prova nada aqui:
a rota A falha em silêncio se o dispatcher for ignorado, e o comportamento
observável continua o mesmo.

## Alternativas descartadas

- **Lista de permissão de domínios.** Elimina o risco e o produto junto: a
  proposta é analisar qualquer artigo público.
- **Deixar o problema para a camada de rede da Vercel.** Não há garantia de
  isolamento de saída no runtime serverless, e depender de uma propriedade não
  documentada da plataforma para uma defesa `critical` não é aceitável.
- **Aceitar o risco com base na baixa exposição.** O repositório é público, o
  endpoint é anônimo, e o alvo típico do rebinding é o endpoint de metadata do
  provedor — de onde saem credenciais. O impacto não é baixo.
