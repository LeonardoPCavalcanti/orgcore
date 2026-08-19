import { afterEach, describe, expect, it } from 'vitest';

// Boot do app + um GET a uma rota inexistente: a resposta 404 ainda passa pelo
// hook `onSend`, então os cabeçalhos de segurança devem estar lá — sem precisar
// tocar o banco (o 404 não consulta nada).
async function app() {
  const { criarApp } = await import('../src/core/app');
  const { manifestoNucleo } = await import('../src/core/manifesto');
  return criarApp([manifestoNucleo]);
}

describe('cabecalhos de seguranca', () => {
  const salvo = process.env.NODE_ENV;
  afterEach(() => {
    if (salvo === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = salvo;
  });

  it('carimba os cabecalhos de seguranca em toda resposta', async () => {
    const a = await app();
    const r = await a.inject({ method: 'GET', url: '/rota-inexistente' });
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['x-frame-options']).toBe('DENY');
    expect(r.headers['referrer-policy']).toBe('no-referrer');
    expect(String(r.headers['content-security-policy'])).toContain("default-src 'none'");
    expect(r.headers['request-id']).toBeTruthy();
    await a.close();
  });

  it('nao envia HSTS fora de producao', async () => {
    delete process.env.NODE_ENV;
    const a = await app();
    const r = await a.inject({ method: 'GET', url: '/rota-inexistente' });
    expect(r.headers['strict-transport-security']).toBeUndefined();
    await a.close();
  });
});
