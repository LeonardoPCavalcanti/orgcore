import { bigint, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { cargos, usuarios } from './acesso';
import { unidades } from './organograma';

export const convites = pgTable('convites', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull(),
  nome: text('nome').notNull(),
  unidadeId: bigint('unidade_id', { mode: 'number' }).notNull().references(() => unidades.id),
  cargoId: uuid('cargo_id').notNull().references(() => cargos.id),
  tokenHash: text('token_hash').notNull().unique(),
  convidadoPor: uuid('convidado_por').notNull().references(() => usuarios.id),
  expiraEm: timestamp('expira_em', { withTimezone: true }).notNull(),
  aceitoEm: timestamp('aceito_em', { withTimezone: true }),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
});
