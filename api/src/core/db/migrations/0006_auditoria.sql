create table log_auditoria (
  id            bigint generated always as identity primary key,
  ocorrido_em   timestamptz not null default now(),
  ator_id       uuid references usuarios(id),
  acao          text not null,
  recurso_tipo  text not null,
  recurso_id    text,
  unidade_id    bigint references unidades(id),
  ip            text not null,
  agente        text not null,
  delegacao_id  uuid,
  antes         jsonb,
  depois        jsonb
);

create index idx_auditoria_ocorrido on log_auditoria (ocorrido_em desc);
create index idx_auditoria_unidade on log_auditoria (unidade_id, ocorrido_em desc);
create index idx_auditoria_ator on log_auditoria (ator_id, ocorrido_em desc);

-- A trilha é append-only. O gatilho é a garantia portátil: vale em qualquer
-- hospedagem, inclusive nas gerenciadas em que não se controlam papéis do banco.
create function recusar_alteracao_auditoria() returns trigger as $$
begin
  raise exception 'log_auditoria e append-only: alteracao e exclusao sao proibidas';
end;
$$ language plpgsql;

create trigger trg_auditoria_imutavel
  before update or delete on log_auditoria
  for each statement execute function recusar_alteracao_auditoria();

-- Endurecimento adicional para produção: a aplicação conecta com um papel
-- que não é dono da tabela e recebe apenas os privilégios abaixo.
-- Executar manualmente ao provisionar o ambiente:
--   create role aplicacao login password '...';
--   grant usage on schema public to aplicacao;
--   grant select, insert, update, delete on all tables in schema public to aplicacao;
--   grant usage, select on all sequences in schema public to aplicacao;
--   revoke update, delete on log_auditoria from aplicacao;
