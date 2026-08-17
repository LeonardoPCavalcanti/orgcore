import { and, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import { db } from '../../core/db/client';
import { dataDeHoje } from '../../core/db/fuso';
import { vinculos } from '../../core/db/schema/acesso';
import { cargoProvedores } from '../../core/db/schema/cargo-provedores';
import { IDS_CATALOGO } from '../../core/llm/catalogo';

/**
 * Ids de provedor que o usuário PODE usar, ou `null` quando não há restrição
 * alguma (todos liberados).
 *
 * Regra: o MAIS PERMISSIVO entre os cargos vigentes — mesma lógica aditiva do
 * RBAC (permissões se somam). Se QUALQUER cargo do usuário está sem restrição,
 * o usuário fica sem restrição; caso contrário, a união dos whitelists dos
 * cargos dele. Evita que dois cargos legítimos se anulem num bloqueio surpresa.
 */
export async function provedoresPermitidosParaUsuario(usuarioId: string): Promise<string[] | null> {
  const cargosVigentes = await db.selectDistinct({ cargoId: vinculos.cargoId })
    .from(vinculos)
    .where(and(
      eq(vinculos.usuarioId, usuarioId),
      lte(vinculos.inicio, dataDeHoje()),
      or(isNull(vinculos.fim), gte(vinculos.fim, dataDeHoje())),
    ));
  const ids = cargosVigentes.map((c) => c.cargoId);
  // Sem cargo vigente não é o caminho normal (todo usuário ativo tem vínculo):
  // não restringe, para não transformar um estado de dados incomum em bloqueio.
  if (ids.length === 0) return null;

  const linhas = await db.select({
    cargoId: cargoProvedores.cargoId, provedorId: cargoProvedores.provedorId,
  }).from(cargoProvedores).where(inArray(cargoProvedores.cargoId, ids));

  const cargosComRestricao = new Set(linhas.map((l) => l.cargoId));
  // Algum cargo sem NENHUMA linha => irrestrito (todos liberados).
  if (ids.some((id) => !cargosComRestricao.has(id))) return null;

  return [...new Set(linhas.map((l) => l.provedorId))];
}

export type RestricaoDeCargo = { cargoId: string; provedores: string[] };

/** Whitelists atuais, por cargo. Só inclui cargos COM restrição (os demais = todos). */
export async function listarRestricoes(): Promise<RestricaoDeCargo[]> {
  const linhas = await db.select({
    cargoId: cargoProvedores.cargoId, provedorId: cargoProvedores.provedorId,
  }).from(cargoProvedores);

  const porCargo = new Map<string, string[]>();
  for (const l of linhas) {
    const lista = porCargo.get(l.cargoId);
    if (lista) lista.push(l.provedorId);
    else porCargo.set(l.cargoId, [l.provedorId]);
  }
  return [...porCargo].map(([cargoId, provedores]) => ({ cargoId, provedores }));
}

/**
 * Define o whitelist de um cargo. Guarda apenas subconjuntos PRÓPRIOS e não
 * vazios: uma seleção vazia OU que cobre todo o catálogo vira "sem restrição"
 * (nenhuma linha) — assim o estado "libera nenhuma" (lockout total) não é
 * representável, e "libera todas" tem uma única forma canônica. Retorna o
 * conjunto efetivamente gravado (vazio = sem restrição).
 */
export async function definirRestricao(cargoId: string, provedores: string[]): Promise<string[]> {
  const validos = [...new Set(provedores.filter((id) => IDS_CATALOGO.has(id)))];
  const restringe = validos.length > 0 && validos.length < IDS_CATALOGO.size;

  return db.transaction(async (tx) => {
    await tx.delete(cargoProvedores).where(eq(cargoProvedores.cargoId, cargoId));
    if (restringe) {
      await tx.insert(cargoProvedores).values(validos.map((provedorId) => ({ cargoId, provedorId })));
    }
    return restringe ? validos : [];
  });
}
