import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { authenticator } from 'otplib';
import { db } from '../db/client';
import { usuarios } from '../db/schema/acesso';
import { codigosRecuperacao } from '../db/schema/auth';
import { ErroHttp } from '../erros';
import type { ContextoUsuario } from '../rbac/contexto';

const VERBOS_SENSIVEIS = new Set(['aprovar', 'administrar']);

/**
 * A exigência é derivada das permissões efetivas, não de uma lista de cargos.
 * Cargo novo com poder herda a exigência automaticamente.
 */
export function exigeMfa(ctx: ContextoUsuario): boolean {
  for (const [chave, escopo] of ctx.permissoes) {
    if (escopo.alcance === 'global') return true;
    const verbo = chave.split('.')[2];
    if (verbo && VERBOS_SENSIVEIS.has(verbo)) return true;
  }
  return false;
}

const hashCodigo = (c: string): string =>
  createHash('sha256').update(c.replace(/\s|-/g, '').toLowerCase()).digest('hex');

export async function prepararMfa(usuarioId: string): Promise<{ segredo: string; uri: string }> {
  const [u] = await db.select().from(usuarios).where(eq(usuarios.id, usuarioId)).limit(1);
  if (!u) throw new ErroHttp(404, 'nao_encontrado', 'Usuário não encontrado');

  const segredo = authenticator.generateSecret();
  await db.update(usuarios).set({ mfaSegredo: segredo, mfaAtivo: false })
    .where(eq(usuarios.id, usuarioId));

  return { segredo, uri: authenticator.keyuri(u.email, '4med', segredo) };
}

export async function ativarMfa(
  usuarioId: string,
  codigo: string,
): Promise<{ codigosRecuperacao: string[] }> {
  const [u] = await db.select().from(usuarios).where(eq(usuarios.id, usuarioId)).limit(1);
  if (!u?.mfaSegredo || !authenticator.check(codigo, u.mfaSegredo)) {
    throw new ErroHttp(422, 'codigo_invalido', 'Código inválido');
  }

  const codigos = Array.from({ length: 8 }, () => randomBytes(5).toString('hex'));
  await db.transaction(async (tx) => {
    await tx.update(usuarios).set({ mfaAtivo: true }).where(eq(usuarios.id, usuarioId));
    await tx.delete(codigosRecuperacao).where(eq(codigosRecuperacao.usuarioId, usuarioId));
    await tx.insert(codigosRecuperacao).values(codigos.map((c) => ({
      id: randomUUID(), usuarioId, codigoHash: hashCodigo(c),
    })));
  });

  return { codigosRecuperacao: codigos };
}

/** Aceita o código do aplicativo autenticador ou um código de recuperação de uso único. */
export async function conferirMfa(usuarioId: string, codigo: string): Promise<boolean> {
  const [u] = await db.select().from(usuarios).where(eq(usuarios.id, usuarioId)).limit(1);
  if (!u?.mfaSegredo) return false;

  if (authenticator.check(codigo, u.mfaSegredo)) return true;

  const [recuperacao] = await db.select().from(codigosRecuperacao).where(and(
    eq(codigosRecuperacao.usuarioId, usuarioId),
    eq(codigosRecuperacao.codigoHash, hashCodigo(codigo)),
    isNull(codigosRecuperacao.usadoEm),
  )).limit(1);

  if (!recuperacao) return false;

  await db.update(codigosRecuperacao).set({ usadoEm: new Date() })
    .where(eq(codigosRecuperacao.id, recuperacao.id));
  return true;
}
