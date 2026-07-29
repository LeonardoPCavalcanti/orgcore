import type { CSSProperties } from 'react';

/**
 * Marca da 4med recriada em vetor: o "4" verde, "med" no canto inferior e a seta
 * de crescimento cruzando o número (a identidade da agência de performance). Em
 * vetor para escalar sem perda e acompanhar o tema; `size` é a altura em px.
 */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <span className="logo" style={{ '--logo-h': `${size}px` } as CSSProperties} role="img" aria-label="4med">
      <span className="logo-4" aria-hidden="true">4</span>
      <svg className="logo-seta" viewBox="0 0 44 26" fill="none" aria-hidden="true">
        <path d="M4 20 L17 10.5 L24 15 L38.5 5" />
        <path d="M30 5 L39 5 L39 14" />
      </svg>
      <span className="logo-med" aria-hidden="true">med</span>
    </span>
  );
}
