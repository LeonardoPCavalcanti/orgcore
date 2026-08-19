import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { excedeu, limparBaldes } from '../src/core/rate-limit';

describe('excedeu (janela fixa)', () => {
  beforeEach(limparBaldes);

  it('limite <= 0 nunca estoura (desligado)', () => {
    for (let i = 0; i < 100; i += 1) expect(excedeu('k', 0, 1000, 0)).toBe(false);
  });

  it('estoura ao ultrapassar o limite dentro da janela', () => {
    expect(excedeu('ip', 2, 1000, 0)).toBe(false); // 1
    expect(excedeu('ip', 2, 1000, 0)).toBe(false); // 2
    expect(excedeu('ip', 2, 1000, 0)).toBe(true); // 3 > 2
  });

  it('reinicia quando a janela expira', () => {
    expect(excedeu('ip', 1, 1000, 0)).toBe(false); // 1
    expect(excedeu('ip', 1, 1000, 500)).toBe(true); // 2 na mesma janela
    expect(excedeu('ip', 1, 1000, 1000)).toBe(false); // nova janela
  });

  it('chaves distintas nao se misturam', () => {
    expect(excedeu('a', 1, 1000, 0)).toBe(false);
    expect(excedeu('b', 1, 1000, 0)).toBe(false);
    expect(excedeu('a', 1, 1000, 0)).toBe(true);
  });
});

describe('rate limit no login via HTTP', () => {
  const salvo = process.env.RATE_LIMIT_LOGIN_POR_MIN;
  afterEach(() => {
    if (salvo === undefined) delete process.env.RATE_LIMIT_LOGIN_POR_MIN;
    else process.env.RATE_LIMIT_LOGIN_POR_MIN = salvo;
    limparBaldes();
  });

  it('barra o login apos o teto por IP (mesmo com credenciais erradas)', async () => {
    // Import tardio para o app existir; prepararBanco/criarApp são caros, então o
    // teste do comportamento HTTP é único e enxuto — a lógica fina fica na unidade.
    const { criarApp } = await import('../src/core/app');
    const { manifestoNucleo } = await import('../src/core/manifesto');
    const { prepararBanco } = await import('./ajuda/banco');
    await prepararBanco();
    const app = await criarApp([manifestoNucleo]);

    process.env.RATE_LIMIT_LOGIN_POR_MIN = '2';
    limparBaldes();
    const bater = () => app.inject({
      method: 'POST', url: '/auth/login', payload: { email: 'x@y.com', senha: 'errada' },
    });

    const s1 = (await bater()).statusCode; // 1 — credencial inválida, mas passou do limiter
    const s2 = (await bater()).statusCode; // 2
    const s3 = await bater(); // 3 > 2 -> rate limit

    expect(s1).not.toBe(429);
    expect(s2).not.toBe(429);
    expect(s3.statusCode).toBe(429);
    expect((s3.json() as { codigo: string }).codigo).toBe('muitas_requisicoes');

    await app.close();
  }, 30_000);
});
