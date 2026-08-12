import { z } from 'zod';

/**
 * Entrada do POST /conteudo/carrosseis. O usuário descreve só o tema; o número de
 * slides tem padrão 7 e teto 10 (limite de um carrossel do Instagram, útil já para
 * a fatia de publicação). A geração do roteiro em si mora no gerador (fake ou LLM).
 */
export const novoCarrossel = z.object({
  tema: z.string().trim().min(3).max(500),
  quantidadeSlides: z.number().int().min(3).max(10).default(7),
});

export type NovoCarrossel = z.infer<typeof novoCarrossel>;

export const tipoSlide = z.enum(['capa', 'conteudo', 'cta']);
export type TipoSlide = z.infer<typeof tipoSlide>;

/**
 * Plano cru que o gerador devolve. É o contrato COMPARTILHADO entre o gerador e o
 * serviço: o `geradorLLM` valida a resposta da API contra este schema antes de
 * compor, então um JSON fora do shape é recusado na fronteira, nunca vira slide.
 */
export const planoCarrossel = z.object({
  legenda: z.string().min(1),
  hashtags: z.array(z.string()).max(30),
  slides: z.array(z.object({
    tipo: tipoSlide,
    titulo: z.string().min(1),
    subtitulo: z.string(),
  })).min(3).max(10),
});

export type PlanoCarrossel = z.infer<typeof planoCarrossel>;
export type SlidePlanejado = PlanoCarrossel['slides'][number];

/**
 * Slide numa resposta: sem os bytes da imagem. A arte vem por uma rota binária
 * dedicada (`imagemUrl`), nunca embutida no JSON — `bytea` não é serializado.
 */
export const slideResposta = z.object({
  id: z.string().uuid(),
  ordem: z.number().int(),
  tipo: tipoSlide,
  titulo: z.string(),
  subtitulo: z.string(),
  imagemUrl: z.string(),
});

export type SlideResposta = z.infer<typeof slideResposta>;

/** Resumo para a listagem: só metadados, sem o array de slides nem imagens. */
export const carrosselResumo = z.object({
  id: z.string().uuid(),
  tema: z.string(),
  criadoEm: z.string(),
});

export type CarrosselResumo = z.infer<typeof carrosselResumo>;

/** Detalhe completo: o resumo + legenda/hashtags + os slides. */
export const carrosselResposta = carrosselResumo.extend({
  legenda: z.string(),
  hashtags: z.array(z.string()),
  slides: z.array(slideResposta),
});

export type CarrosselResposta = z.infer<typeof carrosselResposta>;
