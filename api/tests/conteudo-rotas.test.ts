import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { criarApp } from '../src/core/app';
import { db } from '../src/core/db/client';
import { cargoPapeis, papeis, papelPermissoes, usuarios, vinculos } from '../src/core/db/schema/acesso';
import { logAuditoria } from '../src/core/db/schema/auditoria';
import { manifestoNucleo } from '../src/core/manifesto';
import { manifestoConteudo } from '../src/modulos/conteudo/manifesto';
import { PERMISSAO_CRIAR } from '../src/modulos/conteudo/rotas';
import { semearDemonstracao } from '../src/seed/demonstracao';
import { limparBanco, prepararBanco } from './ajuda/banco';

const SENHA = 'demonstracao conect2ai 2026';
const ASSINATURA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
let app: FastifyInstance;

beforeAll(async () => {
  await prepararBanco();
  app = await criarApp([manifestoNucleo, manifestoConteudo]);
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

async function idPorEmail(email: string): Promise<string> {
  const [u] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, email));
  if (!u) throw new Error(`usuario ${email} nao semeado`);
  return u.id;
}

/** Concede `conteudo.carrossel.criar` (alcance proprio) ao cargo de quem tem `email`. */
async function darPermissaoDeConteudo(email: string): Promise<void> {
  const uid = await idPorEmail(email);
  const [v] = await db.select({ cargoId: vinculos.cargoId }).from(vinculos).where(eq(vinculos.usuarioId, uid));
  if (!v) throw new Error('usuario sem vinculo');
  const papel = { id: randomUUID(), nome: `Conteudo ${randomUUID()}`, descricao: '' };
  await db.insert(papeis).values(papel);
  await db.insert(papelPermissoes).values({ papelId: papel.id, permissaoChave: PERMISSAO_CRIAR, alcance: 'proprio' });
  await db.insert(cargoPapeis).values({ cargoId: v.cargoId, papelId: papel.id });
}

const comCsrf = (cred: Credenciais) => ({
  cookies: { sessao: cred.sessao, csrf: cred.csrf },
  headers: { 'x-csrf-token': cred.csrf },
});

async function gerar(cred: Credenciais, tema = 'Edge AI em veiculos') {
  const resp = await app.inject({
    method: 'POST', url: '/conteudo/carrosseis', ...comCsrf(cred),
    payload: { tema, quantidadeSlides: 4 },
  });
  return resp;
}

describe('rotas de conteudo', () => {
  it('gera, lista, abre, serve a imagem e apaga (fluxo do dono)', async () => {
    await semearDemonstracao();
    await darPermissaoDeConteudo('aluno@conect2ai.com');
    const cred = await entrar('aluno@conect2ai.com');

    const criada = await gerar(cred, 'Telemetria veicular');
    expect(criada.statusCode).toBe(201);
    const carrossel = criada.json() as { id: string; slides: { id: string; imagemUrl: string }[] };
    expect(carrossel.slides).toHaveLength(4);

    const auditada = await db.select().from(logAuditoria).where(eq(logAuditoria.acao, 'conteudo.carrossel.criado'));
    expect(auditada).toHaveLength(1);

    const lista = await app.inject({ method: 'GET', url: '/conteudo/carrosseis', cookies: comCsrf(cred).cookies });
    expect(lista.json()).toHaveLength(1);

    const detalhe = await app.inject({ method: 'GET', url: `/conteudo/carrosseis/${carrossel.id}`, cookies: comCsrf(cred).cookies });
    expect(detalhe.statusCode).toBe(200);

    const imagem = await app.inject({ method: 'GET', url: carrossel.slides[0]!.imagemUrl, cookies: comCsrf(cred).cookies });
    expect(imagem.statusCode).toBe(200);
    expect(imagem.headers['content-type']).toContain('image/png');
    expect(imagem.rawPayload.subarray(0, 4).equals(ASSINATURA_PNG)).toBe(true);

    const apagada = await app.inject({ method: 'DELETE', url: `/conteudo/carrosseis/${carrossel.id}`, ...comCsrf(cred) });
    expect(apagada.statusCode).toBe(200);
    const depois = await app.inject({ method: 'GET', url: `/conteudo/carrosseis/${carrossel.id}`, cookies: comCsrf(cred).cookies });
    expect(depois.statusCode).toBe(404);
  }, 30_000);

  it('carrossel de outro autor responde 404 (ver, imagem e apagar)', async () => {
    await semearDemonstracao();
    await darPermissaoDeConteudo('aluno@conect2ai.com');
    await darPermissaoDeConteudo('supervisor@conect2ai.com');
    const ana = await entrar('aluno@conect2ai.com');
    const caio = await entrar('supervisor@conect2ai.com');

    const carrossel = (await gerar(ana)).json() as { id: string; slides: { id: string; imagemUrl: string }[] };

    const verAlheio = await app.inject({ method: 'GET', url: `/conteudo/carrosseis/${carrossel.id}`, cookies: comCsrf(caio).cookies });
    expect(verAlheio.statusCode).toBe(404);
    expect(verAlheio.json()).toMatchObject({ codigo: 'nao_encontrado' });

    const imgAlheia = await app.inject({ method: 'GET', url: carrossel.slides[0]!.imagemUrl, cookies: comCsrf(caio).cookies });
    expect(imgAlheia.statusCode).toBe(404);

    const apagarAlheio = await app.inject({ method: 'DELETE', url: `/conteudo/carrosseis/${carrossel.id}`, ...comCsrf(caio) });
    expect(apagarAlheio.statusCode).toBe(404);
  }, 30_000);

  it('quem nao tem a permissao e barrado no portao (403)', async () => {
    await semearDemonstracao();
    const semGrant = await entrar('secretaria@conect2ai.com');
    const resp = await gerar(semGrant);
    expect(resp.statusCode).toBe(403);
    expect(resp.json()).toMatchObject({ codigo: 'sem_permissao' });
  });

  it('mutacao sem token CSRF e recusada (403 csrf_invalido)', async () => {
    await semearDemonstracao();
    await darPermissaoDeConteudo('aluno@conect2ai.com');
    const cred = await entrar('aluno@conect2ai.com');
    const resp = await app.inject({
      method: 'POST', url: '/conteudo/carrosseis',
      cookies: { sessao: cred.sessao, csrf: cred.csrf },
      payload: { tema: 'sem csrf', quantidadeSlides: 3 },
    });
    expect(resp.statusCode).toBe(403);
    expect(resp.json()).toMatchObject({ codigo: 'csrf_invalido' });
  });

  it('404, nunca 403, para id inexistente do proprio usuario', async () => {
    await semearDemonstracao();
    await darPermissaoDeConteudo('aluno@conect2ai.com');
    const cred = await entrar('aluno@conect2ai.com');
    const resp = await app.inject({ method: 'GET', url: `/conteudo/carrosseis/${randomUUID()}`, cookies: comCsrf(cred).cookies });
    expect(resp.statusCode).toBe(404);
  });
});
