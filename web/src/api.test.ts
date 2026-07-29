import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from './api';

describe('apiFetch', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.cookie = 'csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });

  function espionarFetch() {
    const fetchMock = vi.fn(
      (_entrada: RequestInfo | URL, _init?: RequestInit) =>
        Promise.resolve(new Response('{}', { status: 200 })),
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  const cabecalhosDe = (fetchMock: ReturnType<typeof espionarFetch>) =>
    (fetchMock.mock.calls[0]?.[1]?.headers ?? {}) as Record<string, string>;

  it('ecoa o cookie csrf no cabecalho x-csrf-token nas mutacoes', async () => {
    // Sem isto, POST /auth/sair e DELETE /auth/sessoes/:id levam 403 no servidor
    // (dupla submissao), e o "sair" deixaria a sessao viva no backend.
    document.cookie = 'csrf=abc123';
    const fetchMock = espionarFetch();

    await apiFetch('/auth/sair', { method: 'POST' });

    expect(cabecalhosDe(fetchMock)['x-csrf-token']).toBe('abc123');
  });

  it('nao manda x-csrf-token em requisicao de leitura', async () => {
    document.cookie = 'csrf=abc123';
    const fetchMock = espionarFetch();

    await apiFetch('/auth/eu');

    expect(cabecalhosDe(fetchMock)['x-csrf-token']).toBeUndefined();
  });

  it('nao inventa token quando o cookie csrf nao existe', async () => {
    const fetchMock = espionarFetch();

    await apiFetch('/auth/sair', { method: 'POST' });

    expect(cabecalhosDe(fetchMock)['x-csrf-token']).toBeUndefined();
  });

  it('nao manda content-type numa mutacao sem corpo', async () => {
    // Com o cabeçalho, o Fastify tenta parsear um corpo vazio e responde 500.
    const fetchMock = espionarFetch();

    await apiFetch('/auth/sair', { method: 'POST' });

    expect(cabecalhosDe(fetchMock)['content-type']).toBeUndefined();
  });

  it('manda content-type quando ha corpo', async () => {
    const fetchMock = espionarFetch();

    await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'a@b.c' }) });

    expect(cabecalhosDe(fetchMock)['content-type']).toBe('application/json');
  });
});
