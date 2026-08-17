import { and, asc, eq, gte, inArray, isNull, like, lte, or, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { cargos, usuarios, vinculos } from '../db/schema/acesso';
import { dataDeHoje } from '../db/fuso';
import { unidades, type TipoUnidade, type Unidade } from '../db/schema/organograma';

export async function criarUnidade(entrada: {
  nome: string; tipo: TipoUnidade; paiId: number | null;
}): Promise<Unidade> {
  const [criada] = await db.insert(unidades).values(entrada).returning();
  if (!criada) throw new Error('falha ao criar unidade');
  return criada;
}

export async function moverUnidade(id: number, novoPaiId: number | null): Promise<Unidade> {
  const [movida] = await db.update(unidades)
    .set({ paiId: novoPaiId })
    .where(eq(unidades.id, id))
    .returning();
  if (!movida) throw new Error('unidade nao encontrada');
  return movida;
}

/** Ids da unidade indicada e de toda a sua descendência. */
export async function idsDaSubarvore(caminho: string): Promise<number[]> {
  const linhas = await db.select({ id: unidades.id })
    .from(unidades)
    .where(like(unidades.caminho, `${caminho}%`))
    .orderBy(asc(unidades.id));
  return linhas.map((l) => l.id);
}

export async function unidadePorId(id: number): Promise<Unidade | null> {
  const [u] = await db.select().from(unidades).where(eq(unidades.id, id)).limit(1);
  return u ?? null;
}

export type CargoDisponivel = { id: string; nome: string; nivel: number };

/** Cargos que podem ser atribuídos a uma pessoa, do mais baixo ao mais alto. */
export async function listarCargos(): Promise<CargoDisponivel[]> {
  return db.select({ id: cargos.id, nome: cargos.nome, nivel: cargos.nivel })
    .from(cargos)
    .orderBy(asc(cargos.nivel), asc(cargos.nome));
}

export type PessoaNaUnidade = {
  vinculoId: string;
  usuarioId: string;
  nome: string;
  email: string;
  unidadeId: number;
  cargoId: string;
  cargoNome: string;
  principal: boolean;
};

/**
 * Pessoas com vínculo VIGENTE (mesma janela `inicio`/`fim` que o RBAC usa em
 * `resolverProprio`) nas unidades indicadas. Só vínculos ativos: um cargo
 * expirado já não concede nada, então também não aparece para ser trocado.
 */
export async function pessoasNasUnidades(unidadeIds: number[]): Promise<PessoaNaUnidade[]> {
  if (unidadeIds.length === 0) return [];
  return db.select({
    vinculoId: vinculos.id,
    usuarioId: vinculos.usuarioId,
    nome: usuarios.nome,
    email: usuarios.email,
    unidadeId: vinculos.unidadeId,
    cargoId: vinculos.cargoId,
    cargoNome: cargos.nome,
    principal: vinculos.principal,
  })
    .from(vinculos)
    .innerJoin(usuarios, eq(usuarios.id, vinculos.usuarioId))
    .innerJoin(cargos, eq(cargos.id, vinculos.cargoId))
    .where(and(
      inArray(vinculos.unidadeId, unidadeIds),
      lte(vinculos.inicio, dataDeHoje()),
      or(isNull(vinculos.fim), gte(vinculos.fim, dataDeHoje())),
    ))
    .orderBy(asc(usuarios.nome));
}

export type VinculoAlvo = { id: string; usuarioId: string; unidadeId: number; cargoId: string };

/** Só os campos que a rota precisa para a checagem de escopo, antes de alterar. */
export async function vinculoPorId(id: string): Promise<VinculoAlvo | null> {
  const [v] = await db.select({
    id: vinculos.id, usuarioId: vinculos.usuarioId,
    unidadeId: vinculos.unidadeId, cargoId: vinculos.cargoId,
  }).from(vinculos).where(eq(vinculos.id, id)).limit(1);
  return v ?? null;
}

export async function cargoExiste(cargoId: string): Promise<boolean> {
  const [c] = await db.select({ id: cargos.id }).from(cargos).where(eq(cargos.id, cargoId)).limit(1);
  return c != null;
}

/** Troca o cargo de um vínculo. Retorna a linha atualizada, ou null se sumiu. */
export async function definirCargoDoVinculo(vinculoId: string, cargoId: string): Promise<VinculoAlvo | null> {
  const [v] = await db.update(vinculos)
    .set({ cargoId })
    .where(eq(vinculos.id, vinculoId))
    .returning({
      id: vinculos.id, usuarioId: vinculos.usuarioId,
      unidadeId: vinculos.unidadeId, cargoId: vinculos.cargoId,
    });
  return v ?? null;
}
