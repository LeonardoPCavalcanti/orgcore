import { bigint, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { usuarios } from '../../src/core/db/schema/acesso';
import { unidades } from '../../src/core/db/schema/organograma';

/**
 * Espelha `registros_teste_rbac` (migration 0003_fixture_rbac.sql). Existe só
 * para os testes do portão de autorização terem uma tabela real para
 * registrar via `registrarTabelaEscopada` e exercitar `listar`/`obter` com
 * dado de verdade no banco — não é schema de domínio; nenhum módulo de
 * produção deve importar isto.
 */
export const registrosTesteRbac = pgTable('registros_teste_rbac', {
  id: uuid('id').primaryKey(),
  unidadeId: bigint('unidade_id', { mode: 'number' }).notNull().references(() => unidades.id),
  donoId: uuid('dono_id').references(() => usuarios.id),
  nome: text('nome').notNull().default(''),
});
