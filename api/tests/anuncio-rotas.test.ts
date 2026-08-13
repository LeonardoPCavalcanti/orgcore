import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { criarApp } from '../src/core/app';
import { db } from '../src/core/db/client';
import { logAuditoria } from '../src/core/db/schema/auditoria';
import { manifestoNucleo } from '../src/core/manifesto';
import { manifestoConteudo } from '../src/modulos/conteudo/manifesto';
import { semearDemonstracao } from '../src/seed/demonstracao';
import { limparBanco, prepararBanco } from './ajuda/banco';

const SENHA = 'demonstracao 4med 2026';
const ASSINATURA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const PX = `data:image/png;base64,${
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
}`;
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

const comCsrf = (cred: Credenciais) => ({
  cookies: { sessao: cred.sessao, csrf: cred.csrf },
  headers: { 'x-csrf-token': cred.csrf },
});

type RespAnuncio = { id: string; imagemUrl: string; pessoas: { id: string; fotoUrl: string | null }[] };

function gerar(cred: Credenciais, over: Record<string, unknown> = {}) {
  return app.inject({
    method: 'POST', url: '/conteudo/anuncios', ...comCsrf(cred),
    payload: {
      tipo: 'artigo_aprovado',
      titulo: 'Assistente Inteligente baseado em LLM',
      pessoas: [{ nome: 'Júlia Didra', papel: 'Autora', foto: PX }],
      ...over,
    },
  });
}

