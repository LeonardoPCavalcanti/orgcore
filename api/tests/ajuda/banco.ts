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

  const tabelas = rows.map((r) => r.tabela);
  const temAuditoria = tabelas.includes('log_auditoria');
  const lista = tabelas.map((t) => `"${t}"`).join(', ');

  // log_auditoria tem um gatilho que recusa UPDATE/DELETE/TRUNCATE (ver
  // 0006_auditoria.sql) — de propósito, é a garantia de append-only da
  // trilha. Ela também é referenciada por FK a partir de usuarios/unidades
  // (ator_id, unidade_id): truncar essas tabelas com CASCADE arrasta
  // log_auditoria junto de qualquer forma, então não adianta simplesmente
  // deixá-la de fora da lista — precisa ser um único TRUNCATE com o
  // gatilho desligado ao redor dele. A conexão de teste é dona da tabela
  // (mesmo papel que rodou a migration), e só o dono consegue desabilitar
  // o próprio gatilho — o papel `aplicacao` de produção, sem privilégio de
  // ALTER TABLE, não consegue. Por isso este é o único lugar do projeto
  // com permissão de contornar a imutabilidade, e só entre execuções de teste.
  if (temAuditoria) await pool.query('alter table log_auditoria disable trigger trg_auditoria_imutavel');
  await pool.query(`truncate ${lista} restart identity cascade`);
  if (temAuditoria) await pool.query('alter table log_auditoria enable trigger trg_auditoria_imutavel');
}
