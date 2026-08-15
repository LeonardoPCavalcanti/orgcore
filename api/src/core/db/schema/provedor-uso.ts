import { date, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/** Uso diário por provedor — cache da cota (headers) + contagem local. Estado global. */
export const provedorUso = pgTable('provedor_uso', {
  provedorId: text('provedor_id').notNull(),
  dia: date('dia').notNull(),
  requisicoesUsadas: integer('requisicoes_usadas').notNull().default(0),
  tokensUsados: integer('tokens_usados').notNull().default(0),
  restanteConhecido: integer('restante_conhecido'),
  limiteConhecido: integer('limite_conhecido'),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
});

export type ProvedorUso = typeof provedorUso.$inferSelect;
