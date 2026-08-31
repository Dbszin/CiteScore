/**
 * Os sete ícones de `design-visual-2.md` § 11.1.
 *
 * SVG inline, traço de 1,5px, `currentColor`, sem preenchimento. Nenhuma
 * biblioteca de ícones — sete formas não justificam uma dependência, e
 * `currentColor` faz cada um herdar a cor do contexto sem token próprio.
 *
 * Zero emoji em posição estrutural.
 */

interface IconProps {
  readonly size?: number;
  readonly className?: string;
}

function svgProps(size: number) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
  };
}

export function ArrowRight({ size = 16, className }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function ArrowUp({ size = 16, className }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </svg>
  );
}

export function ExternalLink({ size = 14, className }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M14 4h6v6M20 4l-8 8M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
    </svg>
  );
}

export function Info({ size = 15, className }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  );
}

export function Alert({ size = 15, className }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M12 4 3 20h18L12 4Z" />
      <path d="M12 10v4M12 17h.01" />
    </svg>
  );
}

export function Close({ size = 15, className }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

/**
 * O losango do wordmark. SVG e não o caractere `◇` para não depender de qual
 * fonte do sistema tem o glifo.
 */
export function Diamond({ size = 12, className }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M12 3l9 9-9 9-9-9 9-9Z" />
    </svg>
  );
}
