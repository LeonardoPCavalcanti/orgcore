import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pool } from './client';

const DIR_MIGRACOES = join(import.meta.dirname, 'migrations');

/**
 * DEV: recria o schema `public` do zero e aplica TODAS as migrations em ordem. Destrói
 * os dados existentes — é para preparar o banco de desenvolvimento antes do seed, não
 * para produção. (Em teste, `tests/ajuda/banco.ts` faz o equivalente.)
 */
export async function prepararBancoDev(): Promise<void> {
  await pool.query('drop schema public cascade; create schema public;');
  for (const arquivo of readdirSync(DIR_MIGRACOES).filter((f) => f.endsWith('.sql')).sort()) {
    await pool.query(readFileSync(join(DIR_MIGRACOES, arquivo), 'utf8'));
  }
}
