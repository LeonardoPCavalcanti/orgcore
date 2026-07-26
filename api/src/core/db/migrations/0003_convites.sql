create table convites (
  id            uuid primary key,
  email         text not null,
  nome          text not null,
  unidade_id    bigint not null references unidades(id),
  cargo_id      uuid not null references cargos(id),
  token_hash    text not null unique,
  convidado_por uuid not null references usuarios(id),
  expira_em     timestamptz not null,
  aceito_em     timestamptz,
  criado_em     timestamptz not null default now()
);

create index idx_convites_email on convites (email);
