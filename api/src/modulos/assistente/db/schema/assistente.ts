import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Conversa do chat assistente — pertence a um usuário. */
export const iaConversas = pgTable('ia_conversas', {
  id: uuid('id').primaryKey().defaultRandom(),
  usuarioId: uuid('usuario_id').notNull(),
  titulo: text('titulo').notNull().default('Nova conversa'),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Mensagem de uma conversa (do usuário ou do assistant).
 * `imagens`: data URIs anexados (mostrados e lidos por visão).
 * `documentos`: nomes dos arquivos anexados (só para exibir na bolha).
 * `contexto`: texto extraído dos documentos, enviado ao modelo mas nunca exibido.
 */
export const iaMensagens = pgTable('ia_mensagens', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversaId: uuid('conversa_id').notNull(),
  papel: text('papel').notNull(), // 'user' | 'assistant'
  conteudo: text('conteudo').notNull(),
  imagens: jsonb('imagens').notNull().default([]),
  documentos: jsonb('documentos').notNull().default([]),
  contexto: text('contexto'),
  provedor: text('provedor'),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
});

export type IaConversa = typeof iaConversas.$inferSelect;
export type IaMensagem = typeof iaMensagens.$inferSelect;
