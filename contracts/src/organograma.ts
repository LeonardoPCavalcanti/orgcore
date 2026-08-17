import { z } from 'zod';

export const cargoDisponivel = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  nivel: z.number().int(),
});

export const pessoaNaUnidade = z.object({
  vinculoId: z.string().uuid(),
  usuarioId: z.string().uuid(),
  nome: z.string(),
  email: z.string(),
  unidadeId: z.number().int(),
  cargoId: z.string().uuid(),
  cargoNome: z.string(),
  principal: z.boolean(),
});

export const entradaAlterarCargo = z.object({
  cargoId: z.string().uuid(),
});

export type CargoDisponivel = z.infer<typeof cargoDisponivel>;
export type PessoaNaUnidade = z.infer<typeof pessoaNaUnidade>;
export type EntradaAlterarCargo = z.infer<typeof entradaAlterarCargo>;
