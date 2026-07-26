import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import { usuarios, vinculos } from '../db/schema/acesso';
import { convites } from '../db/schema/auth';
import { ErroHttp } from '../erros';
import { gerarHash, validarForcaDaSenha } from './senha';

const VALIDADE_HORAS = 72;

/** O token só existe em claro nesta função e no e-mail. O banco guarda o hash. */
const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

export async function criarConvite(entrada: {
  email: string; nome: string; unidadeId: number; cargoId: string; convidadoPor: string;
}): Promise<{ token: string }> {
  const token = randomBytes(32).toString('base64url');
  await db.insert(convites).values({
    id: randomUUID(),
    email: entrada.email.toLowerCase(),
    nome: entrada.nome,
    unidadeId: entrada.unidadeId,
    cargoId: entrada.cargoId,
    tokenHash: hashToken(token),
    convidadoPor: entrada.convidadoPor,
    expiraEm: new Date(Date.now() + VALIDADE_HORAS * 3600_000),
  });
  return { token };
}

export async function aceitarConvite(
  token: string,
  senha: string,
): Promise<{ usuarioId: string }> {
  validarForcaDaSenha(senha);

  return db.transaction(async (tx) => {
    const [convite] = await tx.select().from(convites).where(and(
      eq(convites.tokenHash, hashToken(token)),
      isNull(convites.aceitoEm),
      gt(convites.expiraEm, new Date()),
    )).limit(1);

    if (!convite) {
      throw new ErroHttp(400, 'convite_invalido', 'Convite inválido ou expirado');
    }

    const usuarioId = randomUUID();
    await tx.insert(usuarios).values({
      id: usuarioId,
      email: convite.email,
      nome: convite.nome,
      status: 'ativo',
      senhaHash: await gerarHash(senha),
    });

    await tx.insert(vinculos).values({
      id: randomUUID(),
      usuarioId,
      unidadeId: convite.unidadeId,
      cargoId: convite.cargoId,
      principal: true,
      inicio: new Date().toISOString().slice(0, 10),
    });

    await tx.update(convites).set({ aceitoEm: new Date() }).where(eq(convites.id, convite.id));

    return { usuarioId };
  });
}
