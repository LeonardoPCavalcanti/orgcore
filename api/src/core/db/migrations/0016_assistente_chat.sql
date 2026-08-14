create table ia_conversas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null,
  titulo text not null default 'Nova conversa',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index ia_conversas_usuario_idx on ia_conversas (usuario_id, atualizado_em desc);

create table ia_mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references ia_conversas(id) on delete cascade,
  papel text not null,
  conteudo text not null,
  imagens jsonb not null default '[]'::jsonb,
  provedor text,
  criado_em timestamptz not null default now()
);
create index ia_mensagens_conversa_idx on ia_mensagens (conversa_id, criado_em);
