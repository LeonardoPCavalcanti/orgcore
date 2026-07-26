import { bigint, boolean, date, integer, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { unidades } from './organograma';

export const alcancePermissao = pgEnum('alcance_permissao', ['proprio', 'subarvore', 'global']);
export const statusUsuario = pgEnum('status_usuario', ['convidado', 'ativo', 'suspenso', 'desligado']);

export const usuarios = pgTable('usuarios', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull().unique(),
  nome: text('nome').notNull(),
  status: statusUsuario('status').notNull().default('convidado'),
  senhaHash: text('senha_hash'),
  mfaSegredo: text('mfa_segredo'),
  mfaAtivo: boolean('mfa_ativo').notNull().default(false),
  /** Último passo de tempo TOTP (RFC 6238) aceito, para recusar reapresentação do mesmo código dentro da mesma janela. */
  mfaUltimoPasso: bigint('mfa_ultimo_passo', { mode: 'number' }),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
});

export const cargos = pgTable('cargos', {
  id: uuid('id').primaryKey(),
  nome: text('nome').notNull().unique(),
  nivel: integer('nivel').notNull().default(0),
});

export const papeis = pgTable('papeis', {
  id: uuid('id').primaryKey(),
  nome: text('nome').notNull().unique(),
  descricao: text('descricao').notNull().default(''),
});

export const cargoPapeis = pgTable('cargo_papeis', {
  cargoId: uuid('cargo_id').notNull().references(() => cargos.id, { onDelete: 'cascade' }),
  papelId: uuid('papel_id').notNull().references(() => papeis.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.cargoId, t.papelId] })]);

export const permissoes = pgTable('permissoes', {
  chave: text('chave').primaryKey(),
  modulo: text('modulo').notNull(),
  descricao: text('descricao').notNull().default(''),
  sensivel: boolean('sensivel').notNull().default(false),
  /**
   * Uma permissão que sai do manifesto (typo, refatoração de nome, módulo
   * temporariamente fora da lista) é desativada, nunca apagada — apagar levaria
   * junto, por cascade, as concessões em `papel_permissoes` que dependem dela.
   * Ver `sincronizarPermissoes`.
   */
  ativo: boolean('ativo').notNull().default(true),
});

export const papelPermissoes = pgTable('papel_permissoes', {
  papelId: uuid('papel_id').notNull().references(() => papeis.id, { onDelete: 'cascade' }),
  permissaoChave: text('permissao_chave').notNull().references(() => permissoes.chave, { onDelete: 'cascade' }),
  alcance: alcancePermissao('alcance').notNull(),
}, (t) => [primaryKey({ columns: [t.papelId, t.permissaoChave] })]);

export const vinculos = pgTable('vinculos', {
  id: uuid('id').primaryKey(),
  usuarioId: uuid('usuario_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  unidadeId: bigint('unidade_id', { mode: 'number' }).notNull().references(() => unidades.id),
  cargoId: uuid('cargo_id').notNull().references(() => cargos.id),
  principal: boolean('principal').notNull().default(false),
  inicio: date('inicio').notNull(),
  fim: date('fim'),
});

export type Usuario = typeof usuarios.$inferSelect;
