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
  constraint delegacao_sem_autodelegacao check (de_usuario_id <> para_usuario_id)
);

-- SOBREPOSIÇÃO DE VIGÊNCIA: A INVARIANTE NÃO ESTÁ NESTE ARQUIVO.
--
-- Duas delegações vigentes para a MESMA pessoa não têm resposta certa:
-- `ContextoUsuario.delegacaoId` e `log_auditoria.delegacao_id` guardam UM id, não
-- uma lista — o modelo não sabe representar duas. A pessoa ficaria com escopo
-- emprestado que ninguém consegue apontar na trilha.
--
-- Expressar isso como restrição de tabela exigiria `exclude using gist (... with
-- &&)`, que precisa da extensão `btree_gist`. A decisão de arquitetura do núcleo
-- é "Postgres puro (sem extensões)", pela mesma razão que `ltree` foi recusado
-- para o organograma: a hospedagem ainda está indefinida, e uma extensão ausente
-- viraria falha de inicialização num ambiente que ninguém escolheu ainda.
--
-- A invariante é mantida por `criarDelegacao` (api/src/core/rbac/delegacoes.ts),
-- pelo mesmo padrão que `criarSessao` usa para "no máximo uma sessão pendente por
-- conta": DENTRO de uma transação, `select ... for update` na linha de `usuarios`
-- do DESTINATÁRIO, depois a checagem de sobreposição, depois o insert. O lock
-- serializa todas as tentativas dirigidas à mesma pessoa; como o Postgres roda em
-- READ COMMITTED, o SELECT que vem DEPOIS de esperar o lock enxerga o que a
-- transação anterior comitou, e a segunda tentativa vê a primeira.
--
-- Sem o lock, a checagem e o insert são dois comandos com uma janela entre eles:
-- duas requisições simultâneas leem "não há sobreposição", ambas inserem, e a
-- pessoa acorda com duas delegações vigentes. É corrida de verdade, não hipótese:
-- N conexões que TODAS checam antes de qualquer insert produzem N linhas, 100%
-- das vezes (probe de barreira de fase, medido). Disparar N `criarDelegacao`
-- concorrentes NÃO reproduz isso — o pool escalona as transações e cada uma
-- comita antes de a seguinte checar. Por isso o teste que guarda essa invariante
-- (api/tests/delegacoes.test.ts) prova a coisa determinística: que o `for update`
-- é de fato tomado na linha do destinatário, segurando o lock por fora e exigindo
-- que uma criação concorrente bloqueie até soltarmos.
--
-- O QUE ISSO NÃO GARANTE, e a restrição de tabela garantiria: o banco não recusa
-- nada por conta própria. Qualquer caminho FUTURO que insira em `delegacoes` sem
-- tomar o mesmo lock antes reabre a corrida, em silêncio, sem nada aqui para
-- barrar. Hoje `criarDelegacao` é o único caminho de escrita; isso é disciplina
-- de código, não garantia estrutural, e é o preço consciente de não depender de
-- extensão.

-- Serve às duas consultas quentes: a vigência de hoje (`delegacaoAtiva`) e a
-- checagem de sobreposição sob o lock. Parcial porque delegação revogada não
-- entra em nenhuma das duas.
create index idx_delegacoes_para on delegacoes (para_usuario_id, inicio, fim)
  where revogada_em is null;
