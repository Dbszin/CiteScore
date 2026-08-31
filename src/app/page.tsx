import { Analyzer } from '../components/analyzer.js';
import { ArrowUp, Diamond, ExternalLink } from '../components/icons.js';

/**
 * A página, conforme `design-visual-2.md` § 6 e § 7: landing e ferramenta na
 * MESMA rota, com scroll.
 *
 * Duas regras de conteúdo governam este arquivo, e as duas são contrato:
 *
 * 1. **Nada aqui afirma o que o produto não mediu.** A ressalva integral vem
 *    do domínio (`DISCLAIMER_PT_BR`) e é renderizada por `Analyzer`, como
 *    primeiro filho do painel de resultado — ADR-004 item 3, que exige a
 *    ressalva NA REGIÃO DO RESULTADO, legível sem scroll, no mesmo nível
 *    hierárquico. A seção "O que não medimos" é a mesma verdade em forma
 *    escaneável, escrita como copy, e liga para o método.
 *
 * 2. **Nada aqui sugere afordância inexistente.** Não há login, plano, preço,
 *    prova social nem contador, porque não há autenticação, cobrança nem base
 *    de usuários. Elemento que sugere estado que não existe é mentira, mesmo
 *    quando é decorativo — foi por isso que a barra de progresso simulada saiu
 *    do produto.
 */

const REPO = 'https://github.com/Dbszin/CiteScore';

/** Os 5 estágios REAIS do pipeline, na ordem em que rodam. */
const STEPS = [
  {
    name: 'Baixa a página',
    note: 'Só HTTP público. Endereço privado e redirecionamento para rede interna são bloqueados na resolução de DNS, não antes dela.',
  },
  {
    name: 'Extrai o conteúdo',
    note: 'Separa o artigo do menu, do rodapé e do banner de cookie. Página de índice sem corpo próprio é recusada.',
  },
  {
    name: 'Segmenta em sentenças',
    note: 'Descarta título, item de lista e fragmento sem verbo — eles não são afirmações e inflariam a conta.',
  },
  {
    name: 'Classifica cada afirmação',
    note: 'Um pré-filtro de regras resolve os casos evidentes; o resto vai para o LLM em lote, com temperatura zero.',
  },
  {
    name: 'Calcula a proporção',
    note: 'Conta as três categorias sobre o total analisável. É divisão, não modelo — e é a parte que você pode auditar.',
  },
] as const;

/**
 * Os exemplos são ILUSTRAÇÃO ESCRITA À MÃO, não saída real do sistema, e o
 * rótulo "exemplo escrito à mão" na tela diz isso. Apresentar frase inventada
 * como resultado de análise seria fabricar evidência.
 */
const PENCILS = [
  {
    category: 'SOURCED',
    title: 'Com dado ou fonte',
    quote:
      '"Segundo o relatório de 2025 da Ahrefs, 96,6% das páginas não recebem tráfego de busca."',
    note: 'Traz número, fonte ou citação que alguém pode conferir. É o que um motor de busca — ou um leitor cético — consegue verificar.',
  },
  {
    category: 'UNSOURCED',
    title: 'Sem fonte',
    quote: '"A maioria dos sites não ranqueia bem porque ignora a intenção de busca."',
    note: 'Afirma um fato e não diz de onde ele vem. Não é necessariamente falso — é apenas não sustentado. É aqui que se reescreve.',
  },
  {
    category: 'OPINION',
    title: 'Opinião',
    quote: '"Esta é, na nossa visão, a estratégia mais sólida para qualquer site."',
    note: 'Juízo de valor, marcado como tal. Não é falha: opinião rotulada é legítima em texto editorial. Ela só não conta como afirmação sustentada.',
  },
] as const;

const NOT_MEASURED = [
  'citação real em ChatGPT, Perplexity ou AI Overviews',
  'posição no Google ou volume de tráfego',
  'qualidade da escrita ou profundidade do argumento',
  'se a fonte citada é confiável — só que ela existe',
] as const;

const MEASURED = [
  'a proporção de afirmações sustentadas por dado ou fonte no texto',
  'quais sentenças, especificamente, estão sem sustentação',
] as const;

/**
 * A seção "para que serve", em três papéis em vez de três números.
 *
 * "Como funciona" logo abaixo já é lista numerada, e duas listas numeradas
 * seguidas confundem em vez de esclarecer. Aqui o eixo é quem faz o quê.
 */
