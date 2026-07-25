import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pool } from '../../src/core/db/client';

const DIR = join(import.meta.dirname, '../../src/core/db/migrations');

export async function prepararBanco(): Promise<void> {
  await pool.query('drop schema public cascade; create schema public;');
  for (const arquivo of readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()) {
    await pool.query(readFileSync(join(DIR, arquivo), 'utf8'));
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
