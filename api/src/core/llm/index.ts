import { provedoresAtivos } from './catalogo';
import { type ClienteLLM, criarClienteLLM } from './cliente';
import { usoDb } from './uso';

export type { ClienteLLM, Mensagem, ResultadoLLM } from './cliente';
export type { StatusProvedor } from './uso';

/** Cliente de produção: catálogo por env + medição em DB. `null` se nenhum provedor ativo. */
export function criarClientePadrao(): ClienteLLM | null {
  const provedores = provedoresAtivos();
  if (provedores.length === 0) return null;
  return criarClienteLLM({ provedores, uso: usoDb });
}
