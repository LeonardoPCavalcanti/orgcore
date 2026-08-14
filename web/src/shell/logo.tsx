import type { CSSProperties } from 'react';

/**
 * Versão REDUZIDA da marca: só o "A" do "C2AI" — um "A" vazado na cor do texto
 * (currentColor: moldura Λ com duas pernas e contra-fundo aberto) e, dentro dele,
 * o triângulo ciano invertido (▽). Para favicon, avatares e espaços pequenos.
 */
export function LogoIcone({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'logo-a'} viewBox="0 0 52 44" aria-hidden="true">
      <polygon className="logo-a-corpo" points="23,0 29,0 52,43 41,43 26,15 11,43 0,43" />
      <polygon className="logo-a-ciano" points="18,31 34,31 26,44" />
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
