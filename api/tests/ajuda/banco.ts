import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pool } from '../../src/core/db/client';

const DIR_MIGRACOES = join(import.meta.dirname, '../../src/core/db/migrations');
// SQL que só existe para dar suporte a teste (tabelas que nenhum módulo de
// produção usa, criadas só para exercitar código em teste) — nunca migration.
// Fica num diretório separado, fora de DIR_MIGRACOES, para que um runner de
// produção nunca tenha como aplicar isso no banco real; carregado aqui, por
// último, só no banco de teste.
const DIR_FIXTURES_TESTE = join(import.meta.dirname, '../fixtures');

export async function prepararBanco(): Promise<void> {
  await pool.query('drop schema public cascade; create schema public;');
  for (const arquivo of readdirSync(DIR_MIGRACOES).filter((f) => f.endsWith('.sql')).sort()) {
    await pool.query(readFileSync(join(DIR_MIGRACOES, arquivo), 'utf8'));
  }
  if (existsSync(DIR_FIXTURES_TESTE)) {
    for (const arquivo of readdirSync(DIR_FIXTURES_TESTE).filter((f) => f.endsWith('.sql')).sort()) {
      await pool.query(readFileSync(join(DIR_FIXTURES_TESTE, arquivo), 'utf8'));
    }
  }
}

export async function limparBanco(): Promise<void> {
  const { rows } = await pool.query<{ tabela: string }>(
    `select tablename as tabela from pg_tables where schemaname = 'public'`,
  );
  if (rows.length === 0) return;
  const lista = rows.map((r) => `"${r.tabela}"`).join(', ');
  await pool.query(`truncate ${lista} restart identity cascade`);
}
