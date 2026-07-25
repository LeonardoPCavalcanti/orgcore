import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';

export type TabelaEscopada = {
  tabela: PgTable;
  colunaUnidade: PgColumn;
  colunaId: PgColumn;
  /** Coluna de dono, usada quando o alcance é `proprio`. Null quando não se aplica. */
  colunaDono: PgColumn | null;
};

const registro = new Map<string, TabelaEscopada>();

// As duas checagens abaixo lançam `Error` puro, não `ErroHttp` — de propósito.
// Nome duplicado ou tabela nunca registrada são erro de programação (módulo
// que esqueceu de se registrar no boot, nome digitado errado numa chamada),
// nunca algo que o cliente da API causou ou pode corrigir. Isso deve virar 500
// quando borbulhar até o topo. Não troque por um `ErroHttp`/4xx depois.

export function registrarTabelaEscopada(nome: string, def: TabelaEscopada): void {
  if (registro.has(nome)) throw new Error(`tabela "${nome}" ja registrada`);
  registro.set(nome, def);
}

export function tabelaEscopada(nome: string): TabelaEscopada {
  const def = registro.get(nome);
  if (!def) throw new Error(`tabela "${nome}" nao registrada como escopada`);
  return def;
}
