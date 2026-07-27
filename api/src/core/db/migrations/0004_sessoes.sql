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
  -- O QUE ESTE CONTADOR GARANTE, e so vale porque POST /auth/mfa compara o valor
  -- devolvido ANTES de conferir o codigo: um teto de RAJADA. Requisicoes
  -- concorrentes contra a mesma sessao serializam no lock desta linha e recebem
  -- valores distintos (1, 2, 3, ...), entao so as MAX_TENTATIVAS_MFA primeiras
  -- chegam a conferir um palpite. Medido: 120 requisicoes simultaneas na mesma
  -- sessao = 5 palpites conferidos, com MAX_TENTATIVAS_MFA = 5. Se a comparacao
  -- voltar para depois da conferencia, este contador deixa de ser teto e vira
  -- apenas uma revogacao a posteriori (medido nessa forma: 12 palpites).
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

-- Uma conta tem no maximo UMA sessao pendente viva. A afirmacao esta aqui, no
-- banco, e nao so no comentario de `criarSessao`, porque revogar-as-anteriores e
-- inserir-a-nova sao duas sentencas e duas sentencas nao se serializam sozinhas:
-- medido sem este indice, 12 logins simultaneos da mesma conta deixavam 2 sessoes
-- pendentes vivas, cada uma com o proprio orcamento de tentativas_mfa. E dessa
-- invariante que depende a folga declarada do orcamento por conta (ver
-- consumirTentativaSegundoFator, em api/src/core/auth/sessoes.ts).
--
-- `criarSessao` toma um lock na linha de `usuarios` antes de revogar e inserir,
-- de modo que dois logins legitimos simultaneos (dois aparelhos) se serializem e
-- nenhum deles chegue a violar este indice — se chegasse, o usuario veria 500 num
-- login correto. O indice e a garantia; o lock e o que a torna indolor.
create unique index idx_sessoes_pendente_unica
  on sessoes (usuario_id)
  where mfa_pendente and revogada_em is null;

-- Registro de tentativas de autenticacao, usado pelos limites de forca bruta.
-- Duas naturezas de tentativa convivem aqui, separadas por `tipo`, cada uma com o
-- proprio orcamento e a propria janela (ver api/src/core/auth/sessoes.ts):
--
--   tipo = 'login' — tentativa de senha. Chave de conta: `email`, e tem de ser o
--     e-mail mesmo: a conta pode nem existir, entao nao ha id para usar.
--   tipo = 'mfa'   — tentativa de segundo fator de uma conta que ja passou pela
--     senha. Chave de conta: `usuario_id` (sempre existe, porque a requisicao ja
--     esta autenticada). Limite por conta, em janela de 60 min.
--
-- A chave do 'mfa' e o id, e nao o e-mail, porque e-mail e um atributo mutavel: o
-- dia em que existir uma troca de e-mail, chavear por ele zeraria a janela
-- corrente no instante da troca — orcamento de segundo fator de graca para quem
-- ja tem a senha, sem nada no codigo sinalizando a dependencia. `email` continua
-- gravado nas linhas de 'mfa' para leitura da trilha, mas nao decide limite.
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
  -- Nulo para tipo = 'login' (a conta pode nao existir), preenchido para
  -- tipo = 'mfa'. E a chave do orcamento de segundo fator — ver acima.
  usuario_id uuid references usuarios(id) on delete cascade,
  ip        text not null,
  sucesso   boolean not null,
  tipo      text not null default 'login' check (tipo in ('login', 'mfa')),
  criada_em timestamptz not null default now()
);

create index idx_tentativas_email on tentativas_login (email, tipo, criada_em desc);
create index idx_tentativas_usuario on tentativas_login (usuario_id, tipo, criada_em desc);
create index idx_tentativas_ip on tentativas_login (ip, criada_em desc);
