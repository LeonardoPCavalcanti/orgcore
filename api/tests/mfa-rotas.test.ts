import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { authenticator } from 'otplib';
import { limparBanco, prepararBanco } from './ajuda/banco';
import { criarCenarioAcesso } from './ajuda/cenario';
import { criarApp } from '../src/core/app';
import { manifestoNucleo } from '../src/core/manifesto';
import { ativarMfa, prepararMfa } from '../src/core/auth/mfa';
import { gerarHash } from '../src/core/auth/senha';
import { db } from '../src/core/db/client';
import { usuarios } from '../src/core/db/schema/acesso';
import { logAuditoria } from '../src/core/db/schema/auditoria';

const SENHA = 'cadeira azul de madeira 41';
let app: FastifyInstance;

beforeAll(async () => {
  await prepararBanco();
  app = await criarApp([manifestoNucleo]);
});
beforeEach(limparBanco);
afterEach(() => {
  vi.useRealTimers();
});

async function comSenha(usuarioId: string): Promise<void> {
  await db.update(usuarios).set({ senhaHash: await gerarHash(SENHA) }).where(eq(usuarios.id, usuarioId));
}

async function logar(email: string) {
  const resp = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, senha: SENHA } });
  return {
    resp,
    cookie: resp.cookies.find((c) => c.name === 'sessao')?.value ?? '',
    csrf: resp.cookies.find((c) => c.name === 'csrf')?.value ?? '',
  };
}

/** Avanca um passo TOTP simulando so o Date — ver o comentario em mfa.test.ts. */
function avancarPassoTotp(): void {
  const passoMs = authenticator.allOptions().step * 1000;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.now() + passoMs);
}

