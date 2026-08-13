alter table anuncios add column modelo text not null default 'fake';

create table anuncio_avaliacoes (
  id uuid primary key,
  anuncio_id uuid not null references anuncios (id) on delete cascade,
  autor_id uuid not null references usuarios (id) on delete cascade,
  avaliacao text not null,
  nota integer,
  comentario text,
  criado_em timestamptz not null default now()
);

create index anuncio_avaliacoes_anuncio_idx on anuncio_avaliacoes (anuncio_id);
