import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { limparBanco, prepararBanco } from './ajuda/banco';
import { db } from '../src/core/db/client';
import {
  cargoPapeis, cargos, papeis, papelPermissoes, permissoes, usuarios, vinculos,
} from '../src/core/db/schema/acesso';
import { criarUnidade } from '../src/core/organograma/servico';
import { resolverContexto } from '../src/core/rbac/contexto';
import { criarCenarioAcesso } from './ajuda/cenario';

beforeAll(prepararBanco);
beforeEach(limparBanco);

describe('resolverContexto', () => {
  it('reune permissoes dos papeis do cargo', async () => {
    const c = await criarCenarioAcesso();
    const ctx = await resolverContexto(c.analista.id);
    const escopo = ctx.permissoes.get('pessoas.colaborador.ler');
    expect(escopo?.alcance).toBe('proprio');
    expect(escopo?.unidades).toEqual([c.equipeSocial.id]);
  });

  it('alcance mais amplo vence quando o cargo tem dois papeis', async () => {
    const c = await criarCenarioAcesso();
    const ctx = await resolverContexto(c.diretor.id);
    expect(ctx.permissoes.get('pessoas.colaborador.ler')?.alcance).toBe('subarvore');
  });

  it('escopo de subarvore inclui as unidades abaixo', async () => {
    const c = await criarCenarioAcesso();
    const ctx = await resolverContexto(c.diretor.id);
    expect(ctx.permissoes.get('pessoas.colaborador.ler')?.unidades).toContain(c.equipeSocial.id);
  });

  it('analista nao enxerga unidade irma', async () => {
    const c = await criarCenarioAcesso();
    const ctx = await resolverContexto(c.analista.id);
    expect(ctx.permissoes.get('pessoas.colaborador.ler')?.unidades).not.toContain(c.vendas.id);
  });

  it('vinculo encerrado nao concede permissao', async () => {
    const c = await criarCenarioAcesso();
    await c.encerrarVinculo(c.analista.id);
    const ctx = await resolverContexto(c.analista.id);
    expect(ctx.permissoes.size).toBe(0);
  });

  it('vinculo com fim igual a hoje ainda concede permissao', async () => {
    const c = await criarCenarioAcesso();
    const hoje = new Date().toISOString().slice(0, 10);
    await db.update(vinculos).set({ fim: hoje }).where(eq(vinculos.id, c.vinculoAnalista));

    const ctx = await resolverContexto(c.analista.id);
    const escopo = ctx.permissoes.get('pessoas.colaborador.ler');
    expect(escopo?.alcance).toBe('proprio');
    expect(escopo?.unidades).toEqual([c.equipeSocial.id]);
  });

  it('vinculo com inicio no futuro ainda nao concede permissao', async () => {
    const c = await criarCenarioAcesso();
    const amanha = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await db.update(vinculos).set({ inicio: amanha }).where(eq(vinculos.id, c.vinculoAnalista));

    const ctx = await resolverContexto(c.analista.id);
    expect(ctx.permissoes.size).toBe(0);
  });

  it('alcance global expande para todas as unidades', async () => {
    const c = await criarCenarioAcesso();

    const papelAdministrador = { id: randomUUID(), nome: 'Administrador', descricao: '' };
    await db.insert(papeis).values(papelAdministrador);
    await db.insert(papelPermissoes).values({
      papelId: papelAdministrador.id, permissaoChave: 'pessoas.colaborador.ler', alcance: 'global',
    });

    const cargoAdministrador = { id: randomUUID(), nome: 'Administrador Geral', nivel: 9 };
    await db.insert(cargos).values(cargoAdministrador);
    await db.insert(cargoPapeis).values({ cargoId: cargoAdministrador.id, papelId: papelAdministrador.id });

    const administrador = { id: randomUUID(), email: 'admin@4med.com', nome: 'Ada', status: 'ativo' as const };
    await db.insert(usuarios).values(administrador);

    const hoje = new Date().toISOString().slice(0, 10);
    await db.insert(vinculos).values({
      id: randomUUID(),
      usuarioId: administrador.id,
      unidadeId: c.equipeSocial.id,
      cargoId: cargoAdministrador.id,
      principal: true,
      inicio: hoje,
    });

    const ctx = await resolverContexto(administrador.id);
    const escopo = ctx.permissoes.get('pessoas.colaborador.ler');
    expect(escopo?.alcance).toBe('global');
    expect(escopo?.unidades).toEqual(
      expect.arrayContaining([c.empresa.id, c.marketing.id, c.vendas.id, c.equipeSocial.id]),
    );
  });

  it('permissoes de vinculos diferentes nao se contaminam, e a mesma permissao soma unidades de vinculos distintos', async () => {
    const c = await criarCenarioAcesso();
    const equipeFinanceiro = await criarUnidade({ nome: 'Financeiro', tipo: 'equipe', paiId: c.empresa.id });

    // Uma permissao nova, concedida por um cargo que nao tem nada a ver com "ler":
    // serve so para provar que ela nao vaza para o escopo de "ler".
    await db.insert(permissoes).values({
      chave: 'pessoas.colaborador.aprovar', modulo: 'pessoas', descricao: 'Aprovar colaboradores',
    });
    const papelAprovador = { id: randomUUID(), nome: 'Aprovador', descricao: '' };
    await db.insert(papeis).values(papelAprovador);
    await db.insert(papelPermissoes).values({
      papelId: papelAprovador.id, permissaoChave: 'pessoas.colaborador.aprovar', alcance: 'proprio',
    });
    const cargoComercial = { id: randomUUID(), nome: 'Comercial', nivel: 2 };
    await db.insert(cargos).values(cargoComercial);
    await db.insert(cargoPapeis).values({ cargoId: cargoComercial.id, papelId: papelAprovador.id });

    const coordenadora = { id: randomUUID(), email: 'coordenadora@4med.com', nome: 'Clara', status: 'ativo' as const };
    await db.insert(usuarios).values(coordenadora);

    const hoje = new Date().toISOString().slice(0, 10);
    await db.insert(vinculos).values([
      // "ler" via subarvore em Marketing (cargo ja existente do cenario base).
      {
        id: randomUUID(), usuarioId: coordenadora.id, unidadeId: c.marketing.id,
        cargoId: c.cargoDiretor.id, principal: true, inicio: hoje,
      },
      // "ler" via proprio em Vendas (vinculo diferente, mesma permissao, alcance menor).
      {
        id: randomUUID(), usuarioId: coordenadora.id, unidadeId: c.vendas.id,
        cargoId: c.cargoAnalista.id, principal: false, inicio: hoje,
      },
      // "aprovar" — e so "aprovar" — no Financeiro. Nunca deveria aparecer em "ler".
      {
        id: randomUUID(), usuarioId: coordenadora.id, unidadeId: equipeFinanceiro.id,
        cargoId: cargoComercial.id, principal: false, inicio: hoje,
      },
    ]);

    const ctx = await resolverContexto(coordenadora.id);

    const ler = ctx.permissoes.get('pessoas.colaborador.ler');
    expect(ler?.alcance).toBe('subarvore');
    expect(ler?.unidades).toEqual(
      [c.marketing.id, c.equipeSocial.id, c.vendas.id].sort((a, b) => a - b),
    );
    expect(ler?.unidades).not.toContain(equipeFinanceiro.id);

    const aprovar = ctx.permissoes.get('pessoas.colaborador.aprovar');
    expect(aprovar?.alcance).toBe('proprio');
    expect(aprovar?.unidades).toEqual([equipeFinanceiro.id]);
  });
});
