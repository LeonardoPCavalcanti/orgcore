import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';

export type TabelaEscopada = {
  tabela: PgTable;
  colunaUnidade: PgColumn;
  colunaId: PgColumn;
  /** Coluna de dono, usada quando o alcance é `proprio`. Null quando não se aplica. */
  colunaDono: PgColumn | null;
};

const registro = new Map<string, TabelaEscopada>();

export function registrarTabelaEscopada(nome: string, def: TabelaEscopada): void {
  if (registro.has(nome)) throw new Error(`tabela "${nome}" ja registrada`);
  registro.set(nome, def);
}

export function tabelaEscopada(nome: string): TabelaEscopada {
  const def = registro.get(nome);
  if (!def) throw new Error(`tabela "${nome}" nao registrada como escopada`);
  return def;
}
