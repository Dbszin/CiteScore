/**
 * PLACEHOLDER DE M1.
 *
 * A interface do relatorio e escopo de M3 e depende da especificacao visual
 * do Designer (specs/changes/001-.../specs/ui-relatorio/spec.md). Esta pagina
 * existe apenas para que o gate de M1 — "npm run dev sobe" — seja verificavel.
 */
export default function Home() {
  return (
    <main style={{ maxWidth: '42rem', margin: '4rem auto', padding: '0 1.5rem' }}>
      <h1>CiteScore</h1>
      <p>
        Motor de analise em construcao (M2). A interface do relatorio e escopo
        de M3.
      </p>
      <p>
        <strong>Densidade Factual</strong> mede a proporcao de afirmacoes
        sustentadas por dado ou fonte em um texto. O score derivado dela e uma{' '}
        <em>estimativa</em> de citabilidade em motores de AI — nao uma medicao
        de citacoes reais.
      </p>
    </main>
  );
}
