import { ImageResponse } from 'next/og';

/**
 * A imagem que aparece quando o link é postado — `design-visual-2.md` § 11.4.
 *
 * SEM número e SEM exemplo de resultado, e isso é a mesma regra da ADR-004
 * aplicada ao card: um resultado fora de contexto afirmaria uma medição sobre
 * um artigo que o leitor não escolheu, sem a ressalva que precisa acompanhá-la.
 * O que vai é a proposta e a amostra dos três traços.
 *
 * Sem `next/font` aqui: o runtime de `ImageResponse` não usa CSS da aplicação
 * e carregar uma fonte exigiria buscar o arquivo em tempo de request. A pilha
 * de fontes do sistema resolve, porque o card é uma imagem estática.
 */

export const alt =
  'CiteScore — quanto do seu artigo se sustenta de verdade. Densidade factual, ' +
  'a alavanca de GEO que dá para medir frase a frase.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/*
 * Espelham os tokens de `globals.css`. Nao podem usar `var()`: o runtime do
 * `ImageResponse` nao carrega o CSS da aplicacao. Duplicacao consciente — se
 * a paleta mudar, esta lista muda junto.
 */
const VOID = 'hsl(214 30% 6%)';
const BRIGHT = 'hsl(200 25% 96%)';
const DIM = 'hsl(205 12% 70%)';
const FAINT = 'hsl(205 10% 59%)';
const LINE = 'hsl(200 24% 24%)';
const ACCENT = 'hsl(168 76% 64%)';

/*
 * Os tres tracos sao desenhados como SEGMENTOS, nao com `border-style`.
 *
 * O Satori — renderizador do `next/og` — aceita so' `solid` e `dashed`; nao
 * tem `dotted`, e o build reprova. Como o pontilhado e' justamente o canal
 * nao-cromatico da terceira categoria, perde-lo nao era opcao. Segmentos
 * reproduzem os tres com a mesma tecnica, o que tambem os deixa consistentes
 * entre si.
 *
 * `dash` e' [largura do segmento, intervalo], somando ~44px.
 */
const STROKES = [
  { label: 'com dado ou fonte', dash: [44, 0], repeat: 1 },
  { label: 'sem fonte', dash: [8, 4], repeat: 4 },
  { label: 'opinião', dash: [2, 4], repeat: 8 },
];

function Stroke({ dash, repeat }: { dash: number[]; repeat: number }) {
  return (
    <div style={{ display: 'flex', gap: dash[1] }}>
      {Array.from({ length: repeat }, (_, index) => (
        <div
          key={index}
          style={{ width: dash[0], height: 3, background: BRIGHT }}
        />
      ))}
    </div>
  );
}

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          // O halo, para o card nao ficar chapado enquanto a pagina tem luz.
          backgroundColor: VOID,
          backgroundImage:
            'radial-gradient(760px 560px at 14% -8%, hsl(168 80% 46% / 0.20), transparent 66%)',
          padding: '72px 80px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 16,
              height: 16,
              border: `2px solid ${ACCENT}`,
              transform: 'rotate(45deg)',
            }}
          />
          <div
            style={{
              color: BRIGHT,
              fontSize: 26,
              fontWeight: 600,
              letterSpacing: '-0.02em',
            }}
          >
            CiteScore
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              color: FAINT,
              fontSize: 20,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              marginBottom: 28,
            }}
          >
            Análise de densidade factual
          </div>
          <div
            style={{
              color: BRIGHT,
              fontSize: 82,
              lineHeight: 1.02,
              fontWeight: 600,
              letterSpacing: '-0.04em',
              maxWidth: 900,
            }}
          >
            Quanto do seu artigo se sustenta de verdade.
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            borderTop: `1px solid ${LINE}`,
            paddingTop: 32,
          }}
        >
          <div style={{ display: 'flex', gap: 56 }}>
            {STROKES.map((item) => (
              <div
                key={item.label}
                style={{ display: 'flex', alignItems: 'center', gap: 14 }}
              >
                <Stroke dash={item.dash} repeat={item.repeat} />
                <div style={{ color: DIM, fontSize: 22 }}>{item.label}</div>
              </div>
            ))}
          </div>
          <div style={{ color: FAINT, fontSize: 19, marginTop: 26 }}>
            Densidade de fonte: a alavanca de GEO que dá para medir frase a frase.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
