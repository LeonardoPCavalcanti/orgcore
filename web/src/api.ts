const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3333';

export class ErroApi extends Error {
  constructor(readonly status: number, readonly codigo: string, mensagem: string) {
    super(mensagem);
  }
}

export async function apiFetch<T>(caminho: string, init: RequestInit = {}): Promise<T> {
  const resp = await fetch(`${BASE}${caminho}`, {
    ...init,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...init.headers },
  });

  if (!resp.ok) {
    const corpo = await resp.json().catch(() => ({ codigo: 'erro', mensagem: 'Falha na requisição' }));
    throw new ErroApi(resp.status, corpo.codigo, corpo.mensagem);
  }
  return resp.json() as Promise<T>;
}
