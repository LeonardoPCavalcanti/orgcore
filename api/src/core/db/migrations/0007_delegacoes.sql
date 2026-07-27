-- Permite combinar igualdade (uuid) e sobreposição de intervalo na MESMA
-- restrição de exclusão, logo abaixo. É contrib do próprio Postgres e é
-- `trusted` desde a 13, então o dono do banco da aplicação instala sem precisar
-- de superusuário. Sem ele, `exclude using gist (para_usuario_id with =, ...)`
-- não tem classe de operadores para uuid e a migration falha no boot — que é
-- onde essa falta precisa aparecer, e não em produção.
create extension if not exists btree_gist;

create table delegacoes (
  id              uuid primary key,
  de_usuario_id   uuid not null references usuarios(id) on delete cascade,
  para_usuario_id uuid not null references usuarios(id) on delete cascade,
  inicio          date not null,
  fim             date not null,
  motivo          text not null,
  criada_em       timestamptz not null default now(),
  -- Encerramento antes do prazo, espelhando `sessoes.revogada_em`: a linha fica
  -- (a delegação aconteceu, e a trilha de auditoria aponta para o id dela), mas
  -- deixa de valer no mesmo instante.
  revogada_em     timestamptz,

  constraint delegacao_periodo_valido check (fim >= inicio),
  -- Delegar para si mesmo seria um jeito silencioso de manter uma linha de
  -- delegação viva sem nenhum efeito visível, poluindo `delegacao_id` da trilha.
  constraint delegacao_sem_autodelegacao check (de_usuario_id <> para_usuario_id),

  -- DUAS delegações vigentes para a mesma pessoa não têm resposta certa: o
  -- contexto (`ContextoUsuario.delegacao_id`) e cada linha da trilha de
  -- auditoria guardam UM id, não uma lista — o modelo não sabe representar duas.
  -- Ordenar a escolha no SELECT daria determinismo sem resolver o problema: a
  -- pessoa continuaria com um escopo emprestado que ninguém consegue apontar na
  -- trilha. Então o banco recusa o segundo período sobreposto, e quem quiser
  -- trocar de delegante revoga o primeiro antes.
  -- `[]` = intervalo fechado nas duas pontas: `fim` é o último dia de vigência,
  -- não o primeiro dia de fora.
  constraint delegacao_sem_sobreposicao exclude using gist (
    para_usuario_id with =,
    daterange(inicio, fim, '[]') with &&
  ) where (revogada_em is null)
);

-- A restrição de exclusão acima já cria um índice GiST, mas a consulta quente
-- (`delegacaoAtiva`) é igualdade em para_usuario_id mais duas comparações de
-- data, servida melhor por um btree. Parcial porque delegação revogada nunca
-- entra nessa consulta.
create index idx_delegacoes_para on delegacoes (para_usuario_id, inicio, fim)
  where revogada_em is null;
