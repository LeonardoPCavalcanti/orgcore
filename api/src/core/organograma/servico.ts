import { asc, eq, like, sql } from 'drizzle-orm';
import { db } from '../db/client';
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
