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
  -- Tentativas de segundo fator gastas NESTA sessao. Incrementado atomicamente
  -- pelo proprio UPDATE ... RETURNING de `consumirTentativaMfa`
  -- (api/src/core/auth/sessoes.ts), nunca por SELECT seguido de UPDATE, e zerado
  -- quando o segundo fator e confirmado.
  --
  -- O QUE ESTE CONTADOR GARANTE: um teto de RAJADA. Requisicoes concorrentes
  -- contra a mesma sessao serializam no lock desta linha, entao nenhuma rajada
  -- paralela consegue mais palpites do que MAX_TENTATIVAS_MFA nesta sessao.
  --
  -- O QUE ELE NAO GARANTE: nada sobre o total de palpites da CONTA. Estourar o
  -- orcamento revoga a sessao, mas quem tem a senha faz login de novo e ganha uma
  -- sessao nova de graca — login BEM-SUCEDIDO nao consome nenhum dos limites de
  -- tentativas_login (os dois filtram sucesso = false). O teto por conta e o de
  -- tentativas_login com tipo = 'mfa', abaixo; os dois sao complementares e
  -- nenhum substitui o outro.
  tentativas_mfa integer not null default 0
);

create index idx_sessoes_usuario on sessoes (usuario_id);

-- Registro de tentativas de autenticacao, usado pelos limites de forca bruta.
-- Duas naturezas de tentativa convivem aqui, separadas por `tipo`, cada uma com o
-- proprio orcamento e a propria janela (ver api/src/core/auth/sessoes.ts):
--
--   tipo = 'login' — tentativa de senha. Chave de conta: `email` (a conta pode nem
--     existir). Limites por IP e por conta, em janela de 15 min.
--   tipo = 'mfa'   — tentativa de segundo fator de uma conta que ja passou pela
--     senha. Chave de conta: `email` do usuario autenticado. Limite por conta, em
--     janela de 60 min.
--
-- O discriminador nao e decorativo: sem ele os dois orcamentos se contaminariam.
-- Falhas de segundo fator entrariam no limite de login e quem tivesse a senha da
-- vitima trancaria o login dela a partir de qualquer IP; e falhas de login
-- consumiriam o orcamento de segundo fator.
--
-- Em ambos os casos so linhas com sucesso = false contam. Uma tentativa de segundo
-- fator e gravada como falha ANTES de o codigo ser conferido e so e absolvida
-- (sucesso = true) se conferir: palpite errado custa exatamente o mesmo que um
-- certo, e quem acerta nao gasta orcamento.
create table tentativas_login (
  id        bigint generated always as identity primary key,
  email     text not null,
  ip        text not null,
  sucesso   boolean not null,
  tipo      text not null default 'login' check (tipo in ('login', 'mfa')),
  criada_em timestamptz not null default now()
);

create index idx_tentativas_email on tentativas_login (email, tipo, criada_em desc);
create index idx_tentativas_ip on tentativas_login (ip, criada_em desc);