const USAGE = [
  {
    role: 'Você faz',
    text: 'Cola o link de um artigo já publicado. Sem cadastro, sem instalar nada.',
  },
  {
    role: 'Ele devolve',
    text: 'O seu artigo inteiro, remontado e marcado frase por frase: as que trazem dado ou fonte, as que afirmam um fato sem dizer de onde veio, e as que são opinião.',
  },
  {
    role: 'Você resolve',
    text: 'Vai direto nas frases marcadas como sem fonte e decide uma a uma: adicionar a referência, suavizar a afirmação, ou deixar como está de propósito.',
  },
] as const;

/**
 * Serve / não serve. A segunda linha é a que constrói confiança, e ela não é
 * palpite: os tipos de página listados foram MEDIDOS em
 * `scripts/medir-landing-pages.ts`.
 */
const FIT = [
  {
    kind: 'yes',
    tag: 'Serve para',
    text: 'Artigo de blog, guia, tutorial, documentação, post longo — antes de publicar, ou para auditar o que já está no ar.',
  },
  {
    kind: 'no',
    tag: 'Não serve para',
    text: 'Landing page e home de site: elas são feitas de título e frase curta, e o sistema descarta isso antes de medir. Também não serve para página atrás de login ou paywall, nem para idioma fora de português e inglês.',
  },
  {
    kind: 'no',
    tag: 'Limites',
    text: '10 análises por hora. Artigo muito longo é recusado em vez de medido pela metade.',
  },
] as const;