describe('rotas de cadastro do segundo fator', () => {
  it('preparar sem sessao devolve 401', async () => {
    const resp = await app.inject({ method: 'POST', url: '/auth/mfa/preparar' });
    expect(resp.statusCode).toBe(401);
  });

  it('preparar devolve segredo e uma URI otpauth com o emissor 4med', async () => {
    const c = await criarCenarioAcesso();
    await comSenha(c.diretor.id);
    const { cookie, csrf } = await logar('diretor@4med.com');

    const resp = await app.inject({
      method: 'POST', url: '/auth/mfa/preparar',
      cookies: { sessao: cookie, csrf }, headers: { 'x-csrf-token': csrf },
    });
    expect(resp.statusCode).toBe(200);
    const corpo = resp.json();
    expect(corpo.segredo).toBeTruthy();
    expect(corpo.otpauth).toMatch(/^otpauth:\/\/totp\//);
    expect(corpo.otpauth).toContain('4med');
  });

  it('ciclo completo pela API: preparar, ativar, e o proximo login passa a exigir o desafio', async () => {
    const c = await criarCenarioAcesso();
    await comSenha(c.diretor.id);
    const primeiro = await logar('diretor@4med.com');
    // Sem MFA ainda: entra direto, sessao nao pendente.
    expect(primeiro.resp.json().exigeMfa).toBe(false);

    const prep = await app.inject({
      method: 'POST', url: '/auth/mfa/preparar',
      cookies: { sessao: primeiro.cookie, csrf: primeiro.csrf },
      headers: { 'x-csrf-token': primeiro.csrf },
    });
    const { segredo } = prep.json();

    const ativado = await app.inject({
      method: 'POST', url: '/auth/mfa/ativar',
      cookies: { sessao: primeiro.cookie, csrf: primeiro.csrf },
      headers: { 'x-csrf-token': primeiro.csrf },
      payload: { codigo: authenticator.generate(segredo) },
    });
    expect(ativado.statusCode).toBe(200);
    expect(ativado.json().codigosRecuperacao).toHaveLength(8);

    // A ativacao foi para a trilha, sem nada do codigo digitado.
    const trilha = await db.select().from(logAuditoria).where(eq(logAuditoria.acao, 'mfa.ativado'));
    expect(trilha).toHaveLength(1);
    expect(trilha[0]?.atorId).toBe(c.diretor.id);

    // Proximo login: agora a conta tem MFA, entao nasce pendente.
    const segundo = await logar('diretor@4med.com');
    expect(segundo.resp.json().exigeMfa).toBe(true);
    const preso = await app.inject({ method: 'GET', url: '/auth/eu', cookies: { sessao: segundo.cookie } });
    expect(preso.statusCode).toBe(401);
    expect(preso.json().codigo).toBe('mfa_pendente');

    // Desafio com um TOTP de um passo novo (a ativacao ja reivindicou o passo atual).
    avancarPassoTotp();
    const desafio = await app.inject({
      method: 'POST', url: '/auth/mfa',
      cookies: { sessao: segundo.cookie, csrf: segundo.csrf },
      headers: { 'x-csrf-token': segundo.csrf },
      payload: { codigo: authenticator.generate(segredo) },
    });
    expect(desafio.statusCode).toBe(200);
    const entrou = await app.inject({ method: 'GET', url: '/auth/eu', cookies: { sessao: segundo.cookie } });
    expect(entrou.statusCode).toBe(200);
  });

  it('preparar recusa com 409 quando o MFA ja esta ativo (sessao confirmada)', async () => {
    const c = await criarCenarioAcesso();
    await comSenha(c.diretor.id);
    const { segredo } = await prepararMfa(c.diretor.id);
    const { codigosRecuperacao } = await ativarMfa(c.diretor.id, authenticator.generate(segredo));

    const { cookie, csrf } = await logar('diretor@4med.com');
    // Confirma o desafio (com um codigo de recuperacao) para ter uma sessao NAO
    // pendente — sem isso, o preHandler barra em mfa_pendente antes da guarda 409.
    const conf = await app.inject({
      method: 'POST', url: '/auth/mfa',
      cookies: { sessao: cookie, csrf }, headers: { 'x-csrf-token': csrf },
      payload: { codigo: codigosRecuperacao[0] },
    });
    expect(conf.statusCode).toBe(200);

    const prep = await app.inject({
      method: 'POST', url: '/auth/mfa/preparar',
      cookies: { sessao: cookie, csrf }, headers: { 'x-csrf-token': csrf },
    });
    expect(prep.statusCode).toBe(409);
    expect(prep.json().codigo).toBe('mfa_ja_ativo');
  });

  it('ativar com codigo curto demais devolve 422 entrada_invalida', async () => {
    const c = await criarCenarioAcesso();
    await comSenha(c.diretor.id);
    const { cookie, csrf } = await logar('diretor@4med.com');

    const resp = await app.inject({
      method: 'POST', url: '/auth/mfa/ativar',
      cookies: { sessao: cookie, csrf }, headers: { 'x-csrf-token': csrf },
      payload: { codigo: '12' },
    });
    expect(resp.statusCode).toBe(422);
    expect(resp.json().codigo).toBe('entrada_invalida');
  });

  it('ativar com codigo de formato valido, porem errado, devolve 422 codigo_invalido', async () => {
    const c = await criarCenarioAcesso();
    await comSenha(c.diretor.id);
    const { cookie, csrf } = await logar('diretor@4med.com');
    await app.inject({
      method: 'POST', url: '/auth/mfa/preparar',
      cookies: { sessao: cookie, csrf }, headers: { 'x-csrf-token': csrf },
    });

    const resp = await app.inject({
      method: 'POST', url: '/auth/mfa/ativar',
      cookies: { sessao: cookie, csrf }, headers: { 'x-csrf-token': csrf },
      payload: { codigo: '000000' },
    });
    expect(resp.statusCode).toBe(422);
    expect(resp.json().codigo).toBe('codigo_invalido');
  });

  it('preparar e mutacao: sem o token csrf e recusada', async () => {
    const c = await criarCenarioAcesso();
    await comSenha(c.diretor.id);
    const { cookie, csrf } = await logar('diretor@4med.com');

    const resp = await app.inject({
      method: 'POST', url: '/auth/mfa/preparar', cookies: { sessao: cookie, csrf },
    });
    expect(resp.statusCode).toBe(403);
    expect(resp.json().codigo).toBe('csrf_invalido');
  });
});
