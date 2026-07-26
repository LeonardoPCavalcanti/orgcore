import { and, desc, eq, gte, inArray, lte, type SQL } from 'drizzle-orm';
import { db } from '../db/client';
import { logAuditoria, type LinhaAuditoria } from '../db/schema/auditoria';

/**
 * Evento a registrar na trilha de auditoria.
 *
 * `antes` e `depois` viram `jsonb` sem qualquer filtro — quem chama
 * `registrarAuditoria` é responsável por nunca incluir senha, hash de senha,
 * token, segredo de MFA ou documento (CPF etc.) nesses campos. A trilha é
 * append-only: uma vez gravado, um valor sensível aqui não tem como ser
 * corrigido ou removido depois.
 */
export type EventoAuditoria = {
  atorId: string | null;
  acao: string;
  recursoTipo: string;
  recursoId: string | null;
  unidadeId: number | null;
  ip: string;
  agente: string;
  delegacaoId: string | null;
  antes?: unknown;
  depois?: unknown;
};

export async function registrarAuditoria(evento: EventoAuditoria): Promise<void> {
  await db.insert(logAuditoria).values({
    atorId: evento.atorId,
    acao: evento.acao,
    recursoTipo: evento.recursoTipo,
    recursoId: evento.recursoId,
    unidadeId: evento.unidadeId,
    ip: evento.ip,
    agente: evento.agente,
    delegacaoId: evento.delegacaoId,
    antes: evento.antes ?? null,
    depois: evento.depois ?? null,
  });
}

export async function consultarAuditoria(filtro: {
  unidades: number[];
  acao?: string;
  de?: Date;
  ate?: Date;
  limite?: number;
}): Promise<LinhaAuditoria[]> {
  // `inArray` com lista vazia vira `false` no drizzle: nenhuma linha bate.
  // É o comportamento certo aqui (falha fechado — sem unidade, sem resultado),
  // mas é comportamento de uma dependência externa; ver teste que fixa isso.
  const condicoes: SQL[] = [inArray(logAuditoria.unidadeId, filtro.unidades)];
  if (filtro.acao) condicoes.push(eq(logAuditoria.acao, filtro.acao));
  if (filtro.de) condicoes.push(gte(logAuditoria.ocorridoEm, filtro.de));
  if (filtro.ate) condicoes.push(lte(logAuditoria.ocorridoEm, filtro.ate));

  return db.select().from(logAuditoria)
    .where(and(...condicoes))
    .orderBy(desc(logAuditoria.ocorridoEm))
    .limit(filtro.limite ?? 200);
}
