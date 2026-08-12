import { z } from 'zod';

/**
 * Anúncio acadêmico: um card único (não carrossel) no formato retrato, inspirado nos
 * posts do dotLAB/PPGEC. Três tipos, cada um com uma headline própria em duas cores.
 */
export const tipoAnuncio = z.enum(['artigo_aprovado', 'defesa', 'aprovados']);
export type TipoAnuncio = z.infer<typeof tipoAnuncio>;

/**
 * Uma pessoa na entrada do POST. `foto` é um data URI base64 opcional — a arte sai
 * mesmo sem foto (headshot vira placeholder). O teto de tamanho por foto é validado
 * no serviço, ao decodificar o base64; aqui o contrato só garante o formato mínimo.
 */
export const pessoaEntrada = z.object({
  nome: z.string().trim().min(1).max(80),
  papel: z.string().trim().max(80).default(''),
  foto: z.string().startsWith('data:').optional(),
});
export type PessoaEntrada = z.infer<typeof pessoaEntrada>;

/**
 * Entrada do POST /conteudo/anuncios. O usuário descreve tipo + título + pessoas; a
 * IA (fake ou LLM) transforma isso na cópia final. Veículo/data/local são opcionais
 * (data/local só faz sentido em `defesa`, mas o contrato não força — a tela decide).
 */
export const novoAnuncio = z.object({
  tipo: tipoAnuncio,
  titulo: z.string().trim().min(3).max(300),
  pessoas: z.array(pessoaEntrada).max(10).default([]),
  veiculo: z.string().trim().max(120).optional(),
  dataRotulo: z.string().trim().max(60).optional(),
  localRotulo: z.string().trim().max(120).optional(),
});
export type NovoAnuncio = z.infer<typeof novoAnuncio>;

/**
 * Plano cru que o gerador devolve — contrato COMPARTILHADO gerador↔serviço. O
 * `geradorLLM` valida a resposta da API contra este schema antes de compor: JSON
 * fora do shape é recusado na fronteira, nunca vira card. A headline é sempre em
 * duas partes (prefixo branco + destaque na caixa ciano).
 */
export const planoAnuncio = z.object({
  headline: z.object({
    prefixo: z.string().min(1),
    destaque: z.string().min(1),
  }),
  titulo: z.string().min(1),
  pessoas: z.array(z.object({
    nome: z.string().min(1),
    papel: z.string(),
  })).max(10),
  veiculo: z.string().optional(),
  dataRotulo: z.string().optional(),
  localRotulo: z.string().optional(),
});
export type PlanoAnuncio = z.infer<typeof planoAnuncio>;

/**
 * Pessoa numa resposta: sem os bytes da foto. A foto recortada, quando existe, vem
 * por rota binária dedicada (`fotoUrl`), nunca embutida no JSON.
 */
export const pessoaResposta = z.object({
  id: z.string().uuid(),
  ordem: z.number().int(),
  nome: z.string(),
  papel: z.string(),
  fotoUrl: z.string().nullable(),
});
export type PessoaResposta = z.infer<typeof pessoaResposta>;

/** Resumo para a listagem: só metadados, sem pessoas nem imagem. */
export const anuncioResumo = z.object({
  id: z.string().uuid(),
  tipo: tipoAnuncio,
  titulo: z.string(),
  criadoEm: z.string(),
});
export type AnuncioResumo = z.infer<typeof anuncioResumo>;

/** Detalhe completo: o resumo + headline + veículo/data/local + a URL da arte + pessoas. */
export const anuncioResposta = anuncioResumo.extend({
  headline: z.object({ prefixo: z.string(), destaque: z.string() }),
  veiculo: z.string().nullable(),
  dataRotulo: z.string().nullable(),
  localRotulo: z.string().nullable(),
  imagemUrl: z.string(),
  pessoas: z.array(pessoaResposta),
});
export type AnuncioResposta = z.infer<typeof anuncioResposta>;
