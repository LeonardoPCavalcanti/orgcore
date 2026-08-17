import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { criarApp } from '../src/core/app';
import { db } from '../src/core/db/client';
import { usuarios, vinculos } from '../src/core/db/schema/acesso';
import { IDS_CATALOGO } from '../src/core/llm/catalogo';
import { criarClientePadrao } from '../src/core/llm';
import { manifestoAssistente } from '../src/modulos/assistente/manifesto';
import {
  definirRestricao, listarRestricoes, provedoresPermitidosParaUsuario,
} from '../src/modulos/assistente/restricoes-ia';
import { manifestoNucleo } from '../src/core/manifesto';
import { semearDemonstracao } from '../src/seed/demonstracao';
import { limparBanco, prepararBanco } from './ajuda/banco';

const SENHA = 'demonstracao conect2ai 2026';
let app: FastifyInstance;

beforeAll(async () => {
  await prepararBanco();
  app = await criarApp([manifestoNucleo, manifestoAssistente]);
});
beforeEach(limparBanco);

async function idsDe(email: string): Promise<{ usuarioId: string; cargoId: string }> {
  const [u] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, email));
  const [v] = await db.select({ cargoId: vinculos.cargoId }).from(vinculos).where(eq(vinculos.usuarioId, u!.id));
  return { usuarioId: u!.id, cargoId: v!.cargoId };
}
const ordenado = (xs: string[] | null) => (xs === null ? null : [...xs].sort());

describe('resolucao do whitelist por cargo', () => {
  it('cargo sem restricao deixa o usuario sem restricao (null)', async () => {
    await semearDemonstracao();
    const { usuarioId } = await idsDe('aluno@conect2ai.com');
    expect(await provedoresPermitidosParaUsuario(usuarioId)).toBeNull();
  });

  it('cargo restrito limita o usuario a whitelist', async () => {
    await semearDemonstracao();
    const { usuarioId, cargoId } = await idsDe('aluno@conect2ai.com');
    await definirRestricao(cargoId, ['groq', 'gemini']);
    expect(ordenado(await provedoresPermitidosParaUsuario(usuarioId))).toEqual(['gemini', 'groq']);
  });

  it('whitelist com o catalogo inteiro vira sem restricao', async () => {
    await semearDemonstracao();
    const { usuarioId, cargoId } = await idsDe('aluno@conect2ai.com');
    const efetivo = await definirRestricao(cargoId, [...IDS_CATALOGO]);
    expect(efetivo).toEqual([]);
    expect(await listarRestricoes()).toEqual([]);
    expect(await provedoresPermitidosParaUsuario(usuarioId)).toBeNull();
  });

  it('whitelist vazio vira sem restricao', async () => {
    await semearDemonstracao();
    const { usuarioId, cargoId } = await idsDe('aluno@conect2ai.com');
    expect(await definirRestricao(cargoId, [])).toEqual([]);
    expect(await provedoresPermitidosParaUsuario(usuarioId)).toBeNull();
  });

  it('ids fora do catalogo sao ignorados', async () => {
    await semearDemonstracao();
    const { cargoId } = await idsDe('aluno@conect2ai.com');
    expect(await definirRestricao(cargoId, ['groq', 'nao-existe'])).toEqual(['groq']);
  });
});

describe('criarClientePadrao com filtro de provedores', () => {
  it('mantem so os ids permitidos, e null quando nenhum ativo cruza', async () => {
    const orig = { g: process.env.GROQ_API_KEY, c: process.env.CEREBRAS_API_KEY };
    process.env.GROQ_API_KEY = 'chave-teste';
    process.env.CEREBRAS_API_KEY = 'chave-teste';
    try {
      const cliente = criarClientePadrao(['groq']);
      const status = await cliente!.provedores();
      expect(status.map((s) => s.id)).toEqual(['groq']);
      expect(criarClientePadrao(['provedor-inexistente'])).toBeNull();
    } finally {
      if (orig.g === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = orig.g;
      if (orig.c === undefined) delete process.env.CEREBRAS_API_KEY; else process.env.CEREBRAS_API_KEY = orig.c;
    }
  });
});

type Credenciais = { sessao: string; csrf: string };
async function entrar(email: string): Promise<Credenciais> {
  const resp = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, senha: SENHA } });
  return {
    sessao: resp.cookies.find((c) => c.name === 'sessao')?.value ?? '',
    csrf: resp.cookies.find((c) => c.name === 'csrf')?.value ?? '',
  };
}
const cookies = (c: Credenciais) => ({ sessao: c.sessao, csrf: c.csrf });

describe('rotas de restricoes de IA', () => {
  it('admin le o catalogo e o whitelist por cargo', async () => {
    await semearDemonstracao();
    const cred = await entrar('secretaria@conect2ai.com');

    const resp = await app.inject({
      method: 'GET', url: '/assistente/restricoes-ia', cookies: cookies(cred),
    });

    expect(resp.statusCode).toBe(200);
    const corpo = resp.json() as { provedores: { id: string }[]; porCargo: unknown[] };
    expect(corpo.provedores.map((p) => p.id)).toContain('groq');
    expect(corpo.porCargo).toEqual([]);
  });

  it('admin define restricao e a leitura seguinte reflete', async () => {
    await semearDemonstracao();
    const cred = await entrar('secretaria@conect2ai.com');
    const { cargoId } = await idsDe('aluno@conect2ai.com');

    const put = await app.inject({
      method: 'PATCH', url: `/assistente/restricoes-ia/${cargoId}`,
      cookies: cookies(cred), headers: { 'x-csrf-token': cred.csrf },
      payload: { provedores: ['groq', 'gemini'] },
    });
    expect(put.statusCode).toBe(200);
    expect((put.json() as { provedores: string[] }).provedores.sort()).toEqual(['gemini', 'groq']);

    const get = await app.inject({ method: 'GET', url: '/assistente/restricoes-ia', cookies: cookies(cred) });
    const porCargo = (get.json() as { porCargo: { cargoId: string; provedores: string[] }[] }).porCargo;
    expect(porCargo.find((r) => r.cargoId === cargoId)?.provedores.sort()).toEqual(['gemini', 'groq']);
  });

  it('404 para cargo inexistente', async () => {
    await semearDemonstracao();
    const cred = await entrar('secretaria@conect2ai.com');
    const resp = await app.inject({
      method: 'PATCH', url: '/assistente/restricoes-ia/00000000-0000-0000-0000-000000000000',
      cookies: cookies(cred), headers: { 'x-csrf-token': cred.csrf },
      payload: { provedores: ['groq'] },
    });
    expect(resp.statusCode).toBe(404);
  });

  it('barra quem nao administra unidades', async () => {
    await semearDemonstracao();
    const aluno = await entrar('aluno@conect2ai.com');
    const { cargoId } = await idsDe('aluno@conect2ai.com');

    const leitura = await app.inject({ method: 'GET', url: '/assistente/restricoes-ia', cookies: cookies(aluno) });
    expect([403, 404]).toContain(leitura.statusCode);

    const escrita = await app.inject({
      method: 'PATCH', url: `/assistente/restricoes-ia/${cargoId}`,
      cookies: cookies(aluno), headers: { 'x-csrf-token': aluno.csrf }, payload: { provedores: ['groq'] },
    });
    expect([403, 404]).toContain(escrita.statusCode);
  });
});
