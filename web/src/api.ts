const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3333';

/**
 * URL absoluta de um recurso da API. Usada para carregar bytes binários direto no
 * `<img src>` / download (a imagem de um slide), que não passam pelo `apiFetch`
 * (este devolve JSON). O cookie de sessão vai junto: web e API são same-site
 * (mesmo `localhost`), então o `SameSite=Lax` não bloqueia o subrecurso.
 */
export const urlDaApi = (caminho: string): string => `${BASE}${caminho}`;

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

// Requisições GET idênticas ainda EM VOO compartilham a mesma promessa. O gatilho
// concreto: no dev o StrictMode remonta o efeito e dispara dois fetches iguais no
// mesmo tick — sem coalescer, cada um chega ao servidor e uma leitura sensível grava
// DUAS linhas `*.acessado` na trilha de auditoria ("clico uma vez, aparecem dois").
// Só GET entra aqui (idempotente); mutações nunca — coalescer dois POST engoliria uma
// ação real. A entrada some quando a requisição resolve, então acessos sequenciais
// (navegar, voltar) seguem gerando um registro cada — que é o comportamento correto.
const getEmVoo = new Map<string, Promise<unknown>>();

export async function apiFetch<T>(caminho: string, init: RequestInit = {}): Promise<T> {
  // Modo demonstração (GitHub Pages, sem backend): as respostas vêm de dados de
  // exemplo em vez da rede. Só entra sob o flag de build — o caminho normal segue
  // idêntico fora dele.
  if (import.meta.env.VITE_DEMO) {
    const { respostaDemo } = await import('./demo/dados');
    return respostaDemo<T>(caminho, init);
  }

  const metodo = (init.method ?? 'GET').toUpperCase();
  const coalescivel = metodo === 'GET' && init.body == null;
  if (coalescivel) {
    const emVoo = getEmVoo.get(caminho);
    if (emVoo) return emVoo as Promise<T>;
  }

  const promessa = executarFetch<T>(caminho, init);
  if (coalescivel) {
    getEmVoo.set(caminho, promessa);
    // Limpa ao resolver OU rejeitar, para não servir uma resposta velha depois nem
    // prender um caminho que falhou. Este é um ramo SEPARADO da promessa devolvida: o
    // `.catch` no fim é obrigatório — sem ele, um GET que falha viraria uma "unhandled
    // rejection" aqui (o erro real continua sendo entregue a quem chamou, via `promessa`).
    void promessa.finally(() => {
      if (getEmVoo.get(caminho) === promessa) getEmVoo.delete(caminho);
    }).catch(() => {});
  }
  return promessa;
}

async function executarFetch<T>(caminho: string, init: RequestInit): Promise<T> {
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
