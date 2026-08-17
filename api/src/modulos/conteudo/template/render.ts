import type { ContextoSlide, SlideRico } from './base';
import { rasterizar } from './base';
import { ESTILO_PADRAO, templateDe } from './catalogo';

/**
 * Compõe um slide no estilo escolhido e rasteriza para PNG 1080×1080 (puro-Node,
 * sem navegador). O LAYOUT vem do template do catálogo; virar PNG é comum a todos
 * (ver base.ts). `estilo` desconhecido cai no padrão; `ctx` (posição no carrossel)
 * é opcional para chamadas de um slide só.
 */
export async function renderSlide(
  slide: SlideRico,
  estilo: string = ESTILO_PADRAO,
  ctx: ContextoSlide = { indice: 0, total: 1 },
): Promise<Buffer> {
  const arvore = templateDe(estilo).montarSlide(slide, ctx);
  return rasterizar(arvore);
}
