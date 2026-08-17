import { provedoresAtivos } from './catalogo';
import { type ClienteLLM, criarClienteLLM } from './cliente';
import { usoDb } from './uso';

export type { ClienteLLM, Mensagem, ResultadoLLM } from './cliente';
export type { StatusProvedor } from './uso';

/**
 * Cliente de produção: catálogo por env + medição em DB. `null` se nenhum provedor ativo.
 *
 * `idsPermitidos` limita os provedores ao whitelist do cargo (Fatia: limitar IAs
 * por cargo). `undefined` = sem restrição (todos os ativos). Uma lista que não
 * cruza com nenhum ativo devolve `null` — o chat responde 503, que é o efeito
 * pretendido: o cargo só pode usar IAs que não estão configuradas.
 */
export function criarClientePadrao(idsPermitidos?: string[]): ClienteLLM | null {
  let provedores = provedoresAtivos();
  if (idsPermitidos) {
    const permitidos = new Set(idsPermitidos);
    provedores = provedores.filter((p) => permitidos.has(p.id));
  }
  if (provedores.length === 0) return null;
  return criarClienteLLM({ provedores, uso: usoDb });
}
