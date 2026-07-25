import { bigint, boolean, index, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const tipoUnidade = pgEnum('tipo_unidade', [
  'empresa', 'diretoria', 'departamento', 'equipe',
]);

export const unidades = pgTable('unidades', {
  id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
  paiId: bigint('pai_id', { mode: 'number' }),
  nome: text('nome').notNull(),
  tipo: tipoUnidade('tipo').notNull(),
  caminho: text('caminho').notNull().default(''),
  ativo: boolean('ativo').notNull().default(true),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // text_pattern_ops espelha o índice real criado na migration (0001_organograma.sql),
  // necessário para o Postgres usar o índice em buscas "LIKE 'prefixo%'" fora do locale C.
  index('idx_unidades_caminho').on(t.caminho.op('text_pattern_ops')),
]);

export type Unidade = typeof unidades.$inferSelect;
export type TipoUnidade = Unidade['tipo'];
