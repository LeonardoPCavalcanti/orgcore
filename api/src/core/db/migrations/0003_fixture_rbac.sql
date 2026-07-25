-- Tabela que existe apenas para exercitar o portao de autorizacao
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
