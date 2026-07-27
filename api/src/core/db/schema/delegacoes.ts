import { date, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { usuarios } from './acesso';

/**
 * Empréstimo temporário do escopo de uma pessoa para outra. As restrições que
 * seguram as garantias (período válido, nada de autodelegação, nada de duas
 * vigências sobrepostas para a mesma pessoa) estão na migration
 * 0007_delegacoes.sql — o drizzle não as declara, e é lá que elas valem.
 */
export const delegacoes = pgTable('delegacoes', {
  id: uuid('id').primaryKey(),
  deUsuarioId: uuid('de_usuario_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  paraUsuarioId: uuid('para_usuario_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  inicio: date('inicio').notNull(),
  fim: date('fim').notNull(),
  motivo: text('motivo').notNull(),
  criadaEm: timestamp('criada_em', { withTimezone: true }).notNull().defaultNow(),
  /** Ver comentário na migration 0007_delegacoes.sql. */
  revogadaEm: timestamp('revogada_em', { withTimezone: true }),
});

export type Delegacao = typeof delegacoes.$inferSelect;
