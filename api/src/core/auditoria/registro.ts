import { and, desc, eq, gte, inArray, isNull, lte, or, type SQL } from 'drizzle-orm';
import { db } from '../db/client';
import { logAuditoria, type LinhaAuditoria } from '../db/schema/auditoria';
import { dadoSensivelNaAuditoria } from '../erros';

/**
 * Evento a registrar na trilha de auditoria.
 *
 * `antes` e `depois` viram `jsonb`. `registrarAuditoria` varre os dois,
 * recursivamente, e recusa gravar se encontrar uma chave que pareça segredo
 * (ver `TERMOS_SENSIVEIS` abaixo) — nunca conte só com quem chama para não
 * incluir senha, hash de senha, token, segredo de MFA ou documento aqui: a
 * trilha é append-only, e um vazamento gravado nela não tem como ser
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

// Termos (em minúsculo, sem separador) cuja presença no NOME de uma chave já
// é motivo para recusar o diff — não importa a forma exata (senha, senhaHash,
// nova_senha, token, tokenHash, segredo, mfaSegredo, codigoHash via "hash",
// cpf, documento). Falso positivo aqui custa uma chave renomeada por quem
// chama; falso negativo custa um segredo permanente na trilha.
const TERMOS_SENSIVEIS = ['senha', 'token', 'segredo', 'cpf', 'documento', 'hash'];

function chaveSensivel(chave: string): boolean {
  const normalizada = chave.toLowerCase();
  return TERMOS_SENSIVEIS.some((termo) => normalizada.includes(termo));
}

/** Varredura recursiva: devolve o nome da primeira chave suspeita encontrada, ou null. */
function encontrarChaveSensivel(valor: unknown): string | null {
  if (valor === null || typeof valor !== 'object') return null;
  if (Array.isArray(valor)) {
    for (const item of valor) {
      const achada = encontrarChaveSensivel(item);
      if (achada) return achada;
    }
    return null;
  }
  for (const [chave, sub] of Object.entries(valor as Record<string, unknown>)) {
    if (chaveSensivel(chave)) return chave;
    const achada = encontrarChaveSensivel(sub);
    if (achada) return achada;
  }
  return null;
}

export async function registrarAuditoria(evento: EventoAuditoria): Promise<void> {
  const chaveSuspeita = encontrarChaveSensivel(evento.antes) ?? encontrarChaveSensivel(evento.depois);
  if (chaveSuspeita) throw dadoSensivelNaAuditoria(chaveSuspeita);

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
  /**
   * true quando quem consulta tem alcance `global` (organização inteira) na
   * permissão de auditoria. Só nesse caso eventos com `unidadeId` nulo — como
   * `login.sucesso`, que não pertence a nenhuma unidade — entram no
   * resultado. Quem tem alcance `subarvore`/`proprio` continua vendo só as
   * unidades dele: sem essa distinção, um coordenador de equipe leria o
   * login de toda a empresa.
   */
  alcanceGlobal?: boolean;
  acao?: string;
  de?: Date;
  ate?: Date;
  limite?: number;
}): Promise<LinhaAuditoria[]> {
  // `inArray` com lista vazia vira `false` no drizzle: nenhuma linha bate.
  // É o comportamento certo aqui (falha fechado — sem unidade e sem alcance
  // global, sem resultado), mas é comportamento de uma dependência externa;
  // ver teste que fixa isso.
  const condicaoUnidade = filtro.alcanceGlobal
    ? or(inArray(logAuditoria.unidadeId, filtro.unidades), isNull(logAuditoria.unidadeId))
    : inArray(logAuditoria.unidadeId, filtro.unidades);
  if (!condicaoUnidade) throw new Error('condicao de unidade da consulta de auditoria nao pode ficar vazia');

  const condicoes: SQL[] = [condicaoUnidade];
  if (filtro.acao) condicoes.push(eq(logAuditoria.acao, filtro.acao));
  if (filtro.de) condicoes.push(gte(logAuditoria.ocorridoEm, filtro.de));
  if (filtro.ate) condicoes.push(lte(logAuditoria.ocorridoEm, filtro.ate));

  return db.select().from(logAuditoria)
    .where(and(...condicoes))
    .orderBy(desc(logAuditoria.ocorridoEm))
    .limit(filtro.limite ?? 200);
}
