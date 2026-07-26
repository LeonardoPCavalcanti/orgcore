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
  revogada_em  timestamptz,
  -- Sessao nasce pendente quando o usuario tem MFA ativo no momento do login:
  -- so vira false apos POST /auth/mfa confirmar o segundo fator. Quem nao tem
  -- MFA ativo nunca nasce pendente (ver api/src/core/auth/rotas.ts).
  mfa_pendente boolean not null default false,
  -- Orcamento de tentativas de segundo fator DESTA sessao. Contado por sessao, e
  -- nao por IP: a sessao pendente e o alvo do ataque (quem ja tem a senha quer
  -- justamente atravessar o segundo fator DELA), e contar por IP deixaria um
  -- atacante distribuido martelar a mesma sessao indefinidamente. Incrementado
  -- atomicamente pelo proprio UPDATE ... RETURNING de `consumirTentativaMfa`
  -- (api/src/core/auth/sessoes.ts) — nunca por SELECT seguido de UPDATE.
  tentativas_mfa integer not null default 0
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
create index idx_tentativas_ip on tentativas_login (ip, criada_em desc);
