import { ErroHttp } from '../erros';
import type { ProvedorAtivo } from './catalogo';
import type { DadosUso, PortaUso, StatusProvedor } from './uso';

export type Mensagem = { role: 'system' | 'user' | 'assistant'; content: unknown };
export type ResultadoLLM = { conteudo: string; provedorUsado: string };
export type OpcoesCompletar = { preferido?: string | undefined; jsonObject?: boolean | undefined; maxTokens?: number | undefined };

export type RespostaHttp = { ok: boolean; status: number; text(): Promise<string>; headers: { get(nome: string): string | null } };
export type FetchLike = (url: string, init: RequestInit) => Promise<RespostaHttp>;

export type ConfigCliente = {
  provedores: ProvedorAtivo[];
  uso: PortaUso;
  fetchImpl?: FetchLike | undefined;
  agora?: (() => number) | undefined;
  limiar?: number | undefined;
  /** Teto por chamada; um provedor lento é abortado e cai pro próximo. Padrão 30s. */
  timeoutMs?: number | undefined;
};

export interface ClienteLLM {
  completar(mensagens: Mensagem[], opcoes?: OpcoesCompletar): Promise<ResultadoLLM>;
  provedores(): Promise<StatusProvedor[]>;
  atualizarCotas(forcar: boolean): Promise<StatusProvedor[]>;
}

const indisponivel = () =>
  new ErroHttp(503, 'geracao_indisponivel', 'Nenhum provedor de IA disponível no momento. Tente novamente em instantes.');

type Chamada = { conteudo: string; truncado: boolean; uso: DadosUso };

/** Detecta anexos de imagem no payload (conteúdo multimodal do OpenAI: partes com type 'image_url'). */
function temImagem(mensagens: Mensagem[]): boolean {
  return mensagens.some(
    (m) => Array.isArray(m.content) && m.content.some((p) => (p as { type?: string }).type === 'image_url'),
  );
}

function lerUso(headers: RespostaHttp['headers']): DadosUso {
  const restante = headers.get('x-ratelimit-remaining-requests');
  const limite = headers.get('x-ratelimit-limit-requests');
  return {
    restante: restante != null ? Number(restante) : undefined,
    limite: limite != null ? Number(limite) : undefined,
  };
}

export function criarClienteLLM(cfg: ConfigCliente): ClienteLLM {
  const fetchImpl = cfg.fetchImpl ?? (fetch as unknown as FetchLike);
  const limiar = cfg.limiar ?? 8;

  async function chamar(p: ProvedorAtivo, mensagens: Mensagem[], opcoes: OpcoesCompletar): Promise<Chamada> {
    const controlador = new AbortController();
    const prazo = setTimeout(() => controlador.abort(), cfg.timeoutMs ?? 30_000);
    try {
      const resp = await fetchImpl(`${p.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${p.chave}` },
        body: JSON.stringify({
          model: p.modelo,
          ...(opcoes.jsonObject ? { response_format: { type: 'json_object' } } : {}),
          ...(opcoes.maxTokens ? { max_tokens: opcoes.maxTokens } : {}),
          messages: mensagens,
        }),
        signal: controlador.signal,
      });
      if (!resp.ok) throw new Error(`http_${resp.status}`);
      const corpo = JSON.parse(await resp.text()) as {
        choices?: { finish_reason?: string; message?: { content?: string } }[];
        usage?: { total_tokens?: number };
      };
      const escolha = corpo.choices?.[0];
      const tokens = corpo.usage?.total_tokens;
      return {
        conteudo: escolha?.message?.content ?? '',
        truncado: escolha?.finish_reason === 'length',
        uso: { ...(p.leHeaders ? lerUso(resp.headers) : {}), ...(tokens != null ? { tokens } : {}) },
      };
    } finally {
      clearTimeout(prazo);
    }
  }

  // Ordena: preferido primeiro, depois por % desc.
  async function ordenar(preferido?: string): Promise<{ p: ProvedorAtivo; pct: number }[]> {
    const status = await cfg.uso.status(cfg.provedores);
    const pct = new Map(status.map((s) => [s.id, s.percentual]));
    return cfg.provedores
      .map((p) => ({ p, pct: pct.get(p.id) ?? 100 }))
      .sort((a, b) => (a.p.id === preferido ? -1 : b.p.id === preferido ? 1 : b.pct - a.pct));
  }

  return {
    async completar(mensagens, opcoes = {}) {
      const ordenados = await ordenar(opcoes.preferido);
      // Tarefa com imagem só pode ir para provedor com visão — sobrepõe o preferido.
      const elegiveis = temImagem(mensagens) ? ordenados.filter((x) => x.p.visao) : ordenados;
      if (elegiveis.length === 0) throw indisponivel();
      // Proativo: prefere quem está acima do limiar; se ninguém, tenta todos mesmo assim.
      const acima = elegiveis.filter((x) => x.pct >= limiar);
      const candidatos = (acima.length > 0 ? acima : elegiveis).map((x) => x.p);

      let acumulado = '';
      for (const p of candidatos) {
        const efetivas: Mensagem[] = acumulado
          ? [...mensagens, { role: 'assistant', content: acumulado }, { role: 'user', content: 'Continue de onde parou, completando a resposta.' }]
          : mensagens;
        try {
          const r = await chamar(p, efetivas, opcoes);
          await cfg.uso.registrar(p.id, r.uso);
          if (r.truncado) { acumulado += r.conteudo; continue; }
          return { conteudo: acumulado + r.conteudo, provedorUsado: p.id };
        } catch {
          await cfg.uso.registrar(p.id, { restante: 0 });
        }
      }
      throw indisponivel();
    },

    async provedores() {
      return cfg.uso.status(cfg.provedores);
    },

    async atualizarCotas(forcar) {
      const agora = cfg.agora ?? Date.now;
      const status = await cfg.uso.status(cfg.provedores);
      const atualizadoEm = new Map(status.map((s) => [s.id, s.atualizadoEm]));
      for (const p of cfg.provedores) {
        if (!p.leHeaders) continue; // contagem local já é atual
        const em = atualizadoEm.get(p.id);
        const recente = em != null && agora() - new Date(em).getTime() < 5 * 60_000;
        if (!forcar && recente) continue;
        try {
          const r = await chamar(p, [{ role: 'user', content: 'ping' }], { maxTokens: 1 });
          await cfg.uso.registrar(p.id, r.uso);
        } catch {
          // sondagem é best-effort; ignora falha
        }
      }
      return cfg.uso.status(cfg.provedores);
    },
  };
}
