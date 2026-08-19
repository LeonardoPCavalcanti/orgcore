import { bigint, boolean, customType, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { usuarios } from '../../../../core/db/schema/acesso';
import { unidades } from '../../../../core/db/schema/organograma';

/**
 * `bytea` não tem tipo nativo no drizzle; o `customType` mapeia a coluna binária
 * para `Buffer` nos dois sentidos (o driver `pg` já entrega/aceita `Buffer`).
 */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

export const carrosseis = pgTable('carrosseis', {
  id: uuid('id').primaryKey(),
  unidadeId: bigint('unidade_id', { mode: 'number' }).notNull().references(() => unidades.id),
  autorId: uuid('autor_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  tema: text('tema').notNull(),
  legenda: text('legenda').notNull(),
  hashtags: text('hashtags').array().notNull().default([]),
  template: text('template').notNull(),
  // Estilo visual escolhido (editorial|minimalista|bold). Apresentação, não
  // conteúdo — o mesmo carrossel pode ser re-renderizado em outro estilo.
  estilo: text('estilo').notNull().default('editorial'),
  // Logos de parceiros (data URIs já branqueados). Guardados para re-render fiel
  // da capa quando um slide é editado depois.
  logos: text('logos').array(),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
});

export const slides = pgTable('slides', {
  id: uuid('id').primaryKey(),
  carrosselId: uuid('carrossel_id').notNull().references(() => carrosseis.id, { onDelete: 'cascade' }),
  ordem: integer('ordem').notNull(),
  tipo: text('tipo').notNull(),
  titulo: text('titulo').notNull(),
  subtitulo: text('subtitulo').notNull(),
  // Conteúdo mais rico, opcional: corpo do slide e um destaque em evidência.
  // Persistidos para permitir re-render em outro estilo depois.
  corpo: text('corpo'),
  destaque: text('destaque'),
  // Foto tratada (data URI) anexada ao slide + se veio recortada — persistidas
  // para re-render fiel após edição de texto.
  foto: text('foto'),
  fotoRecortada: boolean('foto_recortada').notNull().default(false),
  // Grade de pessoas (posts tipo "aprovados"): [{dataUri, nome}]. Exclusiva com foto.
  pessoas: jsonb('pessoas').$type<{ dataUri: string; nome: string }[]>(),
  imagem: bytea('imagem').notNull(),
  imagemTipo: text('imagem_tipo').notNull().default('image/png'),
});

export type Carrossel = typeof carrosseis.$inferSelect;
export type Slide = typeof slides.$inferSelect;
