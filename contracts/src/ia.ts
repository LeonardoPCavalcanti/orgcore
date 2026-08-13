import { z } from 'zod';

/** Status de um provedor de IA para o seletor: cota estimada + disponibilidade. */
export const provedorStatus = z.object({
  id: z.string(),
  nome: z.string(),
  modelo: z.string(),
  percentual: z.number(),
  disponivel: z.boolean(),
  atualizadoEm: z.string().nullable(),
});
export type ProvedorStatus = z.infer<typeof provedorStatus>;
