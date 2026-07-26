create table codigos_recuperacao (
  id          uuid primary key,
  usuario_id  uuid not null references usuarios(id) on delete cascade,
  codigo_hash text not null,
  usado_em    timestamptz
);

create index idx_codigos_usuario on codigos_recuperacao (usuario_id);
