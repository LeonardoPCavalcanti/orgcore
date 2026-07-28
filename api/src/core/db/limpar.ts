import { pool } from './client';

/**
 * Trunca todas as tabelas do schema `public`, reiniciando as sequências.
 * Usado pelo seed de demonstração e pelos testes para partir de um banco limpo.
 *
 * Nunca deve ser ligada a nenhuma rota, inicialização ou caminho alcançável em
 * produção: ela contorna, de propósito, a imutabilidade da trilha de auditoria
 * (ver abaixo). O único chamador de produção é o seed, que já recusa rodar com
 * `NODE_ENV === 'production'`.
 */
export async function limparBanco(): Promise<void> {
  const { rows } = await pool.query<{ tabela: string }>(
    `select tablename as tabela from pg_tables where schemaname = 'public'`,
  );
  if (rows.length === 0) return;

  const tabelas = rows.map((r) => r.tabela);
  const temAuditoria = tabelas.includes('log_auditoria');
  const lista = tabelas.map((t) => `"${t}"`).join(', ');

  // log_auditoria tem um gatilho que recusa UPDATE/DELETE/TRUNCATE (ver
  // 0006_auditoria.sql) — de propósito, é a garantia de append-only da
  // trilha. Ela também é referenciada por FK a partir de usuarios/unidades
  // (ator_id, unidade_id): truncar essas tabelas com CASCADE arrasta
  // log_auditoria junto de qualquer forma, então não adianta simplesmente
  // deixá-la de fora da lista — precisa ser um único TRUNCATE com o
  // gatilho desligado ao redor dele. A conexão de teste é dona da tabela
  // (mesmo papel que rodou a migration), e só o dono consegue desabilitar
  // o próprio gatilho — o papel `aplicacao` de produção, sem privilégio de
  // ALTER TABLE, não consegue. Por isso este é o único lugar do projeto
  // com permissão de contornar a imutabilidade, e só entre execuções de teste.
  if (temAuditoria) {
    const { rows: gatilho } = await pool.query<{ tgenabled: string }>(
      `select tgenabled from pg_trigger where tgname = 'trg_auditoria_imutavel'`,
    );
    // Se uma execução anterior desta função morreu entre o disable e o enable
    // (erro transitório, deadlock, processo morto no meio), o gatilho fica
    // desligado pelo resto do processo de teste e todo teste que deveria provar
    // imutabilidade passaria por acidente, sem sinalizar nada. Falha alto aqui
    // em vez de seguir em frente com a garantia central da tarefa já esvaziada.
    if (gatilho[0]?.tgenabled === 'D') {
      throw new Error(
        'trg_auditoria_imutavel encontrado desabilitado no inicio de limparBanco: '
        + 'uma execucao anterior falhou entre desabilitar e reabilitar o gatilho',
      );
    }
  }

  try {
    if (temAuditoria) await pool.query('alter table log_auditoria disable trigger trg_auditoria_imutavel');
    await pool.query(`truncate ${lista} restart identity cascade`);
  } finally {
    // Reabilita mesmo se o truncate (ou o próprio disable) lançar — senão o
    // gatilho fica desligado pelo resto do processo de teste, em silêncio.
    if (temAuditoria) await pool.query('alter table log_auditoria enable trigger trg_auditoria_imutavel');
  }
}
