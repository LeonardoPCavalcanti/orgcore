-- Módulo Conteúdo — anúncio acadêmico: um card único (não carrossel) no formato
-- retrato, inspirado nos posts do dotLAB/PPGEC. A arte final renderizada vive inline
-- em `anuncios.imagem` (bytea), mesmo padrão do carrossel. As fotos recortadas das
-- pessoas ficam em `anuncio_pessoas.foto` só para eventual reedição — a leitura da
-- arte não depende delas. UUID gerado na aplicação, não por default do banco.

create table anuncios (
  id                uuid primary key,
  unidade_id        bigint not null references unidades(id),
  autor_id          uuid not null references usuarios(id) on delete cascade,
  tipo              text not null check (tipo in ('artigo_aprovado', 'defesa', 'aprovados')),
  titulo            text not null,
  headline_prefixo  text not null,
  headline_destaque text not null,
  veiculo           text,
  data_rotulo       text,
  local_rotulo      text,
  imagem            bytea not null,
  imagem_tipo       text not null default 'image/png',
  template          text not null,
  criado_em         timestamptz not null default now()
);

-- A listagem e o escopo por autor filtram sempre por `autor_id`.
create index idx_anuncios_autor on anuncios (autor_id);

create table anuncio_pessoas (
  id          uuid primary key,
  anuncio_id  uuid not null references anuncios(id) on delete cascade,
  ordem       integer not null,
  nome        text not null,
  papel       text not null default '',
  foto        bytea,
  foto_tipo   text,

  unique (anuncio_id, ordem)
);
