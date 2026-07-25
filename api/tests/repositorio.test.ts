import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { limparBanco, prepararBanco } from './ajuda/banco';
import { criarCenarioAcesso } from './ajuda/cenario';
import { registrosTesteRbac } from './ajuda/tabela-fixture';
import { db } from '../src/core/db/client';
import type { ContextoUsuario, EscopoPermissao } from '../src/core/rbac/contexto';
import { resolverContexto } from '../src/core/rbac/contexto';
import { escopoDe } from '../src/core/rbac/escopo';
import { criarRepositorio } from '../src/core/rbac/repositorio';
import { registrarTabelaEscopada, tabelaEscopada } from '../src/core/rbac/tabelas-escopadas';

beforeAll(prepararBanco);
beforeEach(limparBanco);

// Registrada uma única vez, no carregamento deste arquivo: existe só para os
// testes abaixo exercitarem o portão de autorização com dado real no banco,
// não é uma tabela de domínio (ver comentário em ajuda/tabela-fixture.ts).
registrarTabelaEscopada('registros_teste_rbac', {
  tabela: registrosTesteRbac,
  colunaUnidade: registrosTesteRbac.unidadeId,
  colunaId: registrosTesteRbac.id,
  colunaDono: registrosTesteRbac.donoId,
});

// `repo.listar`/`obter` devolvem `unknown` de propósito (ver Repositorio em
// repositorio.ts) — quem consome valida a forma da linha antes de confiar nos
// campos. Aqui a validação é feita com Zod, do mesmo jeito que um módulo de
// domínio real faria.
const linhaTeste = z.object({
  id: z.string(),
  unidadeId: z.number(),
  donoId: z.string().nullable(),
  nome: z.string(),
});

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

