import type { CSSProperties } from 'react';

/**
 * Marca da Conect2AI: o volante (veículos conectados) em ciano ao lado do
 * wordmark. Em vetor para escalar sem perda e acompanhar o tema; `size` é a
 * altura em px.
 */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <span className="logo" style={{ '--logo-h': `${size}px` } as CSSProperties} role="img" aria-label="Conect2AI">
      <svg className="logo-volante" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <circle className="logo-volante-hub" cx="12" cy="12" r="2.5" />
        <path d="M12 9.5 V4 M10 13.6 L5.6 16.8 M14 13.6 L18.4 16.8" />
      </svg>
      <span className="logo-texto" aria-hidden="true">CONECT2AI</span>
    </span>
  );
}
