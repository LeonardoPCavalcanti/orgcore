import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { criarApp } from '../src/core/app';
import { db } from '../src/core/db/client';
import { cargoPapeis, papeis, papelPermissoes, usuarios, vinculos } from '../src/core/db/schema/acesso';
import { delegacoes } from '../src/core/db/schema/delegacoes';
import { manifestoNucleo } from '../src/core/manifesto';
import { PERMISSAO_CRIAR } from '../src/core/rbac/delegacoes';
import { semearDemonstracao } from '../src/seed/demonstracao';
import { limparBanco, prepararBanco } from './ajuda/banco';

const SENHA = 'demonstracao 4med 2026';
let app: FastifyInstance;

beforeAll(async () => {
  await prepararBanco();
  app = await criarApp([manifestoNucleo]);
});
beforeEach(limparBanco);

type Credenciais = { sessao: string; csrf: string };

async function entrar(email: string): Promise<Credenciais> {
  const resp = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, senha: SENHA } });
  return {
    sessao: resp.cookies.find((c) => c.name === 'sessao')?.value ?? '',
    csrf: resp.cookies.find((c) => c.name === 'csrf')?.value ?? '',
  };
}

/** Data no fuso da organização, calculada sem depender do banco (ver delegacoes.test.ts). */
const hoje = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const daquiA = (dias: number) => {
  const [ano, mes, dia] = hoje().split('-').map(Number);
  const base = Date.UTC(ano ?? 0, (mes ?? 1) - 1, dia ?? 1, 12);
  return new Date(base + dias * 86_400_000).toISOString().slice(0, 10);
};

async function idPorEmail(email: string): Promise<string> {
  const [u] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, email));
  if (!u) throw new Error(`usuario ${email} nao semeado`);
  return u.id;
}

/**
 * Concede `core.delegacao.criar` (já existente no catálogo após o seed) ao cargo de
 * quem tem `email`, num papel novo. É assim que o teste dá a um usuário do seed a
 * permissão que nenhum cargo de demonstração carrega — sem tocar no seed.
 */
async function darPermissaoDeDelegar(email: string): Promise<void> {
  const uid = await idPorEmail(email);
  const [v] = await db.select({ cargoId: vinculos.cargoId }).from(vinculos)
    .where(eq(vinculos.usuarioId, uid));
  if (!v) throw new Error('usuario sem vinculo');
  const papel = { id: randomUUID(), nome: `Delegador ${randomUUID()}`, descricao: '' };
  await db.insert(papeis).values(papel);
  await db.insert(papelPermissoes).values({ papelId: papel.id, permissaoChave: PERMISSAO_CRIAR, alcance: 'global' });
  await db.insert(cargoPapeis).values({ cargoId: v.cargoId, papelId: papel.id });
}

describe('rotas de delegacao', () => {
  it('cria, lista com nomes resolvidos e revoga por HTTP', async () => {
    await semearDemonstracao();
    await darPermissaoDeDelegar('diretor@4med.com');
    const analistaId = await idPorEmail('analista@4med.com');
    const cred = await entrar('diretor@4med.com');
    const cabecalhos = { 'x-csrf-token': cred.csrf };
    const cookies = { sessao: cred.sessao, csrf: cred.csrf };

    const vazia = await app.inject({ method: 'GET', url: '/delegacoes', cookies });
    expect(vazia.statusCode).toBe(200);
    expect(vazia.json()).toEqual([]);

    const criada = await app.inject({
      method: 'POST', url: '/delegacoes', cookies, headers: cabecalhos,
      payload: { paraUsuarioId: analistaId, inicio: hoje(), fim: daquiA(7), motivo: 'ferias' },
    });
    expect(criada.statusCode).toBe(200);
    const { id } = criada.json() as { id: string };
    expect(id).toBeTruthy();

    const lista = await app.inject({ method: 'GET', url: '/delegacoes', cookies });
    const corpo = lista.json() as Array<Record<string, unknown>>;
    expect(corpo).toHaveLength(1);
    expect(corpo[0]).toMatchObject({
      id, motivo: 'ferias', papel: 'concedida',
      paraUsuarioNome: 'Ana Ribeiro', deUsuarioNome: 'Dario Alves', revogadaEm: null,
    });

    const revogada = await app.inject({
      method: 'DELETE', url: `/delegacoes/${id}`, cookies, headers: cabecalhos,
    });
    expect(revogada.statusCode).toBe(200);

    const [linha] = await db.select().from(delegacoes).where(eq(delegacoes.id, id));
    expect(linha?.revogadaEm).not.toBeNull();
  });

  it('destinatario ve a delegacao recebida, sem botao de revogar por parte dele', async () => {
    await semearDemonstracao();
    await darPermissaoDeDelegar('diretor@4med.com');
    await darPermissaoDeDelegar('analista@4med.com');
    const analistaId = await idPorEmail('analista@4med.com');

    const credDiretor = await entrar('diretor@4med.com');
    await app.inject({
      method: 'POST', url: '/delegacoes',
      cookies: { sessao: credDiretor.sessao, csrf: credDiretor.csrf },
      headers: { 'x-csrf-token': credDiretor.csrf },
      payload: { paraUsuarioId: analistaId, inicio: hoje(), fim: daquiA(7), motivo: 'ferias' },
    });

    const credAnalista = await entrar('analista@4med.com');
    const lista = await app.inject({
      method: 'GET', url: '/delegacoes',
      cookies: { sessao: credAnalista.sessao, csrf: credAnalista.csrf },
    });
    const corpo = lista.json() as Array<Record<string, unknown>>;
    expect(corpo).toHaveLength(1);
    expect(corpo[0]).toMatchObject({ papel: 'recebida', deUsuarioNome: 'Dario Alves' });
  });

  it('recusa criacao com fim anterior ao inicio (422 delegacao_invalida)', async () => {
    await semearDemonstracao();
    await darPermissaoDeDelegar('diretor@4med.com');
    const analistaId = await idPorEmail('analista@4med.com');
    const cred = await entrar('diretor@4med.com');

    const resp = await app.inject({
      method: 'POST', url: '/delegacoes',
      cookies: { sessao: cred.sessao, csrf: cred.csrf }, headers: { 'x-csrf-token': cred.csrf },
      payload: { paraUsuarioId: analistaId, inicio: daquiA(7), fim: hoje(), motivo: 'invertida' },
    });
    expect(resp.statusCode).toBe(422);
    expect(resp.json()).toMatchObject({ codigo: 'delegacao_invalida' });
  });

  it('revogar id inexistente devolve 404, nunca 403', async () => {
    await semearDemonstracao();
    await darPermissaoDeDelegar('diretor@4med.com');
    const cred = await entrar('diretor@4med.com');

    const resp = await app.inject({
      method: 'DELETE', url: `/delegacoes/${randomUUID()}`,
      cookies: { sessao: cred.sessao, csrf: cred.csrf }, headers: { 'x-csrf-token': cred.csrf },
    });
    expect(resp.statusCode).toBe(404);
    expect(resp.json()).toMatchObject({ codigo: 'nao_encontrado' });
  });
});
