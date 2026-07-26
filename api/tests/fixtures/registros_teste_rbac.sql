-- FIXTURE DE TESTE — NAO E MIGRATION. Fica fora de api/src/core/db/migrations
-- de proposito, para que um runner de producao nunca a aplique no banco real
-- da 4med: aplicada so por prepararBanco() (api/tests/ajuda/banco.ts), depois
-- das migrations reais, exclusivamente no banco de teste.
--
-- Existe apenas para exercitar o portao de autorizacao
-- (api/src/core/rbac/repositorio.ts) em teste. Nao e uma tabela de dominio de
-- producao: nenhum modulo real deve gravar ou ler dela. Ela prova, com dado de
-- verdade no banco, que o WHERE montado por `criarRepositorio` filtra por
-- unidade e por dono como esperado, e que id+escopo se combinam certo em
-- `obter`.
create table registros_teste_rbac (
  id         uuid primary key,
  unidade_id bigint not null references unidades(id),
  dono_id    uuid references usuarios(id),
  nome       text not null default ''
);
