import { z } from 'zod';

export const cargoDisponivel = z.object({
  id: z.guid(),
  nome: z.string(),
  nivel: z.number().int(),
});

export const pessoaNaUnidade = z.object({
  vinculoId: z.guid(),
  usuarioId: z.guid(),
  nome: z.string(),
  email: z.string(),
  unidadeId: z.number().int(),
  cargoId: z.guid(),
  cargoNome: z.string(),
  principal: z.boolean(),
});

export const entradaAlterarCargo = z.object({
  cargoId: z.guid(),
});

export type CargoDisponivel = z.infer<typeof cargoDisponivel>;
export type PessoaNaUnidade = z.infer<typeof pessoaNaUnidade>;
export type EntradaAlterarCargo = z.infer<typeof entradaAlterarCargo>;
