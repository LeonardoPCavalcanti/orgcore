import { date, integer, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { usuarios } from './acesso';

/** Consumo de IA por usuário/dia/provedor — alimenta o ranking "quem consome mais". */
export const usoIaUsuario = pgTable('uso_ia_usuario', {
  usuarioId: uuid('usuario_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  dia: date('dia').notNull(),
  provedorId: text('provedor_id').notNull(),
  requisicoes: integer('requisicoes').notNull().default(0),
  tokens: integer('tokens').notNull().default(0),
}, (t) => [primaryKey({ columns: [t.usuarioId, t.dia, t.provedorId] })]);

export type UsoIaUsuario = typeof usoIaUsuario.$inferSelect;
