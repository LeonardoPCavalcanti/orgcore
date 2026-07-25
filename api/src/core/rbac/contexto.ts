import { alcanceMaisAmplo, type Alcance } from '@4med/contracts';
import { and, eq, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { cargoPapeis, papelPermissoes, vinculos } from '../db/schema/acesso';
import { unidades } from '../db/schema/organograma';
import { idsDaSubarvore } from '../organograma/servico';

export type ContextoUsuario = {
  usuarioId: string;
  /** chave da permissão -> alcance efetivo (o mais amplo entre todos os vínculos) */
  permissoes: Map<string, Alcance>;
  /** unidades visíveis considerando o alcance de subárvore */
  unidadesDeEscopo: number[];
  /** unidades dos vínculos ativos, sem expansão */
  unidadesProprias: number[];
  delegacaoId: string | null;
};

/**
 * Resolve o contexto em uma consulta. Sem cache entre requisições: verificar
 * a versão custaria a mesma ida ao banco que esta consulta evita.
 */
export async function resolverContexto(usuarioId: string): Promise<ContextoUsuario> {
  const linhas = await db
    .select({
      chave: papelPermissoes.permissaoChave,
      alcance: papelPermissoes.alcance,
      unidadeId: vinculos.unidadeId,
      caminho: unidades.caminho,
    })
    .from(vinculos)
    .innerJoin(unidades, eq(unidades.id, vinculos.unidadeId))
    .innerJoin(cargoPapeis, eq(cargoPapeis.cargoId, vinculos.cargoId))
    .innerJoin(papelPermissoes, eq(papelPermissoes.papelId, cargoPapeis.papelId))
    .where(and(
      eq(vinculos.usuarioId, usuarioId),
      lte(vinculos.inicio, sql`current_date`),
      or(isNull(vinculos.fim), sql`${vinculos.fim} >= current_date`),
    ));

  const permissoes = new Map<string, Alcance>();
  const unidadesProprias = new Set<number>();
  const caminhosParaExpandir = new Set<string>();
  let temGlobal = false;

  for (const l of linhas) {
    const anterior = permissoes.get(l.chave);
    permissoes.set(l.chave, anterior ? alcanceMaisAmplo(anterior, l.alcance) : l.alcance);
    unidadesProprias.add(l.unidadeId);
    if (l.alcance === 'subarvore') caminhosParaExpandir.add(l.caminho);
    if (l.alcance === 'global') temGlobal = true;
  }

  const escopo = new Set<number>(unidadesProprias);
  if (temGlobal) {
    for (const id of await idsDaSubarvore('/')) escopo.add(id);
  } else {
    for (const caminho of caminhosParaExpandir) {
      for (const id of await idsDaSubarvore(caminho)) escopo.add(id);
    }
  }

  return {
    usuarioId,
    permissoes,
    unidadesDeEscopo: [...escopo].sort((a, b) => a - b),
    unidadesProprias: [...unidadesProprias].sort((a, b) => a - b),
    delegacaoId: null,
  };
}