describe('repositorio — filtro real contra tabela registrada', () => {
  it('diretor com subarvore lista as linhas de Marketing e da equipe abaixo, mas nao as de Vendas', async () => {
    const c = await criarCenarioAcesso();
    const linhaMarketing = { id: randomUUID(), unidadeId: c.marketing.id, donoId: null, nome: 'm' };
    const linhaEquipe = { id: randomUUID(), unidadeId: c.equipeSocial.id, donoId: null, nome: 'e' };
    const linhaVendas = { id: randomUUID(), unidadeId: c.vendas.id, donoId: null, nome: 'v' };
    await db.insert(registrosTesteRbac).values([linhaMarketing, linhaEquipe, linhaVendas]);

    const repo = criarRepositorio(await resolverContexto(c.diretor.id));
    const linhas = (await repo.listar('registros_teste_rbac', 'pessoas.colaborador.ler'))
      .map((l) => linhaTeste.parse(l));

    expect(linhas.map((l) => l.id).sort()).toEqual([linhaMarketing.id, linhaEquipe.id].sort());
    expect(linhas.some((l) => l.id === linhaVendas.id)).toBe(false);
  });

  it('analista com proprio lista so o que lhe cabe: dono = ele mesmo, dentro da propria unidade', async () => {
    const c = await criarCenarioAcesso();
    const linhaAnalista = { id: randomUUID(), unidadeId: c.equipeSocial.id, donoId: c.analista.id, nome: 'a' };
    const linhaOutroDonoMesmaUnidade = { id: randomUUID(), unidadeId: c.equipeSocial.id, donoId: c.diretor.id, nome: 'b' };
    const linhaMesmoDonoOutraUnidade = { id: randomUUID(), unidadeId: c.marketing.id, donoId: c.analista.id, nome: 'c' };
    await db.insert(registrosTesteRbac).values([linhaAnalista, linhaOutroDonoMesmaUnidade, linhaMesmoDonoOutraUnidade]);

    const repo = criarRepositorio(await resolverContexto(c.analista.id));
    const linhas = (await repo.listar('registros_teste_rbac', 'pessoas.colaborador.ler'))
      .map((l) => linhaTeste.parse(l));

    expect(linhas.map((l) => l.id)).toEqual([linhaAnalista.id]);
  });

  it('registro cujo dono e o usuario, mas em unidade fora do escopo dele, nao aparece', async () => {
    const c = await criarCenarioAcesso();
    const linhaForaDeEscopo = { id: randomUUID(), unidadeId: c.vendas.id, donoId: c.analista.id, nome: 'x' };
    await db.insert(registrosTesteRbac).values(linhaForaDeEscopo);

    const repo = criarRepositorio(await resolverContexto(c.analista.id));
    const linhas = await repo.listar('registros_teste_rbac', 'pessoas.colaborador.ler');

    expect(linhas).toEqual([]);
  });

  it('obter de id existente fora do escopo lanca 404, nao 403, sem devolver a linha', async () => {
    const c = await criarCenarioAcesso();
    const linhaVendas = { id: randomUUID(), unidadeId: c.vendas.id, donoId: null, nome: 'v' };
    await db.insert(registrosTesteRbac).values(linhaVendas);

    const repo = criarRepositorio(await resolverContexto(c.diretor.id));
    await expect(repo.obter('registros_teste_rbac', 'pessoas.colaborador.ler', linhaVendas.id))
      .rejects.toMatchObject({ status: 404, codigo: 'nao_encontrado' });
  });

  it('obter de id inexistente lanca 404 — mesma resposta, indistinguivel da anterior', async () => {
    const c = await criarCenarioAcesso();
    const repo = criarRepositorio(await resolverContexto(c.diretor.id));
    await expect(repo.obter('registros_teste_rbac', 'pessoas.colaborador.ler', randomUUID()))
      .rejects.toMatchObject({ status: 404, codigo: 'nao_encontrado' });
  });

  it('quem nao tem a permissao recebe 403 de listar, sem consultar dado', async () => {
    const c = await criarCenarioAcesso();
    await db.insert(registrosTesteRbac).values({ id: randomUUID(), unidadeId: c.equipeSocial.id, donoId: null, nome: 'x' });

    const repo = criarRepositorio(await resolverContexto(c.analista.id));
    await expect(repo.listar('registros_teste_rbac', 'pessoas.colaborador.excluir'))
      .rejects.toMatchObject({ status: 403, codigo: 'sem_permissao' });
  });

  it('escopo com lista de unidades vazia nao devolve nenhuma linha, mesmo havendo dados', async () => {
    const c = await criarCenarioAcesso();
    await db.insert(registrosTesteRbac).values({ id: randomUUID(), unidadeId: c.marketing.id, donoId: null, nome: 'x' });

    const permissoesComEscopoVazio = new Map<string, EscopoPermissao>([
      ['pessoas.colaborador.ler', { alcance: 'subarvore', unidades: [] }],
    ]);
    const ctxEscopoVazio: ContextoUsuario = {
      usuarioId: c.diretor.id,
      permissoes: permissoesComEscopoVazio,
      delegacaoId: null,
    };
    const repo = criarRepositorio(ctxEscopoVazio);
    const linhas = await repo.listar('registros_teste_rbac', 'pessoas.colaborador.ler');

    expect(linhas).toEqual([]);
  });
});

describe('registrarTabelaEscopada', () => {
  it('registra e permite recuperar a definicao pelo nome', () => {
    registrarTabelaEscopada('tabela_unica_teste_registro', {
      tabela: registrosTesteRbac,
      colunaUnidade: registrosTesteRbac.unidadeId,
      colunaId: registrosTesteRbac.id,
      colunaDono: registrosTesteRbac.donoId,
    });

    expect(tabelaEscopada('tabela_unica_teste_registro').colunaDono).toBe(registrosTesteRbac.donoId);
  });

  it('recusa registrar duas vezes o mesmo nome', () => {
    const def = {
      tabela: registrosTesteRbac,
      colunaUnidade: registrosTesteRbac.unidadeId,
      colunaId: registrosTesteRbac.id,
      colunaDono: registrosTesteRbac.donoId,
    };
    registrarTabelaEscopada('tabela_duplicada_teste_registro', def);

    expect(() => registrarTabelaEscopada('tabela_duplicada_teste_registro', def)).toThrow(/ja registrada/i);
  });
});
