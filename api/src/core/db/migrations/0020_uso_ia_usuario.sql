-- Consumo de IA por usuário/dia/provedor, para o ranking "quem consome mais".
create table uso_ia_usuario (
  usuario_id uuid not null references usuarios(id) on delete cascade,
  dia date not null,
  provedor_id text not null,
  requisicoes integer not null default 0,
  tokens integer not null default 0,
  primary key (usuario_id, dia, provedor_id)
);
create index idx_uso_ia_usuario_dia on uso_ia_usuario (dia);
