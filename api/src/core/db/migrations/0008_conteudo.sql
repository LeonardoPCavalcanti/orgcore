-- Módulo Conteúdo (Fatia 1): carrosséis de Instagram gerados por IA.
--
-- Os bytes de cada slide ficam INLINE em `bytea`, não num filesystem/S3: mantém o
-- app portável por Docker e a hospedagem indefinida. Troca por blob store público
-- vem quando a publicação exigir URL pública (fatia 2). UUID gerado na aplicação
-- (mesmo padrão do resto do núcleo), não por default do banco.

create table carrosseis (
  id           uuid primary key,
  unidade_id   bigint not null references unidades(id),
  autor_id     uuid not null references usuarios(id) on delete cascade,
  tema         text not null,
  legenda      text not null,
  hashtags     text[] not null default '{}',
  template     text not null,
  criado_em    timestamptz not null default now()
);

-- A listagem e o escopo por autor filtram sempre por `autor_id`.
create index idx_carrosseis_autor on carrosseis (autor_id);

create table slides (
  id           uuid primary key,
  carrossel_id uuid not null references carrosseis(id) on delete cascade,
  ordem        integer not null,
  tipo         text not null check (tipo in ('capa', 'conteudo', 'cta')),
  titulo       text not null,
  subtitulo    text not null,
  imagem       bytea not null,
  imagem_tipo  text not null default 'image/png',

  unique (carrossel_id, ordem)
);
