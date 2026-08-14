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
});
export type ProvedorStatus = z.infer<typeof provedorStatus>;
