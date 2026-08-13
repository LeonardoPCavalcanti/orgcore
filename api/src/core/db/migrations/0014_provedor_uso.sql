create table provedor_uso (
  provedor_id text not null,
  dia date not null,
  requisicoes_usadas integer not null default 0,
  restante_conhecido integer,
  limite_conhecido integer,
  atualizado_em timestamptz not null default now(),
  primary key (provedor_id, dia)
);
