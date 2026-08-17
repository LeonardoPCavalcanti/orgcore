import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import type { SlidePlanejado } from '../gerador/tipos';
import { cores, FONTE_CORPO, FONTE_TITULO, HANDLE, LADO, trianguloA } from './tema-c2ai';

/**
 * Base compartilhada dos estilos de carrossel. Aqui vivem: os tipos da abstração
 * (`Template`, `SlideRico`, `ContextoSlide`), os construtores de elemento do
 * satori (`el`/`img`), a marca C2AI e o rodapé (para consistência entre estilos)
 * e a rasterização satori→resvg (comum a todos). Cada estilo (em `estilos/`) só
 * decide o LAYOUT; virar PNG é este código, uma vez.
 *
 * `Template.montarSlide` devolve uma árvore satori. Se um dia entrar um
 * renderizador HTML, cria-se uma segunda família de `Template` com outro método
 * de montagem — o modelo de conteúdo (`SlideRico`) e o catálogo não mudam.
 */
export type SlideRico = SlidePlanejado;

/** Posição do slide no carrossel, para número de página e afins. */
export type ContextoSlide = { indice: number; total: number };

export type Estilo = Record<string, unknown>;
export type Elemento = { type: string; props: { style: Estilo; children?: unknown } };

export interface Template {
  id: string;
  nome: string;
  montarSlide(slide: SlideRico, ctx: ContextoSlide): Elemento;
}

export function el(type: string, style: Estilo, children?: unknown): Elemento {
  return { type, props: children === undefined ? { style } : { style, children } };
}
export function img(src: string, style: Estilo): Elemento {
  return { type: 'img', props: { style, src } as unknown as { style: Estilo } };
}

/** Número de página "01/07", zero-preenchido. */
export function numeroPagina(ctx: ContextoSlide): string {
  const dois = (n: number) => String(n).padStart(2, '0');
  return `${dois(ctx.indice + 1)}/${dois(ctx.total)}`;
}

/** Wordmark "C2AI": C2 + o "A" triangular + I, na cor dada. */
export function marca(corTexto: string, tamanho = 54): Elemento {
  const letra: Estilo = {
    fontFamily: FONTE_TITULO, fontWeight: 700, fontSize: tamanho, letterSpacing: -3, color: corTexto, display: 'flex',
  };
  const escala = tamanho / 54;
  return el('div', { display: 'flex', alignItems: 'center' }, [
    el('div', letra, 'C2'),
    img(trianguloA(corTexto), { width: 45 * escala, height: 38 * escala, marginLeft: 4, marginTop: 7 * escala }),
    el('div', letra, 'I'),
  ]);
}

/** Rodapé: handle à esquerda, um texto (etiqueta ou número de página) à direita. */
export function rodape(corTexto: string, direita: string): Elemento {
  return el('div', {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    fontFamily: FONTE_CORPO, fontSize: 26, color: corTexto,
  }, [
    el('div', { display: 'flex' }, HANDLE),
    el('div', { display: 'flex', letterSpacing: 3 }, direita.toUpperCase()),
  ]);
}

// Fontes lidas UMA vez na carga do módulo — satori precisa dos bytes crus.
const dirFontes = join(import.meta.dirname, 'fontes');
const fontes = [
  { name: FONTE_CORPO, data: readFileSync(join(dirFontes, 'Inter-400.ttf')), weight: 400 as const, style: 'normal' as const },
  { name: FONTE_CORPO, data: readFileSync(join(dirFontes, 'Inter-600.ttf')), weight: 600 as const, style: 'normal' as const },
  { name: FONTE_TITULO, data: readFileSync(join(dirFontes, 'SpaceGrotesk-700.ttf')), weight: 700 as const, style: 'normal' as const },
];

/** Rasteriza uma árvore de slide: satori (→ SVG) e resvg (→ PNG 1080×1080). */
export async function rasterizar(arvore: Elemento): Promise<Buffer> {
  const svg = await satori(arvore as never, { width: LADO, height: LADO, fonts: fontes });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: LADO } }).render().asPng();
  return Buffer.from(png);
}

export { cores, FONTE_CORPO, FONTE_TITULO, LADO };
