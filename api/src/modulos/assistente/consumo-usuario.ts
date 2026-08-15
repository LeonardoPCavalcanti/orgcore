import { desc, eq, sql } from 'drizzle-orm';
import { db } from '../../core/db/client';
import { usuarios } from '../../core/db/schema/acesso';
import { usoIaUsuario } from '../../core/db/schema/uso-ia-usuario';

const hoje = (): string => new Date().toISOString().slice(0, 10);

/** Soma +1 requisição e +tokens ao consumo do usuário no dia/provedor. */
export async function registrarConsumoUsuario(
  usuarioId: string, provedorId: string, tokens: number,
): Promise<void> {
  await db.insert(usoIaUsuario)
    .values({ usuarioId, dia: hoje(), provedorId, requisicoes: 1, tokens })
    .onConflictDoUpdate({
      target: [usoIaUsuario.usuarioId, usoIaUsuario.dia, usoIaUsuario.provedorId],
      set: {
        requisicoes: sql`${usoIaUsuario.requisicoes} + 1`,
        tokens: sql`${usoIaUsuario.tokens} + ${tokens}`,
      },
    });
}

export type ConsumoUsuario = {
  usuarioId: string; nome: string; email: string; requisicoes: number; tokens: number;
};

/** Ranking acumulado (todos os dias) por usuário, do que mais gasta tokens ao que menos. */
export async function rankingConsumo(limite = 20): Promise<ConsumoUsuario[]> {
  return db.select({
    usuarioId: usoIaUsuario.usuarioId,
    nome: usuarios.nome,
    email: usuarios.email,
    requisicoes: sql<number>`sum(${usoIaUsuario.requisicoes})::int`,
    tokens: sql<number>`sum(${usoIaUsuario.tokens})::int`,
  }).from(usoIaUsuario)
    .innerJoin(usuarios, eq(usuarios.id, usoIaUsuario.usuarioId))
    .groupBy(usoIaUsuario.usuarioId, usuarios.nome, usuarios.email)
    .orderBy(desc(sql`sum(${usoIaUsuario.tokens})`))
    .limit(limite);
}
