create table sessoes (
  id           uuid primary key,
  usuario_id   uuid not null references usuarios(id) on delete cascade,
  token_hash   text not null unique,
  ip           text not null,
  agente       text not null,
  criada_em    timestamptz not null default now(),
  expira_em    timestamptz not null,
  limite_em    timestamptz not null,
  ultimo_uso   timestamptz not null default now(),
  revogada_em  timestamptz
);

create index idx_sessoes_usuario on sessoes (usuario_id);

create table tentativas_login (
  id        bigint generated always as identity primary key,
  email     text not null,
  ip        text not null,
  sucesso   boolean not null,
  criada_em timestamptz not null default now()
);

create index idx_tentativas_email on tentativas_login (email, criada_em desc);
create index idx_tentativas_email_ip on tentativas_login (email, ip, criada_em desc);
