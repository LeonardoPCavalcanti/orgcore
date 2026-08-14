import type { FastifyInstance } from 'fastify';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { criarApp } from '../src/core/app';
import { manifestoNucleo } from '../src/core/manifesto';
import { manifestoAssistente } from '../src/modulos/assistente/manifesto';
import { manifestoConteudo } from '../src/modulos/conteudo/manifesto';
import { semearDemonstracao } from '../src/seed/demonstracao';
import { limparBanco, prepararBanco } from './ajuda/banco';

const SENHA = 'demonstracao conect2ai 2026';
let app: FastifyInstance;

beforeAll(async () => {
  await prepararBanco();
  app = await criarApp([manifestoNucleo, manifestoConteudo, manifestoAssistente]);
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
const comCsrf = (c: Credenciais) => ({ cookies: { sessao: c.sessao, csrf: c.csrf }, headers: { 'x-csrf-token': c.csrf } });

describe('rotas do assistente', () => {
  it('cria e lista conversas do dono', async () => {
    await semearDemonstracao();
    const cred = await entrar('admin@conect2ai.com');

    const criada = await app.inject({ method: 'POST', url: '/assistente/conversas', ...comCsrf(cred) });
    expect(criada.statusCode).toBe(200);
    const conv = criada.json() as { id: string; titulo: string };
    expect(conv.id).toBeTruthy();

    const lista = await app.inject({ method: 'GET', url: '/assistente/conversas', cookies: comCsrf(cred).cookies });
    expect(lista.json()).toHaveLength(1);
  });

  it('provedores responde a qualquer usuario logado (sem permissao de anuncio)', async () => {
    await semearDemonstracao();
    // 'aluno' não tem a permissão de anúncio, mas deve acessar o chat.
    const cred = await entrar('aluno@conect2ai.com');
    const resp = await app.inject({ method: 'GET', url: '/assistente/provedores', cookies: comCsrf(cred).cookies });
    expect(resp.statusCode).toBe(200);
    expect(Array.isArray(resp.json())).toBe(true);
  });

  it('mensagem sem provedor de IA configurado responde 503', async () => {
    await semearDemonstracao();
    const cred = await entrar('admin@conect2ai.com');
    const conv = (await app.inject({ method: 'POST', url: '/assistente/conversas', ...comCsrf(cred) })).json() as { id: string };
    const msg = await app.inject({
      method: 'POST', url: `/assistente/conversas/${conv.id}/mensagens`, ...comCsrf(cred),
      payload: { conteudo: 'oi' },
    });
    expect(msg.statusCode).toBe(503);
  });

  it('conversa de outro usuario nao abre (404)', async () => {
    await semearDemonstracao();
    const a = await entrar('admin@conect2ai.com');
    const b = await entrar('aluno@conect2ai.com');
    const conv = (await app.inject({ method: 'POST', url: '/assistente/conversas', ...comCsrf(a) })).json() as { id: string };
    const resp = await app.inject({ method: 'GET', url: `/assistente/conversas/${conv.id}`, cookies: comCsrf(b).cookies });
    expect(resp.statusCode).toBe(404);
  });
});
