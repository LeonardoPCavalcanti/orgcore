/**
 * O deploy pode viver sob um subcaminho (GitHub Pages de projeto serve em
 * `/orgcore/`). O Vite expõe esse prefixo em `import.meta.env.BASE_URL`
 * (sempre terminando com `/`; em dev é `/`). Como o app navega por âncoras de
 * verdade e casa o `pathname` exato, os links precisam levar o prefixo e o
 * roteador precisa removê-lo antes de casar. Com base `/`, ambos são identidade —
 * nada muda em dev nem nos testes.
 */
const BASE = import.meta.env.BASE_URL;
const RAIZ = BASE.replace(/\/$/, ''); // '/orgcore' ou ''

/** Prefixa um caminho absoluto do app com a base do deploy. `/organograma` → `/orgcore/organograma`. */
export function comBase(caminho: string): string {
  if (!caminho.startsWith('/')) return caminho;
  return RAIZ + caminho;
}

/** Caminho do app a partir do pathname atual, sem a base do deploy. `/orgcore/x` → `/x`. */
export function semBase(pathname: string = window.location.pathname): string {
  const p = RAIZ && pathname.startsWith(RAIZ) ? pathname.slice(RAIZ.length) : pathname;
  return p === '' ? '/' : p;
}
