import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { limparBanco, prepararBanco } from './ajuda/banco';
import { criarCenarioAcesso } from './ajuda/cenario';
import { resolverContexto } from '../src/core/rbac/contexto';
import { escopoDe } from '../src/core/rbac/escopo';
import { criarRepositorio } from '../src/core/rbac/repositorio';

beforeAll(prepararBanco);
beforeEach(limparBanco);

describe('escopoDe', () => {
  it('devolve null quando o usuario nao tem a permissao', async () => {
    const c = await criarCenarioAcesso();
    const ctx = await resolverContexto(c.analista.id);
    expect(escopoDe(ctx, 'pessoas.colaborador.excluir')).toBeNull();
  });

  it('limita o analista a propria unidade', async () => {
    const c = await criarCenarioAcesso();
    const ctx = await resolverContexto(c.analista.id);
    const escopo = escopoDe(ctx, 'pessoas.colaborador.ler');
    expect(escopo?.alcance).toBe('proprio');
    expect(escopo?.unidades).toEqual([c.equipeSocial.id]);
  });

  it('expande a subarvore do diretor', async () => {
    const c = await criarCenarioAcesso();
    const ctx = await resolverContexto(c.diretor.id);
    const escopo = escopoDe(ctx, 'pessoas.colaborador.ler');
    expect(escopo?.alcance).toBe('subarvore');
    expect(escopo?.unidades).toEqual(expect.arrayContaining([c.marketing.id, c.equipeSocial.id]));
    expect(escopo?.unidades).not.toContain(c.vendas.id);
  });
});

describe('repositorio', () => {
  it('exigir lanca 403 quando falta a permissao', async () => {
    const c = await criarCenarioAcesso();
    const repo = criarRepositorio(await resolverContexto(c.analista.id));
    expect(() => repo.exigir('pessoas.colaborador.excluir')).toThrow(/permit/i);
  });

  it('exigir passa quando a permissao existe', async () => {
    const c = await criarCenarioAcesso();
    const repo = criarRepositorio(await resolverContexto(c.analista.id));
    expect(() => repo.exigir('pessoas.colaborador.ler')).not.toThrow();
  });

  it('recusa tabela nao registrada como escopada', async () => {
    const c = await criarCenarioAcesso();
    const repo = criarRepositorio(await resolverContexto(c.diretor.id));
    await expect(repo.listar('tabela_fantasma', 'pessoas.colaborador.ler')).rejects.toThrow(/registrada/i);
  });
});
