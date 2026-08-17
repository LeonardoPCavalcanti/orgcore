import { pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { cargos } from './acesso';

/**
 * Whitelist de provedores de IA por cargo. A ausência de linhas para um cargo
 * significa SEM restrição (todos os provedores) — o estado padrão. Quando um
 * cargo tem linhas, só os provedores listados podem ser usados por quem o ocupa.
 *
 * `provedor_id` casa com os ids do catálogo em código (core/llm/catalogo.ts),
 * não com uma tabela — por isso sem FK: os provedores vivem no código, não no
 * banco. Um id que saiu do catálogo simplesmente deixa de conceder acesso.
 */
export const cargoProvedores = pgTable('cargo_provedores', {
  cargoId: uuid('cargo_id').notNull().references(() => cargos.id, { onDelete: 'cascade' }),
  provedorId: text('provedor_id').notNull(),
}, (t) => [primaryKey({ columns: [t.cargoId, t.provedorId] })]);
