import { z } from 'zod';

/** Status de um provedor de IA para o seletor: cota estimada + disponibilidade. */
export const provedorStatus = z.object({
  id: z.string(),
  nome: z.string(),
  modelo: z.string(),
  percentual: z.number(),
  disponivel: z.boolean(),
  atualizadoEm: z.string().nullable(),
  // Aceita imagens (visão). O chat usa para sugerir o melhor modelo por tarefa.
  visao: z.boolean().default(false),
  // Consumo real do dia — requisições feitas e tokens gastos.
  requisicoes: z.number().default(0),
  tokens: z.number().default(0),
});
export type ProvedorStatus = z.infer<typeof provedorStatus>;

/** Uma linha do ranking "quem consome mais IA". */
export const consumoUsuario = z.object({
  usuarioId: z.string().uuid(),
  nome: z.string(),
  email: z.string(),
  requisicoes: z.number(),
  tokens: z.number(),
});
export type ConsumoUsuario = z.infer<typeof consumoUsuario>;

/** Um provedor do catálogo (id + nome), para o admin escolher no whitelist por cargo. */
export const provedorCatalogo = z.object({
  id: z.string(),
  nome: z.string(),
});
export type ProvedorCatalogo = z.infer<typeof provedorCatalogo>;

/** Estado das restrições de IA: catálogo + whitelist por cargo (só cargos restritos). */
export const restricoesIa = z.object({
  provedores: z.array(provedorCatalogo),
  porCargo: z.array(z.object({
    cargoId: z.string().uuid(),
    provedores: z.array(z.string()),
  })),
});
export type RestricoesIa = z.infer<typeof restricoesIa>;

/** Define o whitelist de um cargo. Vazio ou catálogo inteiro = sem restrição. */
export const entradaRestricaoCargo = z.object({
  provedores: z.array(z.string()),
});
export type EntradaRestricaoCargo = z.infer<typeof entradaRestricaoCargo>;
