import { bigint, boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
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

export const sessoes = pgTable('sessoes', {
  id: uuid('id').primaryKey(),
  usuarioId: uuid('usuario_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  ip: text('ip').notNull(),
  agente: text('agente').notNull(),
  criadaEm: timestamp('criada_em', { withTimezone: true }).notNull().defaultNow(),
  expiraEm: timestamp('expira_em', { withTimezone: true }).notNull(),
  limiteEm: timestamp('limite_em', { withTimezone: true }).notNull(),
  ultimoUso: timestamp('ultimo_uso', { withTimezone: true }).notNull().defaultNow(),
  revogadaEm: timestamp('revogada_em', { withTimezone: true }),
  /** Ver comentario na migration 0004_sessoes.sql. */
  mfaPendente: boolean('mfa_pendente').notNull().default(false),
});

export const tentativasLogin = pgTable('tentativas_login', {
  id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
  email: text('email').notNull(),
  ip: text('ip').notNull(),
  sucesso: boolean('sucesso').notNull(),
  criadaEm: timestamp('criada_em', { withTimezone: true }).notNull().defaultNow(),
});

export const codigosRecuperacao = pgTable('codigos_recuperacao', {
  id: uuid('id').primaryKey(),
  usuarioId: uuid('usuario_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  codigoHash: text('codigo_hash').notNull(),
  usadoEm: timestamp('usado_em', { withTimezone: true }),
});

export type Sessao = typeof sessoes.$inferSelect;
