create type alcance_permissao as enum ('proprio', 'subarvore', 'global');
create type status_usuario as enum ('convidado', 'ativo', 'suspenso', 'desligado');

create table usuarios (
  id            uuid primary key,
  email         text not null unique,
  nome          text not null,
  status        status_usuario not null default 'convidado',
  senha_hash    text,
  mfa_segredo   text,
  mfa_ativo     boolean not null default false,
  criado_em     timestamptz not null default now()
);

create table cargos (
  id      uuid primary key,
  nome    text not null unique,
  nivel   integer not null default 0
);

create table papeis (
  id        uuid primary key,
  nome      text not null unique,
  descricao text not null default ''
);

create table cargo_papeis (
  cargo_id uuid not null references cargos(id) on delete cascade,
  papel_id uuid not null references papeis(id) on delete cascade,
  primary key (cargo_id, papel_id)
);

-- Catálogo sincronizado a partir dos manifestos dos módulos no boot.
create table permissoes (
  chave     text primary key,
  modulo    text not null,
  descricao text not null default '',
  sensivel  boolean not null default false
);

create table papel_permissoes (
  papel_id        uuid not null references papeis(id) on delete cascade,
  permissao_chave text not null references permissoes(chave) on delete cascade,
  alcance         alcance_permissao not null,
  primary key (papel_id, permissao_chave)
);

create table vinculos (
  id         uuid primary key,
  usuario_id uuid not null references usuarios(id) on delete cascade,
  unidade_id bigint not null references unidades(id),
  cargo_id   uuid not null references cargos(id),
  principal  boolean not null default false,
  inicio     date not null default current_date,
  fim        date
);

create index idx_vinculos_usuario on vinculos (usuario_id);
create index idx_vinculos_unidade on vinculos (unidade_id);
