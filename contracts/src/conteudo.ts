import { z } from 'zod';

/**
 * Entrada do POST /conteudo/carrosseis. O usuário descreve só o tema; o número de
 * slides tem padrão 7 e teto 10 (limite de um carrossel do Instagram, útil já para
 * a fatia de publicação). A geração do roteiro em si mora no gerador (fake ou LLM).
 */
/** Estilos visuais do carrossel (todos com a marca C2AI). Ver template/catalogo.ts. */
export const estiloCarrossel = z.enum(['editorial', 'minimalista', 'bold']);
export type EstiloCarrossel = z.infer<typeof estiloCarrossel>;

/** Foto anexada a um slide (por índice), como data URI base64. Opcional. */
export const fotoDeSlide = z.object({
  indice: z.number().int().min(0),
  dataUri: z.string().startsWith('data:image/'),
  // Fundo já removido no cliente (WASM): o servidor pula o recorte e compõe a
  // figura como cutout (silhueta) em vez de hero de capa.
  recortada: z.boolean().default(false),
});
export type FotoDeSlide = z.infer<typeof fotoDeSlide>;

export const novoCarrossel = z.object({
  tema: z.string().trim().min(3).max(500),
  quantidadeSlides: z.number().int().min(3).max(10).default(7),
  // Escolha de APRESENTAÇÃO — o mesmo conteúdo renderiza em qualquer estilo.
  estilo: estiloCarrossel.default('editorial'),
  // Fotos que o usuário anexa a slides específicos (ex.: uma foto de capa). O
  // servidor as trata (realce + remoção de fundo, quando ligados) e compõe como
  // hero do slide, com um scrim e o texto por cima.
  fotos: z.array(fotoDeSlide).max(10).optional(),
  // Logos de parceiros (já padronizados em BRANCO no cliente) exibidos numa faixa
  // no rodapé da CAPA — que é escura nos três estilos.
  logos: z.array(z.string().startsWith('data:image/')).max(6).optional(),
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
    // Conteúdo mais rico (opcional, retrocompatível): `corpo` é o texto do slide;
    // `destaque` é um número/palavra em evidência (usado sobretudo pelo estilo bold).
    corpo: z.string().optional(),
    destaque: z.string().optional(),
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
  corpo: z.string().optional(),
  destaque: z.string().optional(),
  imagemUrl: z.string(),
});

export type SlideResposta = z.infer<typeof slideResposta>;

/** Edição do texto de um slide (o servidor re-renderiza a arte com o mesmo estilo). */
export const edicaoSlide = z.object({
  titulo: z.string().trim().min(1).max(120),
  subtitulo: z.string().trim().max(200),
  corpo: z.string().trim().max(400).optional(),
  destaque: z.string().trim().max(24).optional(),
});
export type EdicaoSlide = z.infer<typeof edicaoSlide>;

/** Copia que a IA devolve para UM slide (o tipo vem do slide que já existe). */
export const copiaSlide = z.object({
  titulo: z.string().min(1),
  subtitulo: z.string(),
  corpo: z.string().optional(),
  destaque: z.string().optional(),
});
export type CopiaSlide = z.infer<typeof copiaSlide>;

/** Pedido de regeneração de um slide por IA: uma instrução/ângulo opcional. */
export const regeneracaoSlide = z.object({
  instrucao: z.string().trim().max(300).optional(),
});
export type RegeneracaoSlide = z.infer<typeof regeneracaoSlide>;

/** Define (ou remove, com dataUri null) a foto de UM slide; o servidor re-renderiza. */
export const fotoNoSlide = z.object({
  dataUri: z.string().startsWith('data:image/').nullable(),
  recortada: z.boolean().default(false),
});
export type FotoNoSlide = z.infer<typeof fotoNoSlide>;

/** Troca o estilo de um carrossel inteiro (re-renderiza todos os slides). */
export const mudancaEstilo = z.object({ estilo: estiloCarrossel });
export type MudancaEstilo = z.infer<typeof mudancaEstilo>;

/** Resumo para a listagem: só metadados, sem o array de slides nem imagens. */
export const carrosselResumo = z.object({
  id: z.string().uuid(),
  tema: z.string(),
  estilo: estiloCarrossel.default('editorial'),
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
