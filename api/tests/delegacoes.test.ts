import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { limparBanco, prepararBanco } from './ajuda/banco';
import { criarCenarioAcesso } from './ajuda/cenario';
import { consultarAuditoria } from '../src/core/auditoria/registro';
import { db, pool } from '../src/core/db/client';
import { SQL_DATA_DE_HOJE } from '../src/core/db/fuso';
import { usuarios, vinculos } from '../src/core/db/schema/acesso';
import { delegacoes } from '../src/core/db/schema/delegacoes';
import { resolverContexto } from '../src/core/rbac/contexto';
import { criarDelegacao, delegacaoAtiva, revogarDelegacao } from '../src/core/rbac/delegacoes';

beforeAll(prepararBanco);
beforeEach(limparBanco);

const origem = { ip: '203.0.113.7', agente: 'vitest' };

/**
 * Data de hoje no MESMO fuso que a vigência usa, calculada aqui de forma
 * independente do banco (via `Intl`, que carrega o próprio banco de fusos).
 * `new Date().toISOString().slice(0,10)` daria a data em UTC, e num servidor
 * de CI em UTC entre 21h e 0h (horário de Brasília) o "hoje" do teste seria o
 * amanhã da vigência — o teste falharia sozinho, à noite, sem nenhum bug.
 */
const hoje = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

const daquiA = (dias: number) => {
  const [ano, mes, dia] = hoje().split('-').map(Number);
  // Meio-dia UTC: longe o bastante das duas bordas do dia para que a aritmética
  // de dias nunca escorregue por causa de fuso.
  const base = Date.UTC(ano ?? 0, (mes ?? 1) - 1, dia ?? 1, 12);
  return new Date(base + dias * 86_400_000).toISOString().slice(0, 10);
};

/** Terceiro usuário, para o teste de encadeamento. Reaproveita o cargo do analista. */
async function criarTerceiro(unidadeId: number, cargoId: string) {
  const usuario = {
    id: randomUUID(), email: `caio-${randomUUID()}@4med.com`, nome: 'Caio', status: 'ativo' as const,
  };
  await db.insert(usuarios).values(usuario);
  await db.insert(vinculos).values({
    id: randomUUID(), usuarioId: usuario.id, unidadeId, cargoId, principal: true, inicio: hoje(),
  });
  return usuario;
}

