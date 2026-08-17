import type { FastifyInstance } from 'fastify';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { criarApp } from '../src/core/app';
import { manifestoNucleo } from '../src/core/manifesto';
import { semearDemonstracao } from '../src/seed/demonstracao';
import { limparBanco, prepararBanco } from './ajuda/banco';

const SENHA = 'demonstracao conect2ai 2026';
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
    const cred = await entrar('secretaria@conect2ai.com');
    const unidades = await listarUnidades(cred);
    const empresa = unidades.find((u) => u.nome === 'Conect2AI')!;
    const social = unidades.find((u) => u.nome === 'Social Media')!;

    const resp = await mover(cred, social.id, empresa.id);

    expect(resp.statusCode).toBe(200);
    expect((resp.json() as UnidadeResp).paiId).toBe(empresa.id);
  });

  it('recusa com 422 mover uma unidade para dentro da propria subarvore', async () => {
    await semearDemonstracao();
    const cred = await entrar('secretaria@conect2ai.com');
    const unidades = await listarUnidades(cred);
    const empresa = unidades.find((u) => u.nome === 'Conect2AI')!;
    const social = unidades.find((u) => u.nome === 'Social Media')!;

    const resp = await mover(cred, empresa.id, social.id);

    expect(resp.statusCode).toBe(422);
    expect((resp.json() as { codigo: string }).codigo).toBe('movimento_invalido');
  });

  it('devolve 404 ao mover unidade inexistente', async () => {
    await semearDemonstracao();
    const cred = await entrar('secretaria@conect2ai.com');

    const resp = await mover(cred, 999999, null);

    expect(resp.statusCode).toBe(404);
  });

  it('devolve 404 para id nao numerico', async () => {
    await semearDemonstracao();
    const cred = await entrar('secretaria@conect2ai.com');

    const resp = await mover(cred, 'abc', null);

    expect(resp.statusCode).toBe(404);
  });
});

type PessoaResp = {
  vinculoId: string; usuarioId: string; nome: string; email: string;
  unidadeId: number; cargoId: string; cargoNome: string; principal: boolean;
};
type CargoResp = { id: string; nome: string; nivel: number };

const comCookies = (cred: Credenciais) => ({ sessao: cred.sessao, csrf: cred.csrf });

async function listarPessoas(cred: Credenciais) {
  return app.inject({ method: 'GET', url: '/organograma/pessoas', cookies: comCookies(cred) });
}
async function listarCargos(cred: Credenciais) {
  return app.inject({ method: 'GET', url: '/organograma/cargos', cookies: comCookies(cred) });
}
function alterarCargo(cred: Credenciais, vinculoId: string, cargoId: string) {
  return app.inject({
    method: 'PATCH', url: `/organograma/vinculos/${vinculoId}`,
    cookies: comCookies(cred), headers: { 'x-csrf-token': cred.csrf },
    payload: { cargoId },
  });
}

describe('cargos pelo organograma', () => {
  it('rh lista as pessoas com vinculo vigente do seu escopo', async () => {
    await semearDemonstracao();
    const cred = await entrar('secretaria@conect2ai.com');

    const resp = await listarPessoas(cred);

    expect(resp.statusCode).toBe(200);
    const pessoas = resp.json() as PessoaResp[];
    expect(pessoas.map((p) => p.email)).toContain('aluno@conect2ai.com');
    expect(pessoas.every((p) => p.vinculoId && p.cargoNome)).toBe(true);
  });

  it('rh troca o cargo de uma pessoa e a leitura seguinte reflete a mudanca', async () => {
    await semearDemonstracao();
    const cred = await entrar('secretaria@conect2ai.com');
    const pessoas = (await listarPessoas(cred)).json() as PessoaResp[];
    const cargos = (await listarCargos(cred)).json() as CargoResp[];
    const aluno = pessoas.find((p) => p.email === 'aluno@conect2ai.com')!;
    const supervisor = cargos.find((c) => c.nome === 'Supervisor')!;

    const resp = await alterarCargo(cred, aluno.vinculoId, supervisor.id);

    expect(resp.statusCode).toBe(200);
    expect((resp.json() as { cargoId: string }).cargoId).toBe(supervisor.id);

    const depois = (await listarPessoas(cred)).json() as PessoaResp[];
    expect(depois.find((p) => p.vinculoId === aluno.vinculoId)?.cargoNome).toBe('Supervisor');
  });

  it('recusa 422 quando o cargo nao existe', async () => {
    await semearDemonstracao();
    const cred = await entrar('secretaria@conect2ai.com');
    const aluno = ((await listarPessoas(cred)).json() as PessoaResp[])
      .find((p) => p.email === 'aluno@conect2ai.com')!;

    const resp = await alterarCargo(cred, aluno.vinculoId, '00000000-0000-0000-0000-000000000000');

    expect(resp.statusCode).toBe(422);
    expect((resp.json() as { codigo: string }).codigo).toBe('cargo_invalido');
  });

  it('devolve 404 para vinculo inexistente', async () => {
    await semearDemonstracao();
    const cred = await entrar('secretaria@conect2ai.com');
    const cargo = ((await listarCargos(cred)).json() as CargoResp[])[0]!;

    const resp = await alterarCargo(cred, '00000000-0000-0000-0000-000000000000', cargo.id);

    expect(resp.statusCode).toBe(404);
  });

  it('devolve 404 para id de vinculo malformado', async () => {
    await semearDemonstracao();
    const cred = await entrar('secretaria@conect2ai.com');
    const cargo = ((await listarCargos(cred)).json() as CargoResp[])[0]!;

    const resp = await alterarCargo(cred, 'nao-e-uuid', cargo.id);

    expect(resp.statusCode).toBe(404);
  });

  it('barra quem nao administra unidades (aluno)', async () => {
    await semearDemonstracao();
    const admin = await entrar('secretaria@conect2ai.com');
    const aluno = await entrar('aluno@conect2ai.com');
    const alvo = ((await listarPessoas(admin)).json() as PessoaResp[])
      .find((p) => p.email === 'aluno@conect2ai.com')!;
    const cargo = ((await listarCargos(admin)).json() as CargoResp[])[0]!;

    expect([403, 404]).toContain((await listarPessoas(aluno)).statusCode);
    expect([403, 404]).toContain((await alterarCargo(aluno, alvo.vinculoId, cargo.id)).statusCode);
  });
});

describe('GET /auth/cargos', () => {
  it('lista os cargos para quem administra convites', async () => {
    await semearDemonstracao();
    const cred = await entrar('secretaria@conect2ai.com');

    const resp = await app.inject({
      method: 'GET', url: '/auth/cargos', cookies: { sessao: cred.sessao, csrf: cred.csrf },
    });

    expect(resp.statusCode).toBe(200);
    const cargos = resp.json() as { id: string; nome: string }[];
    expect(cargos.length).toBeGreaterThanOrEqual(4);
    expect(cargos.map((c) => c.nome)).toContain('Secretaria');
  });

  it('barra quem nao administra convites', async () => {
    await semearDemonstracao();
    const cred = await entrar('aluno@conect2ai.com');

    const resp = await app.inject({
      method: 'GET', url: '/auth/cargos', cookies: { sessao: cred.sessao, csrf: cred.csrf },
    });

    expect([403, 404]).toContain(resp.statusCode);
  });
});
