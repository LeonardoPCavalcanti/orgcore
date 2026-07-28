import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { cargos, usuarios, vinculos } from '../db/schema/acesso';
import { unidades } from '../db/schema/organograma';
import { naoEncontrado } from '../erros';

/**
 * Direito de acesso do titular (LGPD art. 18). Seleciona coluna a coluna:
 * hash de senha e segredo de MFA nunca saem do servidor.
 */
export async function montarMeusDados(usuarioId: string) {
  const [usuario] = await db
    .select({
      id: usuarios.id,
      nome: usuarios.nome,
      email: usuarios.email,
      status: usuarios.status,
      mfaAtivo: usuarios.mfaAtivo,
      criadoEm: usuarios.criadoEm,
    })
    .from(usuarios)
    .where(eq(usuarios.id, usuarioId))
    .limit(1);

  if (!usuario) throw naoEncontrado();

  const lista = await db
    .select({
      unidade: unidades.nome,
      cargo: cargos.nome,
      inicio: vinculos.inicio,
      fim: vinculos.fim,
      principal: vinculos.principal,
    })
    .from(vinculos)
    .innerJoin(unidades, eq(unidades.id, vinculos.unidadeId))
    .innerJoin(cargos, eq(cargos.id, vinculos.cargoId))
    .where(eq(vinculos.usuarioId, usuarioId));

  return { usuario, vinculos: lista, geradoEm: new Date().toISOString() };
}