export default function Home() {
  return (
    <>
      <a className="skip" href="#analisar">
        Pular para a análise
      </a>

      <header className="topbar">
        <div className="shell topbar-in">
          <a className="wordmark" href="#top">
            <Diamond size={13} />
            CiteScore
          </a>
          <nav className="topnav" aria-label="Seções">
            <a href="#para-que-serve">Para que serve</a>
            <a href="#como-funciona">Como funciona</a>
            <a href="#metodo">Método</a>
            <a href={REPO} target="_blank" rel="noopener noreferrer">
              Código
              <ExternalLink />
            </a>
          </nav>
        </div>
      </header>

      <main id="top">
        {/* --- 1. Hero: a ferramenta É o herói, não um CTA que rola até ela --- */}
        <section className="shell hero" id="analisar">
          <span className="eyebrow rise">Análise de densidade factual</span>
          <h1 className="display-1 rise rise-1">
            Quanto do seu artigo se sustenta de verdade.
          </h1>
          <p className="lead rise rise-2">
            Cada afirmação do texto, classificada em três: tem dado ou fonte, não
            tem, ou é opinião.{' '}
            <span className="lead-long">
              Densidade de fonte é uma das alavancas mais fortes de GEO — e é a
              que dá para medir frase a frase.
            </span>
            <span className="lead-short">
              A alavanca de GEO que dá para medir frase a frase.
            </span>
          </p>
          <div className="rise rise-3">
            <Analyzer />
          </div>
        </section>

        {/* --- 2. Para que serve: a resposta direta, antes do mecanismo --- */}
        <section className="shell section" id="para-que-serve">
          <div className="section-head">
            <span className="eyebrow">Para que serve</span>
            <h2 className="display-2">Você escreveu. Ele aponta o que está sem fonte.</h2>
            <p className="prose" style={{ marginTop: 'var(--space-4)' }}>
              Todo artigo faz afirmações. Algumas trazem um número, um estudo ou
              uma fonte que dá para conferir. Outras afirmam e pronto. Este
              sistema separa umas das outras e mostra quais são quais — seja
              para revisar antes de publicar, seja para auditar conteúdo que já
              está no ar.
            </p>
          </div>

          <div className="usage">
            {USAGE.map((step) => (
              <div className="usage-step" key={step.role}>
                <span className="eyebrow">{step.role}</span>
                <p>{step.text}</p>
              </div>
            ))}
          </div>

          <div className="fit">
            {FIT.map((row) => (
              <div className={`fit-row fit-${row.kind}`} key={row.tag}>
                <span className="fit-tag">{row.tag}</span>
                <p>{row.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* --- 3. Como funciona --- */}
        <section className="shell section" id="como-funciona">
          <div className="section-head">
            <span className="eyebrow">Como funciona</span>
            <h2 className="display-2">Cinco passos, todos auditáveis.</h2>
          </div>
          <ol className="steps">
            {STEPS.map((step, index) => (
              <li className="step" key={step.name}>
                <span className="step-num">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3 className="step-name">{step.name}</h3>
                <p>{step.note}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* --- 4. Os três lápis --- */}
        <section className="shell section section-alt">
          <div className="section-head">
            <span className="eyebrow">As três categorias</span>
            <h2 className="display-2">Três lápis de revisor, de pesos iguais.</h2>
            <p className="prose small" style={{ marginTop: 'var(--space-4)' }}>
              Nenhuma das três é aprovação ou reprovação. Não há verde, amarelo e
              vermelho — semáforo diria que existe uma nota, e não existe.
            </p>
          </div>
          <div className="pencils">
            {PENCILS.map((pencil) => (
              <article className="pencil" key={pencil.category}>
                <span
                  className={`stroke stroke-${pencil.category} pencil-stroke`}
                  aria-hidden="true"
                />
                <h3>{pencil.title}</h3>
                <blockquote>{pencil.quote}</blockquote>
                <p className="pencil-note">{pencil.note}</p>
                <span className="pencil-tag">exemplo escrito à mão</span>
              </article>
            ))}
          </div>
        </section>

        {/* --- 5. O que não medimos: a honestidade como argumento --- */}
        <section className="shell section" id="metodo">
          <div className="section-head">
            <span className="eyebrow">Por que densidade factual</span>
            <h2 className="display-2">A alavanca que a pesquisa de GEO aponta.</h2>
          </div>
          <div className="claims">
            <div className="prose">
              <p>
                <strong>Generative Engine Optimization</strong> é a disciplina de
                fazer conteúdo ser encontrado e citado por motores generativos. A
                pesquisa da área já mediu quais mudanças de conteúdo têm mais
                efeito — e acrescentar citações, estatísticas e referências a
                fontes está entre as de maior impacto na visibilidade.
              </p>
              <p>
                É essa alavanca que o CiteScore mede. E ele não devolve um
                diagnóstico geral: devolve a lista das frases a corrigir, que é
                onde a intervenção acontece.
              </p>
              <p>
                Sobre o que ele <em>não</em> faz: ele não mede a citação real do
                seu conteúdo em motores de IA. A ligação entre densidade de fonte
                e citabilidade vem da pesquisa acima, não de uma medição nossa — e
                essa distinção viaja no contrato da API, não só neste parágrafo.
                A fórmula, os pesos e as limitações são públicos.
              </p>
              {/*
                Aponta para a raiz do repositorio, que renderiza o README — ele
                carrega a referencia do paper de GEO e o metodo. A ancora
                `#metodologia` NAO existe e nunca deve ser usada aqui.
              */}
              <p className="small" style={{ marginTop: 'var(--space-6)' }}>
                <a href={REPO} target="_blank" rel="noopener noreferrer">
                  Ler o método e a pesquisa citada
                  <ExternalLink />
                </a>
              </p>
            </div>

            <div className="ledger">
              <ul>
                {NOT_MEASURED.map((item) => (
                  <li key={item}>
                    <span className="ledger-mark" aria-hidden="true">
                      ✗
                    </span>
                    <span>
                      <span className="sr-only">Não medimos: </span>
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
              <hr className="ledger-split" />
              <ul>
                {MEASURED.map((item) => (
                  <li className="ledger-yes" key={item}>
                    <span className="ledger-mark" aria-hidden="true">
                      ✓
                    </span>
                    <span>
                      <span className="sr-only">Medimos: </span>
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

      </main>

      {/* --- 7. Rodapé --- */}
      <footer className="shell foot">
        <div className="foot-top">
          <div>
            <a className="wordmark" href="#top">
              <Diamond size={13} />
              CiteScore
            </a>
            <p className="foot-tag">Análise de densidade factual</p>
          </div>
          <nav className="topnav" aria-label="Rodapé">
            <a href="#metodo">Método</a>
            <a href={REPO} target="_blank" rel="noopener noreferrer">
              Código
              <ExternalLink />
            </a>
          </nav>
        </div>
        <div className="foot-bottom">
          {/*
            Placeholder deliberado. O nome do autor não é inventado pelo código:
            quem publica preenche.
          */}
          <span>Construído por Douglas Batista · 2026</span>
          <a href="#analisar">
            Analisar um artigo
            <ArrowUp size={14} />
          </a>
        </div>
      </footer>
    </>
  );
}
