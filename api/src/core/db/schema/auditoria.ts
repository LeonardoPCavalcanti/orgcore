import { bigint, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { usuarios } from './acesso';
import { unidades } from './organograma';

export const logAuditoria = pgTable('log_auditoria', {
  id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
  ocorridoEm: timestamp('ocorrido_em', { withTimezone: true }).notNull().defaultNow(),
  atorId: uuid('ator_id').references(() => usuarios.id),
  acao: text('acao').notNull(),
  recursoTipo: text('recurso_tipo').notNull(),
  recursoId: text('recurso_id'),
  unidadeId: bigint('unidade_id', { mode: 'number' }).references(() => unidades.id),
  ip: text('ip').notNull(),
  agente: text('agente').notNull(),
  delegacaoId: uuid('delegacao_id'),
  antes: jsonb('antes'),
  depois: jsonb('depois'),
}, (t) => [
  index('idx_auditoria_ocorrido').on(t.ocorridoEm.desc()),
  index('idx_auditoria_unidade').on(t.unidadeId, t.ocorridoEm.desc()),
  index('idx_auditoria_ator').on(t.atorId, t.ocorridoEm.desc()),
]);

export type LinhaAuditoria = typeof logAuditoria.$inferSelect;
