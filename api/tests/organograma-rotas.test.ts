import type { FastifyInstance } from 'fastify';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { criarApp } from '../src/core/app';
import { manifestoNucleo } from '../src/core/manifesto';
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
  const resp = await app.inject({
    method: 'POST', url: '/auth/login', payload: { email, senha: SENHA },
  });
  return {
    sessao: resp.cookies.find((c) => c.name === 'sessao')?.value ?? '',
    csrf: resp.cookies.find((c) => c.name === 'csrf')?.value ?? '',
  };
}

type UnidadeResp = { id: number; paiId: number | null; nome: string };

async function listarUnidades(cred: Credenciais): Promise<UnidadeResp[]> {
  const resp = await app.inject({
    method: 'GET', url: '/organograma', cookies: { sessao: cred.sessao, csrf: cred.csrf },
  });
  return resp.json() as UnidadeResp[];
}

function mover(cred: Credenciais, id: number | string, paiId: number | null) {
  return app.inject({
    method: 'PATCH', url: `/organograma/${id}`,
    cookies: { sessao: cred.sessao, csrf: cred.csrf },
    headers: { 'x-csrf-token': cred.csrf },
    payload: { paiId },
  });
}

describe('PATCH /organograma/:id', () => {
  it('rh move uma unidade para outro pai', async () => {
    await semearDemonstracao();
    const cred = await entrar('rh@4med.com');
    const unidades = await listarUnidades(cred);
    const empresa = unidades.find((u) => u.nome === 'Conect2AI')!;
    const social = unidades.find((u) => u.nome === 'Social Media')!;

    const resp = await mover(cred, social.id, empresa.id);

    expect(resp.statusCode).toBe(200);
    expect((resp.json() as UnidadeResp).paiId).toBe(empresa.id);
  });

  it('recusa com 422 mover uma unidade para dentro da propria subarvore', async () => {
    await semearDemonstracao();
    const cred = await entrar('rh@4med.com');
    const unidades = await listarUnidades(cred);
    const empresa = unidades.find((u) => u.nome === 'Conect2AI')!;
    const social = unidades.find((u) => u.nome === 'Social Media')!;

    const resp = await mover(cred, empresa.id, social.id);

    expect(resp.statusCode).toBe(422);
    expect((resp.json() as { codigo: string }).codigo).toBe('movimento_invalido');
  });

  it('devolve 404 ao mover unidade inexistente', async () => {
    await semearDemonstracao();
    const cred = await entrar('rh@4med.com');

    const resp = await mover(cred, 999999, null);

    expect(resp.statusCode).toBe(404);
  });

  it('devolve 404 para id nao numerico', async () => {
    await semearDemonstracao();
    const cred = await entrar('rh@4med.com');

    const resp = await mover(cred, 'abc', null);

    expect(resp.statusCode).toBe(404);
  });
});

describe('GET /auth/cargos', () => {
  it('lista os cargos para quem administra convites', async () => {
    await semearDemonstracao();
    const cred = await entrar('rh@4med.com');

    const resp = await app.inject({
      method: 'GET', url: '/auth/cargos', cookies: { sessao: cred.sessao, csrf: cred.csrf },
    });

    expect(resp.statusCode).toBe(200);
    const cargos = resp.json() as { id: string; nome: string }[];
    expect(cargos.length).toBeGreaterThanOrEqual(4);
    expect(cargos.map((c) => c.nome)).toContain('Analista de RH');
  });

  it('barra quem nao administra convites', async () => {
    await semearDemonstracao();
    const cred = await entrar('analista@4med.com');

    const resp = await app.inject({
      method: 'GET', url: '/auth/cargos', cookies: { sessao: cred.sessao, csrf: cred.csrf },
    });

    expect([403, 404]).toContain(resp.statusCode);
  });
});
