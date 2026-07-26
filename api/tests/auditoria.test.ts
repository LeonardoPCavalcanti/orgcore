import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { limparBanco, prepararBanco } from './ajuda/banco';
import { criarCenarioAcesso } from './ajuda/cenario';
import { consultarAuditoria, registrarAuditoria } from '../src/core/auditoria/registro';
import { pool } from '../src/core/db/client';

beforeAll(prepararBanco);
beforeEach(limparBanco);

const evento = (over = {}) => ({
  atorId: null, acao: 'login.sucesso', recursoTipo: 'sessao', recursoId: null,
  unidadeId: null, ip: '127.0.0.1', agente: 'vitest', delegacaoId: null, ...over,
});

describe('auditoria', () => {
  it('registra e consulta um evento', async () => {
    const c = await criarCenarioAcesso();
    await registrarAuditoria(evento({ atorId: c.analista.id, unidadeId: c.equipeSocial.id }));
    const linhas = await consultarAuditoria({ unidades: [c.equipeSocial.id] });
    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.acao).toBe('login.sucesso');
  });

  it('guarda o diff antes e depois', async () => {
    const c = await criarCenarioAcesso();
    await registrarAuditoria(evento({
      atorId: c.diretor.id, unidadeId: c.marketing.id, acao: 'vinculo.alterado',
      antes: { cargo: 'Analista' }, depois: { cargo: 'Coordenador' },
    }));
    const [linha] = await consultarAuditoria({ unidades: [c.marketing.id] });
    expect(linha?.depois).toEqual({ cargo: 'Coordenador' });
  });

  it('filtra por unidade: nao devolve evento de fora do escopo', async () => {
    const c = await criarCenarioAcesso();
    await registrarAuditoria(evento({ unidadeId: c.vendas.id }));
    expect(await consultarAuditoria({ unidades: [c.marketing.id] })).toHaveLength(0);
  });

  it('recusa UPDATE na trilha', async () => {
    await registrarAuditoria(evento());
    await expect(pool.query(`update log_auditoria set acao = 'adulterado'`))
      .rejects.toThrow(/append-only|imutav/i);
  });

  it('recusa DELETE na trilha', async () => {
    await registrarAuditoria(evento());
    await expect(pool.query('delete from log_auditoria'))
      .rejects.toThrow(/append-only|imutav/i);
  });

  it('recusa DELETE mesmo quando nenhuma linha casa (gatilho e por statement)', async () => {
    await expect(pool.query(`delete from log_auditoria where acao = 'inexistente'`))
      .rejects.toThrow(/append-only|imutav/i);
  });

  it('lista de unidades vazia nao devolve nenhuma linha (falha fechado)', async () => {
    const c = await criarCenarioAcesso();
    await registrarAuditoria(evento({ unidadeId: c.marketing.id }));
    expect(await consultarAuditoria({ unidades: [] })).toHaveLength(0);
  });
});