describe('delegacao', () => {
  it('empresta o alcance do diretor ao analista durante a vigencia', async () => {
    const c = await criarCenarioAcesso();
    await c.conceder(c.diretor.id, 'core.delegacao.criar', 'proprio');
    const ctxDiretor = await resolverContexto(c.diretor.id);

    await criarDelegacao(ctxDiretor, {
      paraUsuarioId: c.analista.id, inicio: hoje(), fim: daquiA(7), motivo: 'ferias',
    }, origem);

    const ctx = await resolverContexto(c.analista.id);
    const escopo = ctx.permissoes.get('pessoas.colaborador.ler');
    expect(escopo?.alcance).toBe('subarvore');
    expect(escopo?.unidades).toContain(c.marketing.id);
    expect(ctx.delegacaoId).not.toBeNull();
  });

  it('vale no primeiro e no ultimo dia da vigencia', async () => {
    const c = await criarCenarioAcesso();
    await c.conceder(c.diretor.id, 'core.delegacao.criar', 'proprio');
    const ctxDiretor = await resolverContexto(c.diretor.id);

    await criarDelegacao(ctxDiretor, {
      paraUsuarioId: c.analista.id, inicio: hoje(), fim: hoje(), motivo: 'um dia so',
    }, origem);

    expect(await delegacaoAtiva(c.analista.id)).not.toBeNull();
  });

  it('delegacao futura ainda nao vale', async () => {
    const c = await criarCenarioAcesso();
    await c.conceder(c.diretor.id, 'core.delegacao.criar', 'proprio');
    const ctxDiretor = await resolverContexto(c.diretor.id);

    await criarDelegacao(ctxDiretor, {
      paraUsuarioId: c.analista.id, inicio: daquiA(3), fim: daquiA(10), motivo: 'ferias',
    }, origem);

    const ctx = await resolverContexto(c.analista.id);
    expect(ctx.permissoes.get('pessoas.colaborador.ler')?.alcance).toBe('proprio');
    expect(ctx.delegacaoId).toBeNull();
  });

  it('delegacao expirada nao vale', async () => {
    const c = await criarCenarioAcesso();
    await c.conceder(c.diretor.id, 'core.delegacao.criar', 'proprio');
    const ctxDiretor = await resolverContexto(c.diretor.id);

    await criarDelegacao(ctxDiretor, {
      paraUsuarioId: c.analista.id, inicio: daquiA(-20), fim: daquiA(-10), motivo: 'ferias',
    }, origem);

    const ctx = await resolverContexto(c.analista.id);
    expect(ctx.permissoes.get('pessoas.colaborador.ler')?.unidades)
      .not.toContain(c.marketing.id);
    expect(ctx.delegacaoId).toBeNull();
  });

  it('quem recebe nao acumula alem do que o delegante tem', async () => {
    const c = await criarCenarioAcesso();
    await c.conceder(c.diretor.id, 'core.delegacao.criar', 'proprio');
    const ctxDiretor = await resolverContexto(c.diretor.id);

    await criarDelegacao(ctxDiretor, {
      paraUsuarioId: c.analista.id, inicio: hoje(), fim: daquiA(7), motivo: 'ferias',
    }, origem);

    const ctx = await resolverContexto(c.analista.id);
    expect(ctx.permissoes.get('pessoas.colaborador.ler')?.unidades)
      .not.toContain(c.vendas.id);
  });

  it('grava como delegante quem chamou, nunca um id vindo de fora', async () => {
    const c = await criarCenarioAcesso();
    await c.conceder(c.diretor.id, 'core.delegacao.criar', 'proprio');
    const ctxDiretor = await resolverContexto(c.diretor.id);

    const { id } = await criarDelegacao(ctxDiretor, {
      paraUsuarioId: c.analista.id, inicio: hoje(), fim: daquiA(7), motivo: 'ferias',
    }, origem);

    const [linha] = await db.select().from(delegacoes).where(eq(delegacoes.id, id));
    expect(linha?.deUsuarioId).toBe(c.diretor.id);
  });

  it('recusa criar sem a permissao core.delegacao.criar', async () => {
    const c = await criarCenarioAcesso();
    const ctxDiretor = await resolverContexto(c.diretor.id);

    await expect(criarDelegacao(ctxDiretor, {
      paraUsuarioId: c.analista.id, inicio: hoje(), fim: daquiA(7), motivo: 'ferias',
    }, origem)).rejects.toMatchObject({ codigo: 'sem_permissao' });

    expect(await db.select().from(delegacoes)).toHaveLength(0);
  });

  it('recusa delegar para si mesmo', async () => {
    const c = await criarCenarioAcesso();
    await c.conceder(c.diretor.id, 'core.delegacao.criar', 'proprio');
    const ctxDiretor = await resolverContexto(c.diretor.id);

    await expect(criarDelegacao(ctxDiretor, {
      paraUsuarioId: c.diretor.id, inicio: hoje(), fim: daquiA(7), motivo: 'ferias',
    }, origem)).rejects.toMatchObject({ codigo: 'delegacao_invalida' });
  });

  it('recusa fim anterior ao inicio', async () => {
    const c = await criarCenarioAcesso();
    await c.conceder(c.diretor.id, 'core.delegacao.criar', 'proprio');
    const ctxDiretor = await resolverContexto(c.diretor.id);

    await expect(criarDelegacao(ctxDiretor, {
      paraUsuarioId: c.analista.id, inicio: daquiA(7), fim: hoje(), motivo: 'ferias',
    }, origem)).rejects.toMatchObject({ codigo: 'delegacao_invalida' });
  });

  it('recusa delegar para quem nao existe, sem confirmar que o id e falso', async () => {
    const c = await criarCenarioAcesso();
    await c.conceder(c.diretor.id, 'core.delegacao.criar', 'proprio');
    const ctxDiretor = await resolverContexto(c.diretor.id);

    await expect(criarDelegacao(ctxDiretor, {
      paraUsuarioId: randomUUID(), inicio: hoje(), fim: daquiA(7), motivo: 'ferias',
    }, origem)).rejects.toMatchObject({ codigo: 'nao_encontrado' });
  });

  it('nao encadeia: o escopo emprestado e o proprio do delegante', async () => {
    const c = await criarCenarioAcesso();
    await c.conceder(c.diretor.id, 'core.delegacao.criar', 'proprio');
    await c.conceder(c.analista.id, 'core.delegacao.criar', 'proprio');
    const caio = await criarTerceiro(c.equipeSocial.id, c.cargoAnalista.id);

    const ctxDiretor = await resolverContexto(c.diretor.id);
    await criarDelegacao(ctxDiretor, {
      paraUsuarioId: c.analista.id, inicio: hoje(), fim: daquiA(7), motivo: 'ferias',
    }, origem);

    // O analista age COM o escopo do diretor neste momento; mesmo assim, o que ele
    // empresta adiante é so o dele.
    const ctxAnalista = await resolverContexto(c.analista.id);
    expect(ctxAnalista.permissoes.get('pessoas.colaborador.ler')?.unidades)
      .toContain(c.marketing.id);

    await criarDelegacao(ctxAnalista, {
      paraUsuarioId: caio.id, inicio: hoje(), fim: daquiA(7), motivo: 'repasse',
    }, origem);

    const ctxCaio = await resolverContexto(caio.id);
    expect(ctxCaio.permissoes.get('pessoas.colaborador.ler')?.unidades)
      .not.toContain(c.marketing.id);
    expect(ctxCaio.permissoes.get('pessoas.colaborador.ler')?.alcance).toBe('proprio');
  });

  it('recusa duas delegacoes vigentes sobrepostas para a mesma pessoa', async () => {
    const c = await criarCenarioAcesso();
    await c.conceder(c.diretor.id, 'core.delegacao.criar', 'proprio');
    const ctxDiretor = await resolverContexto(c.diretor.id);

    await criarDelegacao(ctxDiretor, {
      paraUsuarioId: c.analista.id, inicio: hoje(), fim: daquiA(7), motivo: 'ferias',
    }, origem);

    await expect(criarDelegacao(ctxDiretor, {
      paraUsuarioId: c.analista.id, inicio: daquiA(3), fim: daquiA(10), motivo: 'congresso',
    }, origem)).rejects.toMatchObject({ codigo: 'delegacao_sobreposta' });

    expect(await db.select().from(delegacoes)).toHaveLength(1);
  });

  it('aceita a delegacao seguinte quando ela comeca depois do fim da anterior', async () => {
    const c = await criarCenarioAcesso();
    await c.conceder(c.diretor.id, 'core.delegacao.criar', 'proprio');
    const ctxDiretor = await resolverContexto(c.diretor.id);

    await criarDelegacao(ctxDiretor, {
      paraUsuarioId: c.analista.id, inicio: hoje(), fim: daquiA(7), motivo: 'ferias',
    }, origem);
    await criarDelegacao(ctxDiretor, {
      paraUsuarioId: c.analista.id, inicio: daquiA(8), fim: daquiA(15), motivo: 'congresso',
    }, origem);

    expect(await db.select().from(delegacoes)).toHaveLength(2);
  });

  it('delegacao revogada libera o mesmo periodo para outra', async () => {
    const c = await criarCenarioAcesso();
    await c.conceder(c.diretor.id, 'core.delegacao.criar', 'proprio');
    const ctxDiretor = await resolverContexto(c.diretor.id);

    const { id } = await criarDelegacao(ctxDiretor, {
      paraUsuarioId: c.analista.id, inicio: hoje(), fim: daquiA(7), motivo: 'ferias',
    }, origem);
    await revogarDelegacao(ctxDiretor, id, origem);

    await criarDelegacao(ctxDiretor, {
      paraUsuarioId: c.analista.id, inicio: hoje(), fim: daquiA(7), motivo: 'ferias remarcadas',
    }, origem);

    expect(await db.select().from(delegacoes)).toHaveLength(2);
  });

  it('delegacao revogada deixa de emprestar escopo', async () => {
    const c = await criarCenarioAcesso();
    await c.conceder(c.diretor.id, 'core.delegacao.criar', 'proprio');
    const ctxDiretor = await resolverContexto(c.diretor.id);

    const { id } = await criarDelegacao(ctxDiretor, {
      paraUsuarioId: c.analista.id, inicio: hoje(), fim: daquiA(7), motivo: 'ferias',
    }, origem);
    await revogarDelegacao(ctxDiretor, id, origem);

    const ctx = await resolverContexto(c.analista.id);
    expect(ctx.permissoes.get('pessoas.colaborador.ler')?.unidades)
      .not.toContain(c.marketing.id);
    expect(ctx.delegacaoId).toBeNull();
  });

  it('quem nao e o delegante nem administra recebe 404 ao revogar, nunca 403', async () => {
    const c = await criarCenarioAcesso();
    await c.conceder(c.diretor.id, 'core.delegacao.criar', 'proprio');
    const ctxDiretor = await resolverContexto(c.diretor.id);
    const { id } = await criarDelegacao(ctxDiretor, {
      paraUsuarioId: c.analista.id, inicio: hoje(), fim: daquiA(7), motivo: 'ferias',
    }, origem);

    const ctxAnalista = await resolverContexto(c.analista.id);
    await expect(revogarDelegacao(ctxAnalista, id, origem))
      .rejects.toMatchObject({ codigo: 'nao_encontrado', status: 404 });

    const [linha] = await db.select().from(delegacoes).where(eq(delegacoes.id, id));
    expect(linha?.revogadaEm).toBeNull();
  });

  it('quem tem core.delegacao.administrar revoga delegacao alheia', async () => {
    const c = await criarCenarioAcesso();
    await c.conceder(c.diretor.id, 'core.delegacao.criar', 'proprio');
    await c.conceder(c.analista.id, 'core.delegacao.administrar', 'global');
    const ctxDiretor = await resolverContexto(c.diretor.id);
    const { id } = await criarDelegacao(ctxDiretor, {
      paraUsuarioId: c.analista.id, inicio: hoje(), fim: daquiA(7), motivo: 'ferias',
    }, origem);

    const ctxAnalista = await resolverContexto(c.analista.id);
    await revogarDelegacao(ctxAnalista, id, origem);

    expect(await delegacaoAtiva(c.analista.id)).toBeNull();
  });

  it('revogar duas vezes devolve 404 na segunda', async () => {
    const c = await criarCenarioAcesso();
    await c.conceder(c.diretor.id, 'core.delegacao.criar', 'proprio');
    const ctxDiretor = await resolverContexto(c.diretor.id);
    const { id } = await criarDelegacao(ctxDiretor, {
      paraUsuarioId: c.analista.id, inicio: hoje(), fim: daquiA(7), motivo: 'ferias',
    }, origem);

    await revogarDelegacao(ctxDiretor, id, origem);
    await expect(revogarDelegacao(ctxDiretor, id, origem))
      .rejects.toMatchObject({ codigo: 'nao_encontrado' });
  });

  it('registra criacao e revogacao na trilha de auditoria', async () => {
    const c = await criarCenarioAcesso();
    await c.conceder(c.diretor.id, 'core.delegacao.criar', 'proprio');
    const ctxDiretor = await resolverContexto(c.diretor.id);

    const { id } = await criarDelegacao(ctxDiretor, {
      paraUsuarioId: c.analista.id, inicio: hoje(), fim: daquiA(7), motivo: 'ferias',
    }, origem);
    await revogarDelegacao(ctxDiretor, id, origem);

    const trilha = await consultarAuditoria({ unidades: [], alcanceGlobal: true });
    const acoes = trilha.filter((l) => l.recursoId === id).map((l) => l.acao);
    expect(acoes).toContain('delegacao.criada');
    expect(acoes).toContain('delegacao.revogada');
    expect(trilha.find((l) => l.acao === 'delegacao.criada')?.atorId).toBe(c.diretor.id);
  });

  it('a vigencia usa o fuso de Sao Paulo, nao o do servidor de banco', async () => {
    // Duas sessões em fusos extremos. Sao Paulo é UTC-3: a data de Kiritimati
    // (UTC+14) difere da paulistana das 7h da manhã em diante, e a de Etc/GMT+12
    // (UTC-12) difere da meia-noite às 9h — juntas cobrem as 24 horas do dia.
    // Em qualquer instante, portanto, pelo menos uma das duas sessões daria uma
    // data diferente se a vigência usasse `current_date` (a data da SESSÃO).
    const esperada = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })
      .format(new Date());

    for (const fuso of ['Pacific/Kiritimati', 'Etc/GMT+12']) {
      const cliente = await pool.connect();
      try {
        await cliente.query(`set time zone '${fuso}'`);
        const { rows } = await cliente.query<{ data: string }>(
          `select to_char(${SQL_DATA_DE_HOJE}, 'YYYY-MM-DD') as data`,
        );
        expect(rows[0]?.data, `fuso de sessao ${fuso}`).toBe(esperada);
      } finally {
        // `set time zone` vale pela conexão inteira: sem restaurar, a conexão volta
        // envenenada para o pool e contamina todo teste que a pegar depois.
        await cliente.query('reset time zone');
        cliente.release();
      }
    }
  });
});
