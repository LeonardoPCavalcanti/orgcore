import type { GrupoTabela, TipoAnuncio } from '@4med/contracts';
import { sql } from 'drizzle-orm';
import { bigint, customType, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { usuarios } from '../../../../../core/db/schema/acesso';
import { unidades } from '../../../../../core/db/schema/organograma';

/**
 * O que a IA recebeu para gerar a peça, em texto puro (sem os bytes das fotos). Guardar
 * isso por linha fecha o par `entrada → saída` que o treino futuro precisa. `temFoto` e
 * `logos` (contagem) preservam o sinal de que havia imagem, sem carregar a imagem.
 */
export type EntradaSnapshot = {
  tipo: TipoAnuncio;
  titulo: string;
  pessoas: { nome: string; papel: string; temFoto: boolean }[];
  grupos: GrupoTabela[];
  destaque?: string;
  veiculo?: string;
  dataRotulo?: string;
  localRotulo?: string;
  logos: number;
};

const sqlVazio = sql`'{}'::jsonb`;

/** `bytea` → `Buffer` nos dois sentidos (o driver `pg` já entrega/aceita `Buffer`). */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

export const anuncios = pgTable('anuncios', {
  id: uuid('id').primaryKey(),
  unidadeId: bigint('unidade_id', { mode: 'number' }).notNull().references(() => unidades.id),
  autorId: uuid('autor_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  tipo: text('tipo').notNull(),
  titulo: text('titulo').notNull(),
  headlinePrefixo: text('headline_prefixo').notNull(),
  headlineDestaque: text('headline_destaque').notNull(),
  veiculo: text('veiculo'),
  dataRotulo: text('data_rotulo'),
  localRotulo: text('local_rotulo'),
  legenda: text('legenda').notNull().default(''),
  grupos: jsonb('grupos').$type<GrupoTabela[]>().notNull().default([]),
  // Proveniência: qual gerador produziu a peça ("fake" ou id do modelo do LLM).
  modelo: text('modelo').notNull().default('fake'),
  // Id do provedor que o usuário pediu (null quando não escolheu). Difere de `modelo`
  // quando houve failover.
  provedorSolicitado: text('provedor_solicitado'),
  // Snapshot TEXTUAL da entrada que gerou a peça (sem os bytes das fotos — só um
  // booleano `temFoto` por pessoa). Fecha o par `entrada → saída` do corpus de treino,
  // sem carregar rostos nem estourar a linha.
  entrada: jsonb('entrada').$type<EntradaSnapshot>().notNull().default(sqlVazio),
  imagem: bytea('imagem').notNull(),
  imagemTipo: text('imagem_tipo').notNull().default('image/png'),
  template: text('template').notNull(),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Trilha append-only de avaliações de cada anúncio — o sinal de recompensa que
 * alimenta o aprendizado por preferência. Um anúncio pode ter várias avaliações ao
 * longo do tempo; nunca se atualiza/apaga uma linha (só insere), preservando o histórico.
 */
export const anuncioAvaliacoes = pgTable('anuncio_avaliacoes', {
  id: uuid('id').primaryKey(),
  anuncioId: uuid('anuncio_id').notNull().references(() => anuncios.id, { onDelete: 'cascade' }),
  autorId: uuid('autor_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  avaliacao: text('avaliacao').notNull(),
  nota: integer('nota'),
  comentario: text('comentario'),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
});

export const anuncioPessoas = pgTable('anuncio_pessoas', {
  id: uuid('id').primaryKey(),
  anuncioId: uuid('anuncio_id').notNull().references(() => anuncios.id, { onDelete: 'cascade' }),
  ordem: integer('ordem').notNull(),
  nome: text('nome').notNull(),
  papel: text('papel').notNull().default(''),
  foto: bytea('foto'),
  fotoTipo: text('foto_tipo'),
});

export type Anuncio = typeof anuncios.$inferSelect;
export type AnuncioPessoa = typeof anuncioPessoas.$inferSelect;
export type AnuncioAvaliacao = typeof anuncioAvaliacoes.$inferSelect;
