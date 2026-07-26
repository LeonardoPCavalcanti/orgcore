import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { limparBanco, prepararBanco } from './ajuda/banco';
import { criarCenarioAcesso } from './ajuda/cenario';
import { criarApp } from '../src/core/app';
import { manifestoNucleo } from '../src/core/manifesto';
import { gerarHash } from '../src/core/auth/senha';
import { db } from '../src/core/db/client';
import { usuarios } from '../src/core/db/schema/acesso';

const SENHA = 'cadeira azul de madeira 41';
let app: FastifyInstance;

beforeAll(async () => {
  await prepararBanco();
  app = await criarApp([manifestoNucleo]);
});
beforeEach(limparBanco);

async function logar(email: string) {
  const resp = await app.inject({
    method: 'POST', url: '/auth/login', payload: { email, senha: SENHA },
  });
  return { resp, cookie: resp.cookies.find((c) => c.name === 'sessao')?.value ?? '' };
}

describe('rotas de autenticacao', () => {
  it('login com senha correta devolve cookie httpOnly', async () => {
    const c = await criarCenarioAcesso();
    await db.update(usuarios).set({ senhaHash: await gerarHash(SENHA) })
      .where(eq(usuarios.id, c.analista.id));

    const resp = await app.inject({
      method: 'POST', url: '/auth/login',
      payload: { email: 'analista@4med.com', senha: SENHA },
    });

    expect(resp.statusCode).toBe(200);
    const cookie = resp.cookies.find((k) => k.name === 'sessao');
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('Lax');
  });

  it('login com senha errada devolve 401 e nenhum cookie', async () => {
    const c = await criarCenarioAcesso();
    await db.update(usuarios).set({ senhaHash: await gerarHash(SENHA) })
      .where(eq(usuarios.id, c.analista.id));

    const resp = await app.inject({
      method: 'POST', url: '/auth/login',
      payload: { email: 'analista@4med.com', senha: 'errada errada errada' },
    });

    expect(resp.statusCode).toBe(401);
    expect(resp.json().codigo).toBe('credenciais_invalidas');
    expect(resp.cookies).toHaveLength(0);
  });

  it('/auth/eu sem cookie devolve 401', async () => {
    const resp = await app.inject({ method: 'GET', url: '/auth/eu' });
    expect(resp.statusCode).toBe(401);
  });

  it('/auth/eu devolve permissoes e menu do usuario', async () => {
    const c = await criarCenarioAcesso();
    await db.update(usuarios).set({ senhaHash: await gerarHash(SENHA) })
      .where(eq(usuarios.id, c.diretor.id));
    const { cookie } = await logar('diretor@4med.com');

    const resp = await app.inject({
      method: 'GET', url: '/auth/eu', cookies: { sessao: cookie },
    });

    expect(resp.statusCode).toBe(200);
    const corpo = resp.json();
    expect(corpo.nome).toBe('Dario');
    expect(corpo.permissoes['pessoas.colaborador.ler']).toBe('subarvore');
    expect(Array.isArray(corpo.menu)).toBe(true);
  });

  it('menu esconde item cuja permissao o usuario nao tem', async () => {
    const c = await criarCenarioAcesso();
    await db.update(usuarios).set({ senhaHash: await gerarHash(SENHA) })
      .where(eq(usuarios.id, c.analista.id));
    const { cookie } = await logar('analista@4med.com');

    const resp = await app.inject({
      method: 'GET', url: '/auth/eu', cookies: { sessao: cookie },
    });

    const caminhos = resp.json().menu.map((i: { caminho: string }) => i.caminho);
    expect(caminhos).not.toContain('/auditoria');
  });

  it('sair revoga a sessao', async () => {
    const c = await criarCenarioAcesso();
    await db.update(usuarios).set({ senhaHash: await gerarHash(SENHA) })
      .where(eq(usuarios.id, c.analista.id));
    const { cookie } = await logar('analista@4med.com');

    await app.inject({ method: 'POST', url: '/auth/sair', cookies: { sessao: cookie } });
    const depois = await app.inject({
      method: 'GET', url: '/auth/eu', cookies: { sessao: cookie },
    });
    expect(depois.statusCode).toBe(401);
  });
});

describe('boot', () => {
  it('recusa subir com rota sem permissao declarada', async () => {
    const quebrado = {
      nome: 'quebrado', permissoes: [], menu: [],
      rotas: [{ metodo: 'GET' as const, caminho: '/x', permissao: null, handler: async () => ({}) }],
    };
    await expect(criarApp([quebrado])).rejects.toThrow(/sem permissao/i);
  });
});
