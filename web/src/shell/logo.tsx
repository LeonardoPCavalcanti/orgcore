import type { CSSProperties } from 'react';

/**
 * Versão REDUZIDA da marca: só o "A" triangular do "C2AI" — corpo na cor do texto
 * (currentColor) com o acento ciano e o filete em ciano profundo. Para favicon,
 * avatares e espaços pequenos.
 */
export function LogoIcone({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'logo-a'} viewBox="0 0 52 54" aria-hidden="true">
      <polygon className="logo-a-corpo" points="26,0 52,54 0,54" />
      <polygon className="logo-a-ciano" points="26,54 40,28 12,28" />
      <polygon className="logo-a-teal" points="26,54 33,40 19,40" />
    </svg>
  );
}

/**
 * Marca da Conect2AI: o wordmark "C2AI" — "C2", o "A" triangular e "I". Em vetor,
 * escala sem perda e acompanha o tema (letras na cor do texto, acento ciano da marca).
 * `size` é a altura em px.
 */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <span className="logo" style={{ '--logo-h': `${size}px` } as CSSProperties} role="img" aria-label="Conect2AI">
      <span className="logo-c2ai" aria-hidden="true">
        C2<LogoIcone />I
      </span>
    </span>
  );
}
