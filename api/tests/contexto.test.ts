import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { limparBanco, prepararBanco } from './ajuda/banco';
import { resolverContexto } from '../src/core/rbac/contexto';
import { criarCenarioAcesso } from './ajuda/cenario';

beforeAll(prepararBanco);
beforeEach(limparBanco);

describe('resolverContexto', () => {
  it('reune permissoes dos papeis do cargo', async () => {
    const c = await criarCenarioAcesso();
    const ctx = await resolverContexto(c.analista.id);
    expect(ctx.permissoes.get('pessoas.colaborador.ler')).toBe('proprio');
  });

  it('alcance mais amplo vence quando ha dois vinculos', async () => {
    const c = await criarCenarioAcesso();
    const ctx = await resolverContexto(c.diretor.id);
    expect(ctx.permissoes.get('pessoas.colaborador.ler')).toBe('subarvore');
  });

  it('escopo de subarvore inclui as unidades abaixo', async () => {
    const c = await criarCenarioAcesso();
    const ctx = await resolverContexto(c.diretor.id);
    expect(ctx.unidadesDeEscopo).toContain(c.equipeSocial.id);
  });

  it('analista nao enxerga unidade irma', async () => {
    const c = await criarCenarioAcesso();
    const ctx = await resolverContexto(c.analista.id);
    expect(ctx.unidadesDeEscopo).not.toContain(c.vendas.id);
  });

  it('vinculo encerrado nao concede permissao', async () => {
    const c = await criarCenarioAcesso();
    await c.encerrarVinculo(c.analista.id);
    const ctx = await resolverContexto(c.analista.id);
    expect(ctx.permissoes.size).toBe(0);
  });
});
