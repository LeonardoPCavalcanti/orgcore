import { z } from 'zod';

/**
 * Corpo do POST /delegacoes. Validação DELIBERADAMENTE leve: só garante que os
 * quatro campos vieram e são texto. A checagem semântica — formato de data,
 * calendário real (`2026-02-31`), fim não anterior ao início, motivo não vazio,
 * autodelegação e existência do destinatário — mora em `criarDelegacao`
 * (api/src/core/rbac/delegacoes.ts), que é a única fonte da verdade e devolve o
 * `codigo` específico de cada recusa (`delegacao_invalida`, `nao_encontrado`).
 * Duplicar essas regras aqui só criaria dois lugares para elas divergirem.
 */
export const entradaDelegacao = z.object({
  paraUsuarioId: z.string().min(1),
  inicio: z.string().min(1),
  fim: z.string().min(1),
  motivo: z.string().min(1),
});

export type EntradaDelegacao = z.infer<typeof entradaDelegacao>;
