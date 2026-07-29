const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3333';

// Métodos que o servidor protege com o token de dupla submissão (ver o preHandler
// em api/core/app.ts). Só neles o cookie `csrf` precisa ser ecoado no cabeçalho;
// sem isso, toda mutação autenticada — sair, encerrar sessão — leva 403, e o
// "sair" deixaria a sessão viva no backend enquanto a tela já mostra o login.
const METODOS_MUTANTES = new Set(['POST', 'PATCH', 'DELETE']);

export class ErroApi extends Error {
  constructor(readonly status: number, readonly codigo: string, mensagem: string) {
    super(mensagem);
  }
}

/**
 * Lê o cookie `csrf` — gravado sem `httpOnly` no login justamente para o front
 * poder repeti-lo aqui. Ausente (ainda não logou), devolve null e a requisição
 * segue sem o cabeçalho: quem decide se ele é obrigatório é o servidor.
 */
function tokenCsrf(): string | null {
  const achado = document.cookie.split('; ').find((c) => c.startsWith('csrf='));
  return achado ? decodeURIComponent(achado.slice('csrf='.length)) : null;
}

export async function apiFetch<T>(caminho: string, init: RequestInit = {}): Promise<T> {
  const cabecalhos: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) };

  // `content-type: application/json` SÓ quando há corpo. Uma mutação sem corpo
  // (sair, encerrar sessão) com esse cabeçalho faz o Fastify tentar parsear um
  // corpo vazio e responder 500 — o cabeçalho fixo mascarava isso atrás do 403 de
  // CSRF que vinha antes.
  if (init.body != null) cabecalhos['content-type'] = 'application/json';

  if (METODOS_MUTANTES.has((init.method ?? 'GET').toUpperCase())) {
    const csrf = tokenCsrf();
    if (csrf) cabecalhos['x-csrf-token'] = csrf;
  }

  const resp = await fetch(`${BASE}${caminho}`, {
    ...init,
    credentials: 'include',
    headers: cabecalhos,
  });

  if (!resp.ok) {
    const corpo = await resp.json().catch(() => ({ codigo: 'erro', mensagem: 'Falha na requisição' }));
    throw new ErroApi(resp.status, corpo.codigo, corpo.mensagem);
  }
  return resp.json() as Promise<T>;
}