describe('rotas de anuncio', () => {
  it('gera, audita, lista, abre, serve imagem/foto e apaga (fluxo do dono)', async () => {
    await semearDemonstracao();
    const cred = await entrar('analista@4med.com');

    const criada = await gerar(cred);
    expect(criada.statusCode).toBe(201);
    const anuncio = criada.json() as RespAnuncio;
    expect(anuncio.pessoas).toHaveLength(1);
    expect(anuncio.pessoas[0]!.fotoUrl).toBeTruthy();

    const auditada = await db.select().from(logAuditoria).where(eq(logAuditoria.acao, 'conteudo.anuncio.criado'));
    expect(auditada).toHaveLength(1);

    const lista = await app.inject({ method: 'GET', url: '/conteudo/anuncios', cookies: comCsrf(cred).cookies });
    expect(lista.json()).toHaveLength(1);

    const detalhe = await app.inject({ method: 'GET', url: `/conteudo/anuncios/${anuncio.id}`, cookies: comCsrf(cred).cookies });
    expect(detalhe.statusCode).toBe(200);

    const imagem = await app.inject({ method: 'GET', url: anuncio.imagemUrl, cookies: comCsrf(cred).cookies });
    expect(imagem.statusCode).toBe(200);
    expect(imagem.headers['content-type']).toContain('image/png');
    expect(imagem.rawPayload.subarray(0, 4).equals(ASSINATURA_PNG)).toBe(true);

    const foto = await app.inject({ method: 'GET', url: anuncio.pessoas[0]!.fotoUrl!, cookies: comCsrf(cred).cookies });
    expect(foto.statusCode).toBe(200);
    expect(foto.rawPayload.subarray(0, 4).equals(ASSINATURA_PNG)).toBe(true);

    const apagada = await app.inject({ method: 'DELETE', url: `/conteudo/anuncios/${anuncio.id}`, ...comCsrf(cred) });
    expect(apagada.statusCode).toBe(200);
    const depois = await app.inject({ method: 'GET', url: `/conteudo/anuncios/${anuncio.id}`, cookies: comCsrf(cred).cookies });
    expect(depois.statusCode).toBe(404);
  }, 30_000);

  it('anuncio de outro autor responde 404 (ver, imagem, foto e apagar)', async () => {
    await semearDemonstracao();
    const ana = await entrar('analista@4med.com');
    const caio = await entrar('coordenador@4med.com');
    const anuncio = (await gerar(ana)).json() as RespAnuncio;

    const ver = await app.inject({ method: 'GET', url: `/conteudo/anuncios/${anuncio.id}`, cookies: comCsrf(caio).cookies });
    expect(ver.statusCode).toBe(404);
    const img = await app.inject({ method: 'GET', url: anuncio.imagemUrl, cookies: comCsrf(caio).cookies });
    expect(img.statusCode).toBe(404);
    const foto = await app.inject({ method: 'GET', url: anuncio.pessoas[0]!.fotoUrl!, cookies: comCsrf(caio).cookies });
    expect(foto.statusCode).toBe(404);
    const apagar = await app.inject({ method: 'DELETE', url: `/conteudo/anuncios/${anuncio.id}`, ...comCsrf(caio) });
    expect(apagar.statusCode).toBe(404);
  }, 30_000);

  it('registra feedback do dono e audita; de outro autor da 404', async () => {
    await semearDemonstracao();
    const ana = await entrar('analista@4med.com');
    const caio = await entrar('coordenador@4med.com');
    const anuncio = (await gerar(ana)).json() as RespAnuncio;

    const ok = await app.inject({
      method: 'PATCH', url: `/conteudo/anuncios/${anuncio.id}/feedback`, ...comCsrf(ana),
      payload: { avaliacao: 'aprovado', nota: 5 },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ avaliacao: 'aprovado', nota: 5, anuncioId: anuncio.id });

    const auditada = await db.select().from(logAuditoria).where(eq(logAuditoria.acao, 'conteudo.anuncio.avaliado'));
    expect(auditada).toHaveLength(1);

    const alheio = await app.inject({
      method: 'PATCH', url: `/conteudo/anuncios/${anuncio.id}/feedback`, ...comCsrf(caio),
      payload: { avaliacao: 'reprovado' },
    });
    expect(alheio.statusCode).toBe(404);
  }, 30_000);

  it('exporta o corpus JSONL do proprio autor (sem vazar de outro)', async () => {
    await semearDemonstracao();
    const ana = await entrar('analista@4med.com');
    const caio = await entrar('coordenador@4med.com');
    await gerar(ana, { veiculo: 'CBIS 2026' });
    await gerar(caio); // ruído

    const resp = await app.inject({ method: 'GET', url: '/conteudo/anuncios/corpus.jsonl', cookies: comCsrf(ana).cookies });
    expect(resp.statusCode).toBe(200);
    expect(resp.headers['content-type']).toContain('ndjson');
    const linhas = resp.body.trim().split('\n');
    expect(linhas).toHaveLength(1);
    const item = JSON.parse(linhas[0]!);
    expect(item.entrada.veiculo).toBe('CBIS 2026');
    expect(item.modelo).toBe('fake');
  }, 30_000);

  it('exporta datasets de treino SFT e KTO nas rotas dedicadas', async () => {
    await semearDemonstracao();
    const ana = await entrar('analista@4med.com');
    const anuncio = (await gerar(ana)).json() as RespAnuncio;
    await app.inject({
      method: 'PATCH', url: `/conteudo/anuncios/${anuncio.id}/feedback`, ...comCsrf(ana),
      payload: { avaliacao: 'aprovado' },
    });

    const sft = await app.inject({ method: 'GET', url: '/conteudo/anuncios/treino/sft.jsonl', cookies: comCsrf(ana).cookies });
    expect(sft.statusCode).toBe(200);
    expect(sft.headers['content-type']).toContain('ndjson');
    expect(JSON.parse(sft.body.trim()).messages).toBeTruthy();

    const kto = await app.inject({ method: 'GET', url: '/conteudo/anuncios/treino/kto.jsonl', cookies: comCsrf(ana).cookies });
    expect(kto.statusCode).toBe(200);
    expect(JSON.parse(kto.body.trim())).toMatchObject({ label: true });
  }, 30_000);

  it('quem nao tem a permissao e barrado no portao (403)', async () => {
    await semearDemonstracao();
    const rh = await entrar('rh@4med.com');
    const resp = await gerar(rh);
    expect(resp.statusCode).toBe(403);
    expect(resp.json()).toMatchObject({ codigo: 'sem_permissao' });
  });

  it('mutacao sem token CSRF e recusada (403 csrf_invalido)', async () => {
    await semearDemonstracao();
    const cred = await entrar('analista@4med.com');
    const resp = await app.inject({
      method: 'POST', url: '/conteudo/anuncios',
      cookies: { sessao: cred.sessao, csrf: cred.csrf },
      payload: { tipo: 'defesa', titulo: 'sem csrf aqui', pessoas: [] },
    });
    expect(resp.statusCode).toBe(403);
    expect(resp.json()).toMatchObject({ codigo: 'csrf_invalido' });
  });

  it('404 para id inexistente do proprio usuario', async () => {
    await semearDemonstracao();
    const cred = await entrar('analista@4med.com');
    const resp = await app.inject({ method: 'GET', url: `/conteudo/anuncios/${randomUUID()}`, cookies: comCsrf(cred).cookies });
    expect(resp.statusCode).toBe(404);
  });

  it('id nao-UUID vira 404, nunca erro cru', async () => {
    await semearDemonstracao();
    const cred = await entrar('analista@4med.com');
    const resp = await app.inject({ method: 'GET', url: '/conteudo/anuncios/nao-e-uuid', cookies: comCsrf(cred).cookies });
    expect(resp.statusCode).toBe(404);
  });

  it('sem pessoas ainda gera (variante so titulo)', async () => {
    await semearDemonstracao();
    const cred = await entrar('analista@4med.com');
    const resp = await gerar(cred, { tipo: 'aprovados', titulo: 'Candidatos aprovados 2026.2', pessoas: [] });
    expect(resp.statusCode).toBe(201);
    expect((resp.json() as RespAnuncio).pessoas).toHaveLength(0);
  }, 30_000);
});
